import { parseProcessosHtml, extrairUsuarioLogado } from '../shared/sei-parser';
import {
  obterConfiguracao,
  obterProcessos,
  salvarProcessos,
  salvarStatusSessao,
  salvarConfiguracao,
} from '../shared/storage';
import type {
  ConfiguracaoExtensao,
  DetalheMarcador,
  MensagemRuntime,
  ProcessoSei,
  StatusSessao,
} from '../types';

const NOME_ALARME = 'sei_alarme_verificacao';

// Mapa em memória de notificações para URLs de destino
const linksNotificacoes = new Map<string, string>();

// Controle de cooldown para alertas de desconexão/instabilidade (máximo 1 a cada 30 min para o mesmo status)
let ultimoAlertaDesconexao: { status: StatusSessao; timestamp: number } | null = null;

/**
 * Atualiza o badge do ícone da extensão com a contagem de não lidos ou status de erro/desconexão
 */
const atualizarBadge = async (processos: ProcessoSei[], status: StatusSessao = 'conectado') => {
  if (typeof chrome === 'undefined' || !chrome.action) return;

  if (status === 'desconectado') {
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    return;
  }

  if (status === 'erro') {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    return;
  }

  const naoLidos = processos.filter((p) => !p.lido).length;
  await chrome.action.setBadgeText({
    text: naoLidos > 0 ? (naoLidos > 99 ? '99+' : String(naoLidos)) : '',
  });
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
};

const CAMINHO_OFFSCREEN = 'offscreen.html';

/**
 * Garante que o documento offscreen (necessário para tocar áudio a partir do
 * service worker, que não tem acesso a APIs de DOM) esteja aberto
 */
const garantirDocumentoOffscreen = async (): Promise<boolean> => {
  if (typeof chrome === 'undefined' || !chrome.offscreen) return false;

  try {
    const jaExiste = await chrome.offscreen.hasDocument();
    if (jaExiste) return true;

    await chrome.offscreen.createDocument({
      url: CAMINHO_OFFSCREEN,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Tocar alerta sonoro ao detectar novo processo ou marcador atualizado no SEI',
    });
    return true;
  } catch (erro) {
    console.error('Erro ao criar documento offscreen para áudio:', erro);
    return false;
  }
};

/**
 * Toca o alerta sonoro via documento offscreen. O campo "silent" das notificações
 * nativas do Chrome depende do daemon de notificação do SO (frequentemente mudo
 * em Linux), então o som real é gerado aqui via Web Audio API.
 */
const tocarAlertaSonoro = async (): Promise<void> => {
  const disponivel = await garantirDocumentoOffscreen();
  if (!disponivel) return;

  try {
    await chrome.runtime.sendMessage({ tipo: 'TOCAR_ALERTA_SONORO' });
  } catch (erro) {
    console.error('Erro ao solicitar reprodução do alerta sonoro:', erro);
  }
};

/**
 * Dispara notificação nativa quando a sessão expirar ou o SEI ficar instável
 */
const notificarDesconexaoOuInstabilidade = async (
  novoStatus: 'desconectado' | 'erro',
  config: ConfiguracaoExtensao,
  motivo?: string
) => {
  if (typeof chrome === 'undefined' || !chrome.notifications) return;
  if (!config.notificacoesAtivas) return;

  const agora = Date.now();
  // Cooldown de 30 minutos para evitar spam contínuo
  if (
    ultimoAlertaDesconexao &&
    ultimoAlertaDesconexao.status === novoStatus &&
    agora - ultimoAlertaDesconexao.timestamp < 30 * 60 * 1000
  ) {
    return;
  }

  ultimoAlertaDesconexao = { status: novoStatus, timestamp: agora };

  const idNotificacao = `sei_alerta_status_${novoStatus}_${agora}`;
  linksNotificacoes.set(idNotificacao, config.urlControle);

  const titulo =
    novoStatus === 'desconectado'
      ? '⚠️ Sessão do SEI Finalizada'
      : '⚠️ SEI Instável ou Indisponível';

  const mensagem =
    novoStatus === 'desconectado'
      ? 'Sua sessão no SEI expirou. Clique aqui para entrar novamente e manter o monitoramento ativo.'
      : motivo
      ? `Falha de conexão com o SEI (${motivo}). O sistema pode estar temporariamente fora do ar.`
      : 'Não foi possível conectar ao SEI. O sistema pode estar temporariamente fora do ar.';

  try {
    await chrome.notifications.create(idNotificacao, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: titulo,
      message: mensagem,
      priority: 2,
      silent: !config.somAtivo,
    });
    if (config.somAtivo) await tocarAlertaSonoro();
  } catch (erro) {
    console.error('Erro ao notificar desconexão/instabilidade:', erro);
  }
};

/**
 * Verifica se um processo deve disparar notificação conforme as preferências do usuário
 */
export const deveNotificarProcesso = (processo: ProcessoSei, config: ConfiguracaoExtensao): boolean => {
  if (!config.notificacoesAtivas) return false;

  if (config.regraNotificacao === 'todos') {
    return true;
  }

  const siglaConfigurada = (config.usuarioSigla || '').trim().toLowerCase();
  const atribuido = (processo.atribuidoPara || '').trim().toLowerCase();

  const ehAtribuidoAMim =
    siglaConfigurada.length > 0 &&
    atribuido.length > 0 &&
    (atribuido.includes(siglaConfigurada) || siglaConfigurada.includes(atribuido));

  if (config.regraNotificacao === 'atribuidos') {
    return ehAtribuidoAMim;
  }

  if (config.regraNotificacao === 'atribuidos_e_marcadores') {
    if (ehAtribuidoAMim) return true;
    if (Array.isArray(processo.marcadores) && Array.isArray(config.marcadoresNotificacao)) {
      const marcadoresInteresse = config.marcadoresNotificacao.map((m) => m.toLowerCase().trim());
      const temMarcador = processo.marcadores.some((m) =>
        marcadoresInteresse.includes(m.nome.toLowerCase().trim())
      );
      if (temMarcador) return true;
    }
    return false;
  }

  return true;
};

/**
 * Dispara notificação nativa para um novo processo
 */
const notificarNovoProcesso = async (processo: ProcessoSei, somAtivo: boolean) => {
  if (typeof chrome === 'undefined' || !chrome.notifications) return;

  const idNotificacao = `sei_proc_${processo.numero}_${Date.now()}`;
  linksNotificacoes.set(idNotificacao, processo.link);

  const tags: string[] = [];
  if (processo.atribuidoPara) {
    tags.push(`👤 ${processo.atribuidoPara}`);
  }
  if (processo.marcadores && processo.marcadores.length > 0) {
    tags.push(`🏷️ ${processo.marcadores.map((m) => m.nome).join(', ')}`);
  }

  let mensagem = processo.assunto
    ? `Assunto: ${processo.assunto}`
    : 'Novo processo recebido na unidade.';

  if (tags.length > 0) {
    mensagem = `${tags.join(' | ')}\n${mensagem}`;
  }

  try {
    await chrome.notifications.create(idNotificacao, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: `🔔 Novo SEI: ${processo.numero}`,
      message: mensagem,
      priority: 2,
      silent: !somAtivo,
    });
    if (somAtivo) await tocarAlertaSonoro();
  } catch (erro) {
    console.error('Erro ao criar notificação:', erro);
  }
};

/**
 * Compara os marcadores previamente salvos com os coletados na verificação atual
 * e retorna os marcadores novos ou com texto de observação/despacho alterado.
 * Ignora coletas vazias para evitar falso positivo quando o parsing de tooltip
 * falha momentaneamente e a página não retorna nenhum marcador.
 */
const detectarMarcadoresAlterados = (
  existentes: DetalheMarcador[] | undefined,
  coletados: DetalheMarcador[] | undefined
): DetalheMarcador[] => {
  if (!coletados || coletados.length === 0) return [];

  const mapaExistentes = new Map((existentes || []).map((m) => [m.nome, m]));
  const alterados: DetalheMarcador[] = [];

  for (const marcador of coletados) {
    const anterior = mapaExistentes.get(marcador.nome);
    if (!anterior || anterior.texto !== marcador.texto) {
      alterados.push(marcador);
    }
  }

  return alterados;
};

/**
 * Dispara notificação nativa quando um processo já conhecido ganha marcador novo ou alterado
 */
const notificarMarcadorAtualizado = async (
  processo: ProcessoSei,
  marcadoresAlterados: DetalheMarcador[],
  somAtivo: boolean
) => {
  if (typeof chrome === 'undefined' || !chrome.notifications) return;

  const idNotificacao = `sei_marcador_${processo.numero}_${Date.now()}`;
  linksNotificacoes.set(idNotificacao, processo.link);

  const nomes = marcadoresAlterados.map((m) => m.nome).join(', ');
  const mensagem = processo.assunto ? `🏷️ ${nomes}\n${processo.assunto}` : `🏷️ ${nomes}`;

  try {
    await chrome.notifications.create(idNotificacao, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: `Marcador Atualizado: ${processo.numero}`,
      message: mensagem,
      priority: 2,
      silent: !somAtivo,
    });
    if (somAtivo) await tocarAlertaSonoro();
  } catch (erro) {
    console.error('Erro ao criar notificação de marcador atualizado:', erro);
  }
};

/**
 * Atualiza a lista de processos salvos e dispara notificações se houver novidades
 */
const processarNovosProcessos = async (processosColetados: ProcessoSei[]) => {
  const config = await obterConfiguracao();
  const processosArmazenados = await obterProcessos();
  const mapaArmazenados = new Map(processosArmazenados.map((p) => [p.numero, p]));
  const agora = new Date().toISOString();

  const novosProcessos: ProcessoSei[] = [];
  const processosComMarcadorAtualizado: { processo: ProcessoSei; alterados: DetalheMarcador[] }[] = [];
  const listaAtualizada: ProcessoSei[] = [];

  for (const coletado of processosColetados) {
    const existente = mapaArmazenados.get(coletado.numero);
    if (!existente) {
      novosProcessos.push(coletado);
      listaAtualizada.push(coletado);
      continue;
    }

    const marcadoresAlterados = detectarMarcadoresAlterados(existente.marcadores, coletado.marcadores);
    const marcadoresFinais =
      coletado.marcadores && coletado.marcadores.length > 0
        ? coletado.marcadores
        : existente.marcadores;

    const processoAtualizado: ProcessoSei = {
      ...coletado,
      detectadoEm: existente.detectadoEm,
      lido: marcadoresAlterados.length > 0 ? false : existente.lido,
      assunto: coletado.assunto || existente.assunto,
      atribuidoPara: coletado.atribuidoPara || existente.atribuidoPara,
      marcadores: marcadoresFinais,
      ...(marcadoresAlterados.length > 0
        ? { atualizadoEm: agora, motivoAtualizacao: 'Marcador alterado' }
        : {}),
    };

    listaAtualizada.push(processoAtualizado);

    if (marcadoresAlterados.length > 0) {
      processosComMarcadorAtualizado.push({ processo: processoAtualizado, alterados: marcadoresAlterados });
    }
  }

  // Preserva processos já conhecidos que não vieram na listagem da página atual
  for (const proc of processosArmazenados) {
    if (!listaAtualizada.some((p) => p.numero === proc.numero)) {
      listaAtualizada.push(proc);
    }
  }

  const ehPrimeiraCarga = !config.primeiraCargaRealizada && processosArmazenados.length === 0;

  await salvarProcessos(listaAtualizada);
  await salvarStatusSessao('conectado');
  ultimoAlertaDesconexao = null;
  await atualizarBadge(listaAtualizada, 'conectado');

  if (ehPrimeiraCarga) {
    await salvarConfiguracao({ primeiraCargaRealizada: true });
    // Na primeira carga histórica, NÃO dispara notificações desktop ("Os SEIs que já estavam não sobem")
    return { novos: 0, total: listaAtualizada.length };
  }

  if (config.notificacoesAtivas && processosComMarcadorAtualizado.length > 0) {
    for (const { processo, alterados } of processosComMarcadorAtualizado) {
      await notificarMarcadorAtualizado(processo, alterados, config.somAtivo);
    }
  }

  if (config.notificacoesAtivas && novosProcessos.length > 0) {
    const processosParaNotificar = novosProcessos.filter((p) => deveNotificarProcesso(p, config));

    for (const novo of processosParaNotificar) {
      await notificarNovoProcesso(novo, config.somAtivo);
    }
  }

  return { novos: novosProcessos.length, total: listaAtualizada.length };
};

/**
 * Executa a checagem no SEI:
 * 1. Primeiro tenta comunicar com abas abertas do SEI.
 * 2. Caso não haja abas abertas, faz fetch direto com credenciais de sessão.
 */
export const executarVerificacaoSei = async (): Promise<{
  sucesso: boolean;
  novos: number;
  total: number;
  mensagem?: string;
}> => {
  const config = await obterConfiguracao();

  // 1. Tenta obter dados de alguma aba ativa do SEI
  let existeAbaSei = false;
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const abas = await chrome.tabs.query({});
      const abasSei = abas.filter(
        (a) => a.id && a.url && (a.url.includes('sei') || a.url.includes('controlador.php'))
      );
      existeAbaSei = abasSei.length > 0;

      for (const aba of abasSei) {
        if (!aba.id) continue;
        try {
          const respostaTab = await chrome.tabs.sendMessage<{
            tipo: string;
          }, {
            autenticado: boolean;
            processos: ProcessoSei[];
            urlAtual?: string;
            usuarioLogado?: string;
          }>(aba.id, { tipo: 'EXTRAIR_DOM_SEI' });

          if (respostaTab && respostaTab.autenticado) {
            const atualizacoes: Partial<ConfiguracaoExtensao> = {};
            if (respostaTab.urlAtual && respostaTab.urlAtual.includes('controlador.php')) {
              atualizacoes.urlControle = respostaTab.urlAtual;
            }
            if (respostaTab.usuarioLogado && !config.usuarioSigla) {
              atualizacoes.usuarioSigla = respostaTab.usuarioLogado;
            }
            if (Object.keys(atualizacoes).length > 0) {
              await salvarConfiguracao(atualizacoes);
            }
            const resultado = await processarNovosProcessos(respostaTab.processos || []);
            await salvarStatusSessao('conectado');
            ultimoAlertaDesconexao = null;
            return { sucesso: true, novos: resultado.novos, total: resultado.total };
          }
        } catch {
          // Aba pode ainda não ter o content script injetado ou estar carregando
        }
      }
    } catch (e) {
      console.debug('Erro ao inspecionar abas abertas:', e);
    }
  }

  // Já existe uma aba do SEI aberta, mas nenhuma respondeu como autenticada ainda
  if (existeAbaSei) {
    return { sucesso: false, novos: 0, total: 0, mensagem: 'Aguardando página do SEI carregar' };
  }

  // 2. Não há nenhuma aba do SEI aberta: faz requisição HTTP direta com cookies de sessão
  try {
    const resposta = await fetch(config.urlControle, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml',
      },
    });

    if (!resposta.ok) {
      await salvarStatusSessao('desconectado');
      await notificarDesconexaoOuInstabilidade('desconectado', config, `HTTP ${resposta.status}`);
      const processosArmazenados = await obterProcessos();
      await atualizarBadge(processosArmazenados, 'desconectado');
      return { sucesso: false, novos: 0, total: 0, mensagem: `HTTP ${resposta.status}` };
    }

    const html = await resposta.text();

    // Verifica se caiu em tela de login
    const isLogin =
      html.includes('txtUsuario') ||
      html.includes('txtSenha') ||
      html.includes('formLogin') ||
      html.includes('Sessão finalizada') ||
      html.includes('Informe seu usuário e senha');

    if (isLogin) {
      await salvarStatusSessao('desconectado');
      await notificarDesconexaoOuInstabilidade('desconectado', config);
      const processosArmazenados = await obterProcessos();
      await atualizarBadge(processosArmazenados, 'desconectado');
      return { sucesso: false, novos: 0, total: 0, mensagem: 'Faça login no SEI' };
    }

    const usuarioLogado = extrairUsuarioLogado(html);
    if (usuarioLogado && !config.usuarioSigla) {
      await salvarConfiguracao({ usuarioSigla: usuarioLogado });
    }

    const processosColetados = parseProcessosHtml(html, config.urlControle);
    const resultado = await processarNovosProcessos(processosColetados);
    await salvarStatusSessao('conectado');
    ultimoAlertaDesconexao = null;

    return {
      sucesso: true,
      novos: resultado.novos,
      total: resultado.total,
    };
  } catch (erro: any) {
    console.error('Erro na verificação do SEI:', erro);
    await salvarStatusSessao('erro');
    await notificarDesconexaoOuInstabilidade('erro', config, erro?.message);
    const processosArmazenados = await obterProcessos();
    await atualizarBadge(processosArmazenados, 'erro');
    return {
      sucesso: false,
      novos: 0,
      total: 0,
      mensagem: erro?.message || 'Falha de conexão com o SEI',
    };
  }
};

/**
 * Abre ou foca a aba do SEI no navegador
 */
const abrirOuFocarAbaSei = async (urlDestino?: string) => {
  const config = await obterConfiguracao();
  const url = urlDestino || config.urlControle;

  if (typeof chrome === 'undefined' || !chrome.tabs) return;

  const abas = await chrome.tabs.query({});
  const abaSei = abas.find((aba) => aba.url && (aba.url.includes('sei') || aba.url.includes('controlador.php')));

  if (abaSei && abaSei.id) {
    if (urlDestino && abaSei.url !== urlDestino) {
      await chrome.tabs.update(abaSei.id, { active: true, url: urlDestino });
    } else {
      await chrome.tabs.update(abaSei.id, { active: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
};

/**
 * Configura o alarme periódico do Chrome
 */
const configurarAlarme = async () => {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;
  const config = await obterConfiguracao();
  await chrome.alarms.clear(NOME_ALARME);
  chrome.alarms.create(NOME_ALARME, {
    periodInMinutes: Math.max(1, config.intervaloMinutos),
  });
};

// Inicialização de eventos
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled?.addListener(async () => {
    await configurarAlarme();
    await executarVerificacaoSei();
  });

  chrome.alarms?.onAlarm?.addListener(async (alarme) => {
    if (alarme.name === NOME_ALARME) {
      await executarVerificacaoSei();
    }
  });

  chrome.notifications?.onClicked?.addListener(async (notificationId) => {
    const link = linksNotificacoes.get(notificationId);
    if (link) {
      await abrirOuFocarAbaSei(link);
      linksNotificacoes.delete(notificationId);
    } else {
      await abrirOuFocarAbaSei();
    }
  });

  chrome.runtime.onMessage?.addListener((mensagem: MensagemRuntime, _sender, sendResponse) => {
    (async () => {
      switch (mensagem.tipo) {
        case 'VERIFICAR_AGORA': {
          const res = await executarVerificacaoSei();
          sendResponse(res);
          break;
        }
        case 'ABRIR_SEI': {
          await abrirOuFocarAbaSei(mensagem.url);
          sendResponse({ ok: true });
          break;
        }
        case 'TESTAR_NOTIFICACAO': {
          const config = await obterConfiguracao();
          await notificarNovoProcesso(
            {
              numero: '1400.01.000142/2026-18',
              assunto: 'Manutenção preventiva de viatura operacional (Exemplo de Teste)',
              link: config.urlControle,
              detectadoEm: new Date().toISOString(),
              lido: false,
              atribuidoPara: config.usuarioSigla || 'MG123456',
              marcadores: [{ nome: 'Urgente' }, { nome: 'Manutenção' }],
            },
            config.somAtivo
          );
          sendResponse({ ok: true });
          break;
        }
        case 'SALVAR_CONFIGURACAO': {
          await salvarConfiguracao(mensagem.configuracao);
          await configurarAlarme();
          sendResponse({ ok: true });
          break;
        }
        case 'NOTIFICAR_PAGINA_SEI_CARREGADA': {
          const atualizacoesConfig: Partial<ConfiguracaoExtensao> = {};
          if (mensagem.urlAtual && mensagem.urlAtual.includes('controlador.php')) {
            atualizacoesConfig.urlControle = mensagem.urlAtual;
          }
          if (mensagem.usuarioLogado) {
            const configAtual = await obterConfiguracao();
            if (!configAtual.usuarioSigla) {
              atualizacoesConfig.usuarioSigla = mensagem.usuarioLogado;
            }
          }
          if (Object.keys(atualizacoesConfig).length > 0) {
            await salvarConfiguracao(atualizacoesConfig);
          }
          if (mensagem.autenticado || (Array.isArray(mensagem.processos) && mensagem.processos.length > 0)) {
            await processarNovosProcessos(mensagem.processos || []);
            await salvarStatusSessao('conectado');
          }
          sendResponse({ ok: true });
          break;
        }
        case 'TOCAR_ALERTA_SONORO': {
          // Tratada pelo documento offscreen; o service worker pode receber o eco da própria mensagem
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, erro: 'Ação não reconhecida' });
      }
    })();
    return true; // Mantém o canal aberto para resposta assíncrona
  });
}
