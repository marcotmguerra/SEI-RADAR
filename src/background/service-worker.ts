import {
  obterConfiguracao,
  obterProcessos,
  salvarProcessos,
  salvarStatusSessao,
  salvarConfiguracao,
  salvarMarcadoresDisponiveis,
  salvarAndamentos,
  limparAndamentos,
} from '../shared/storage';
import {
  processoPertenceAoRadar,
  filtrarProcessosPorRadar,
} from '../shared/radar';
import { possuiPermissaoParaUrl } from '../shared/permissoes';
import { ehTelaDeLogin } from '../shared/sei-parser';
import {
  descreverFalhaAndamento,
  extrairUrlsDeFramesNoTexto,
  procurarAndamento,
  resumirAndamento,
} from '../shared/andamento-parser';
import type { AnaliseAndamento } from '../shared/andamento-parser';
import { executarEmFila } from '../shared/fila-requisicoes';
import { lerHtmlDaResposta } from '../shared/http-sei';
import type {
  AndamentoProcesso,
  ConfiguracaoExtensao,
  DetalheMarcador,
  MensagemRuntime,
  ProcessoSei,
  ReferenciaProcesso,
  ResultadoBuscaAndamento,
  ResultadoParseHtmlSei,
  ResultadoVerificacaoSei,
  ResumoAndamento,
  StatusSessao,
} from '../types';

/** O que o documento offscreen devolve ao analisar uma página de histórico */
type AnaliseAndamentoRemota = AnaliseAndamento & { truncado: boolean };

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
 * Garante que o documento offscreen esteja aberto. É necessário porque o
 * service worker do Manifest V3 não tem acesso a APIs de DOM: nem para tocar
 * o radar sonoro, nem para usar o DOMParser exigido ao interpretar o HTML do
 * SEI quando não há nenhuma aba aberta (fallback via fetch direto).
 */
const garantirDocumentoOffscreen = async (): Promise<boolean> => {
  if (typeof chrome === 'undefined' || !chrome.offscreen) return false;

  try {
    const jaExiste = await chrome.offscreen.hasDocument();
    if (jaExiste) return true;

    await chrome.offscreen.createDocument({
      url: CAMINHO_OFFSCREEN,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK, chrome.offscreen.Reason.DOM_PARSER],
      justification:
        'Tocar radar sonoro ao detectar novidades e interpretar o HTML do SEI com DOMParser quando não há aba aberta',
    });
    return true;
  } catch (erro) {
    console.error('Erro ao criar documento offscreen:', erro);
    return false;
  }
};

/**
 * Interpreta o HTML da página de controle do SEI delegando ao documento
 * offscreen, já que o service worker não tem acesso a DOMParser
 */
const interpretarHtmlSei = async (html: string, urlBase: string): Promise<ResultadoParseHtmlSei> => {
  const vazio: ResultadoParseHtmlSei = {
    processos: [],
    usuarioLogado: null,
    unidadeAtual: null,
    marcadoresDisponiveis: [],
  };

  const disponivel = await garantirDocumentoOffscreen();
  if (!disponivel) return vazio;

  try {
    const resposta = await chrome.runtime.sendMessage<MensagemRuntime, ResultadoParseHtmlSei>({
      tipo: 'PARSEAR_HTML_SEI',
      html,
      urlBase,
    });
    return resposta || vazio;
  } catch (erro) {
    console.error('Erro ao interpretar HTML do SEI via documento offscreen:', erro);
    return vazio;
  }
};

/**
 * Toca o radar sonoro via documento offscreen. O campo "silent" das notificações
 * nativas do Chrome depende do daemon de notificação do SO (frequentemente mudo
 * em Linux), então o som real é gerado aqui via Web Audio API.
 */
const tocarAlertaSonoro = async (): Promise<void> => {
  const disponivel = await garantirDocumentoOffscreen();
  if (!disponivel) return;

  try {
    await chrome.runtime.sendMessage({ tipo: 'TOCAR_ALERTA_SONORO' });
  } catch (erro) {
    console.error('Erro ao solicitar reprodução do radar sonoro:', erro);
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
/** Máximo de notificações individuais por ciclo; o excedente vira um único resumo */
const LIMITE_NOTIFICACOES_POR_CICLO = 4;

/**
 * Emite notificação de resumo quando há mais itens do que o limite por ciclo.
 * Evita que o usuário tenha que fechar dezenas de avisos na mão.
 */
const notificarResumo = async (titulo: string, mensagem: string, somAtivo: boolean) => {
  if (typeof chrome === 'undefined' || !chrome.notifications) return;

  try {
    await chrome.notifications.create(`sei-resumo-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: titulo,
      message: mensagem,
      priority: 1,
      silent: true,
    });
    if (somAtivo) await tocarAlertaSonoro();
  } catch (erro) {
    console.error('Erro ao emitir notificação de resumo:', erro);
  }
};

/**
 * Notifica no máximo `LIMITE_NOTIFICACOES_POR_CICLO` itens e resume o restante
 */
const notificarEmLote = async <T>(
  itens: T[],
  notificarItem: (item: T) => Promise<void>,
  notificarRestantes: (restantes: number) => Promise<void>
) => {
  const individuais = itens.slice(0, LIMITE_NOTIFICACOES_POR_CICLO);
  for (const item of individuais) {
    await notificarItem(item);
  }

  const restantes = itens.length - individuais.length;
  if (restantes > 0) {
    await notificarRestantes(restantes);
  }
};

/**
 * Serializa o processamento de coletas.
 *
 * O content script empurra NOTIFICAR_PAGINA_SEI_CARREGADA a cada mutação da página,
 * e o alarme também dispara verificações. Sem fila, duas execuções simultâneas fazem
 * ler-modificar-gravar sobre o mesmo storage: uma lê a lista ainda vazia depois que a
 * outra já marcou a primeira carga como concluída, e todo o histórico vira notificação.
 */
let filaProcessamento: Promise<unknown> = Promise.resolve();

const emSerie = <R>(tarefa: () => Promise<R>): Promise<R> => {
  const proxima = filaProcessamento.then(tarefa, tarefa);
  // Mantém a corrente viva mesmo se esta tarefa falhar
  filaProcessamento = proxima.catch(() => undefined);
  return proxima;
};

const processarColeta = async (processosColetados: ProcessoSei[]) => {
  const config = await obterConfiguracao();
  const processosArmazenados = await obterProcessos();
  const mapaArmazenados = new Map(processosArmazenados.map((p) => [p.numero, p]));
  const agora = new Date().toISOString();

  // Coleta e salva marcadores disponíveis encontrados em todos os processos da página
  const marcadoresEncontrados: string[] = [];
  for (const p of processosColetados) {
    if (p.marcadores) {
      for (const m of p.marcadores) {
        if (m.nome) marcadoresEncontrados.push(m.nome);
      }
    }
  }
  if (marcadoresEncontrados.length > 0) {
    await salvarMarcadoresDisponiveis(marcadoresEncontrados);
  }

  // Filtra os processos coletados conforme o escopo do Radar pessoal
  const processosDoRadar = processosColetados.filter((p) => processoPertenceAoRadar(p, config));

  const novosProcessos: ProcessoSei[] = [];
  const processosComMarcadorAtualizado: { processo: ProcessoSei; alterados: DetalheMarcador[] }[] = [];
  const listaAtualizada: ProcessoSei[] = [];

  for (const coletado of processosDoRadar) {
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
      // `null` (desatribuído no SEI) precisa sobrescrever; só `undefined` (leitura
      // inconclusiva) preserva o valor anterior
      atribuidoPara:
        coletado.atribuidoPara !== undefined ? coletado.atribuidoPara : existente.atribuidoPara,
      prazo: coletado.prazo !== undefined ? coletado.prazo : existente.prazo,
      prazoTexto: coletado.prazo !== undefined ? coletado.prazoTexto : existente.prazoTexto,
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

  // Preserva processos já conhecidos que não vieram na listagem da página atual, desde que ainda pertençam ao radar
  for (const proc of processosArmazenados) {
    if (
      !listaAtualizada.some((p) => p.numero === proc.numero) &&
      processoPertenceAoRadar(proc, config)
    ) {
      listaAtualizada.push(proc);
    }
  }

  // A primeira sincronização é apenas o retrato inicial do que já existia no SEI:
  // ela nunca notifica. Só o que aparecer depois dela vira notificação.
  //
  // A checagem antiga também exigia que o armazenamento estivesse vazio, o que
  // falhava quando uma coleta anterior já havia gravado algo — e aí a carga
  // histórica inteira virava notificação de uma vez.
  // Duas situações são "retrato inicial", e nenhuma delas notifica:
  //  - a primeira carga ainda não foi feita;
  //  - não havia nada guardado, então não existe passado com que comparar e
  //    nada pode ser considerado novidade (caso de instalação nova, "Limpar"
  //    e troca de escopo do Radar).
  const ehPrimeiraCarga = !config.primeiraCargaRealizada || processosArmazenados.length === 0;

  await salvarProcessos(listaAtualizada);
  await salvarStatusSessao('conectado');
  ultimoAlertaDesconexao = null;
  await atualizarBadge(listaAtualizada, 'conectado');

  if (ehPrimeiraCarga) {
    await salvarConfiguracao({ primeiraCargaRealizada: true });
    return { novos: 0, total: listaAtualizada.length };
  }

  if (config.notificacoesAtivas && processosComMarcadorAtualizado.length > 0) {
    await notificarEmLote(
      processosComMarcadorAtualizado,
      ({ processo, alterados }) => notificarMarcadorAtualizado(processo, alterados, config.somAtivo),
      (restantes) =>
        notificarResumo(
          'Etiquetas atualizadas',
          `Mais ${restantes} processos tiveram etiquetas alteradas.`,
          config.somAtivo
        )
    );
  }

  if (config.notificacoesAtivas && novosProcessos.length > 0) {
    const processosParaNotificar = novosProcessos.filter((p) => deveNotificarProcesso(p, config));

    await notificarEmLote(
      processosParaNotificar,
      (novo) => notificarNovoProcesso(novo, config.somAtivo),
      (restantes) =>
        notificarResumo(
          'Novos processos no Radar',
          `Mais ${restantes} processos novos chegaram. Abra o Radar para ver a lista.`,
          config.somAtivo
        )
    );
  }

  return { novos: novosProcessos.length, total: listaAtualizada.length };
};

/**
 * Processa uma coleta do SEI, garantindo que apenas uma execução ocorra por vez
 */
const processarNovosProcessos = (
  processosColetados: ProcessoSei[]
): Promise<{ novos: number; total: number }> => emSerie(() => processarColeta(processosColetados));

/**
 * Executa a checagem no SEI:
 * 1. Primeiro tenta comunicar com abas abertas do SEI.
 * 2. Caso não haja abas abertas, faz fetch direto com credenciais de sessão.
 */
export const executarVerificacaoSei = async (): Promise<ResultadoVerificacaoSei> => {
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
            unidadeAtual?: string;
            marcadoresDisponiveis?: string[];
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
            if (
              Array.isArray(respostaTab.marcadoresDisponiveis) &&
              respostaTab.marcadoresDisponiveis.length > 0
            ) {
              await salvarMarcadoresDisponiveis(respostaTab.marcadoresDisponiveis);
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

  // 2. Não há nenhuma aba do SEI aberta: faz requisição HTTP direta com cookies de sessão.
  // Requer permissão de host concedida em tempo de execução para a origem configurada
  // (chrome.permissions), já que host_permissions não é mais fixo em *://*/* no manifesto.
  const temPermissaoDeHost = await possuiPermissaoParaUrl(config.urlControle);
  if (!temPermissaoDeHost) {
    return {
      sucesso: false,
      novos: 0,
      total: 0,
      mensagem:
        'Sem permissão para verificar em segundo plano. Mantenha uma aba do SEI aberta, ou conceda acesso à URL do SEI nas configurações para sincronizar sem precisar de aba aberta.',
      semPermissao: true,
    };
  }

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

    const html = await lerHtmlDaResposta(resposta);

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

    const {
      processos: processosColetados,
      usuarioLogado,
      marcadoresDisponiveis: marcadoresNaPagina,
    } = await interpretarHtmlSei(html, config.urlControle);

    if (usuarioLogado && !config.usuarioSigla) {
      await salvarConfiguracao({ usuarioSigla: usuarioLogado });
    }

    if (marcadoresNaPagina.length > 0) {
      await salvarMarcadoresDisponiveis(marcadoresNaPagina);
    }

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
 * Consulta o andamento de uma lista de processos.
 *
 * 1. Caminho preferencial: delega a uma aba do SEI aberta, onde o content script faz
 *    requisições de mesma origem sem exigir permissão de host.
 * 2. Sem aba aberta, faz as requisições daqui, o que depende da permissão opcional
 *    de host concedida pelo usuário, e interpreta o HTML no documento offscreen.
 */
export const buscarAndamentos = async (
  referencias: ReferenciaProcesso[]
): Promise<ResultadoBuscaAndamento> => {
  if (!Array.isArray(referencias) || referencias.length === 0) {
    return { sucesso: true, andamentos: [] };
  }

  const config = await obterConfiguracao();

  // 1. Tenta via aba aberta do SEI
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const abas = await chrome.tabs.query({});
      const abasSei = abas.filter(
        (a) => a.id && a.url && (a.url.includes('sei') || a.url.includes('controlador.php'))
      );

      for (const aba of abasSei) {
        if (!aba.id) continue;
        try {
          const resposta = await chrome.tabs.sendMessage<MensagemRuntime, ResultadoBuscaAndamento>(
            aba.id,
            { tipo: 'BUSCAR_ANDAMENTO', processos: referencias }
          );
          if (resposta?.sucesso && Array.isArray(resposta.andamentos)) {
            await salvarAndamentos(resposta.andamentos);
            return resposta;
          }
        } catch {
          // Aba sem content script ativo; tenta a próxima
        }
      }
    } catch (erro) {
      console.debug('Erro ao consultar abas para andamento:', erro);
    }
  }

  // 2. Requisição direta, dependente da permissão opcional de host
  const temPermissao = await possuiPermissaoParaUrl(config.urlControle);
  if (!temPermissao) {
    return {
      sucesso: false,
      andamentos: [],
      semPermissao: true,
      mensagem:
        'Para consultar o andamento sem aba do SEI aberta, conceda acesso à URL do SEI nas configurações. Como alternativa, mantenha uma aba do SEI aberta.',
    };
  }

  const disponivel = await garantirDocumentoOffscreen();
  if (!disponivel) {
    return { sucesso: false, andamentos: [], mensagem: 'Não foi possível interpretar o andamento.' };
  }

  const baixar = async (url: string): Promise<string> => {
    const resposta = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml' },
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    // O SEI responde em ISO-8859-1; text() corromperia os acentos
    return lerHtmlDaResposta(resposta);
  };

  const resultados = await executarEmFila(
    referencias,
    async (referencia): Promise<AndamentoProcesso> => {
      const base: AndamentoProcesso = {
        numero: referencia.numero,
        unidadeGeradora: null,
        enviadoPorUnidade: null,
        dataEnvio: null,
        atualizadoEmSei: null,
        linhas: [],
        coletadoEm: new Date().toISOString(),
      };

      // Mesma travessia do content script: desce pelos frames e segue o link do
      // histórico. A diferença é só o parse, que aqui vai para o documento
      // offscreen, já que o service worker não tem DOMParser.
      // Cada página é analisada uma vez só: `procurarAndamento` pede as linhas e,
      // quando não vêm, o diagnóstico do mesmo HTML. Repetir a ida ao documento
      // offscreen seria trabalho puro.
      let ultima: { html: string; analise: AnaliseAndamentoRemota } | null = null;

      // Guardado à parte porque só a página que de fato trouxe a tabela diz se o
      // histórico veio cortado — e é isso que impede afirmar uma unidade geradora errada
      const tabelaLida = { truncado: false };

      const analisarViaOffscreen = async (html: string): Promise<AnaliseAndamentoRemota> => {
        if (ultima?.html === html) return ultima.analise;

        const resposta = await chrome.runtime.sendMessage<MensagemRuntime, AnaliseAndamentoRemota>({
          tipo: 'PARSEAR_ANDAMENTO_HTML',
          html,
          urlBase: referencia.link,
        });

        const analise: AnaliseAndamentoRemota = {
          linhas: Array.isArray(resposta?.linhas) ? resposta.linhas : [],
          tabelaEncontrada: Boolean(resposta?.tabelaEncontrada),
          linhasBrutas: Number(resposta?.linhasBrutas) || 0,
          tabelas: Number(resposta?.tabelas) || 0,
          truncado: Boolean(resposta?.truncado),
        };

        ultima = { html, analise };
        if (analise.linhas.length > 0) tabelaLida.truncado = analise.truncado;
        return analise;
      };

      const busca = await procurarAndamento(referencia.link, {
        baixar,
        extrairFrames: extrairUrlsDeFramesNoTexto,
        ehLogin: ehTelaDeLogin,
        parsearLinhas: async (html) => (await analisarViaOffscreen(html)).linhas,
        analisar: analisarViaOffscreen,
      });

      if (busca.sessaoExpirada) {
        return { ...base, erro: 'Sessão do SEI expirada. Faça login novamente.' };
      }

      if (busca.linhas.length === 0) {
        return {
          ...base,
          ...(busca.linkTentado ? { linkAndamento: busca.linkTentado } : {}),
          erro: descreverFalhaAndamento(busca),
        };
      }

      return {
        ...base,
        ...resumirAndamento(busca.linhas, undefined, tabelaLida.truncado),
        ...(busca.linkAndamento ? { linkAndamento: busca.linkAndamento } : {}),
      };
    },
    { concorrencia: 2, intervaloMs: 400, timeoutMs: 15000 }
  );

  const andamentos = resultados.map(
    ({ item, resultado, erro }) =>
      resultado ?? {
        numero: item.numero,
        unidadeGeradora: null,
        enviadoPorUnidade: null,
        dataEnvio: null,
        atualizadoEmSei: null,
        linhas: [],
        coletadoEm: new Date().toISOString(),
        erro: erro || 'Falha ao consultar o andamento.',
      }
  );

  await salvarAndamentos(andamentos);
  return { sucesso: true, andamentos };
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
    const config = await obterConfiguracao();
    if (config.radarOnboardingConcluido) {
      await executarVerificacaoSei();
    }
  });

  chrome.alarms?.onAlarm?.addListener(async (alarme) => {
    if (alarme.name === NOME_ALARME) {
      const config = await obterConfiguracao();
      if (config.radarOnboardingConcluido) {
        await executarVerificacaoSei();
      }
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
          const configAnterior = await obterConfiguracao();
          const novaConfig = await salvarConfiguracao(mensagem.configuracao);
          await configurarAlarme();

          const escopoMudou =
            configAnterior.escopoRadar !== novaConfig.escopoRadar ||
            configAnterior.usuarioSigla !== novaConfig.usuarioSigla ||
            JSON.stringify(configAnterior.marcadoresRadar || []) !==
              JSON.stringify(novaConfig.marcadoresRadar || []);

          if (escopoMudou) {
            // Tudo em série e com o silêncio marcado ANTES de mexer na lista: o content
            // script empurra coletas a qualquer momento, e uma que chegasse entre o
            // esvaziamento da lista e a marcação veria "lista vazia + carga já feita",
            // tratando todo o histórico do novo escopo como novidade.
            await emSerie(async () => {
              await salvarConfiguracao({ primeiraCargaRealizada: false });

              // Remove do armazenamento local os processos que deixaram de pertencer ao novo radar
              const processosAtuais = await obterProcessos();
              const filtrados = filtrarProcessosPorRadar(processosAtuais, novaConfig);
              await salvarProcessos(filtrados);
              await atualizarBadge(filtrados, 'conectado');
            });

            await executarVerificacaoSei();
          }

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
          if (
            Array.isArray(mensagem.marcadoresDisponiveis) &&
            mensagem.marcadoresDisponiveis.length > 0
          ) {
            await salvarMarcadoresDisponiveis(mensagem.marcadoresDisponiveis);
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
        case 'PARSEAR_HTML_SEI': {
          // Tratada exclusivamente pelo documento offscreen (depende de DOMParser,
          // indisponível no service worker). Não responde aqui para não competir
          // com a resposta real do documento offscreen.
          break;
        }
        case 'BUSCAR_ANDAMENTO': {
          const resultado = await buscarAndamentos(mensagem.processos || []);
          sendResponse(resultado);
          break;
        }

        case 'PARSEAR_ANDAMENTO_HTML': {
          // Tratada exclusivamente pelo documento offscreen (depende de DOMParser).
          // O service worker recebe o eco da própria mensagem e não deve responder,
          // sob risco de competir com a resposta real.
          break;
        }

        case 'LIMPAR_PROCESSOS': {
          await salvarProcessos([]);
          await limparAndamentos();
          await atualizarBadge([], 'conectado');
          // Evita que a próxima sincronização notifique o histórico recoletado
          await salvarConfiguracao({ primeiraCargaRealizada: false });
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
