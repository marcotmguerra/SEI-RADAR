import { parseProcessosHtml } from '../shared/sei-parser';
import {
  obterConfiguracao,
  obterProcessos,
  salvarProcessos,
  salvarStatusSessao,
  salvarConfiguracao,
} from '../shared/storage';
import type { MensagemRuntime, ProcessoSei } from '../types';

const NOME_ALARME = 'sei_alarme_verificacao';

// Mapa em memória de notificações para URLs de destino
const linksNotificacoes = new Map<string, string>();

/**
 * Atualiza o badge do ícone da extensão com a contagem de não lidos
 */
const atualizarBadge = async (processos: ProcessoSei[]) => {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  const naoLidos = processos.filter((p) => !p.lido).length;
  await chrome.action.setBadgeText({
    text: naoLidos > 0 ? (naoLidos > 99 ? '99+' : String(naoLidos)) : '',
  });
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
};

/**
 * Dispara notificação nativa para um novo processo
 */
const notificarNovoProcesso = async (processo: ProcessoSei, somAtivo: boolean) => {
  if (typeof chrome === 'undefined' || !chrome.notifications) return;

  const idNotificacao = `sei_proc_${processo.numero}_${Date.now()}`;
  linksNotificacoes.set(idNotificacao, processo.link);

  const mensagem = processo.assunto
    ? `Assunto: ${processo.assunto}`
    : 'Novo processo recebido na unidade.';

  try {
    await chrome.notifications.create(idNotificacao, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: `🔔 Novo SEI: ${processo.numero}`,
      message: mensagem,
      priority: 2,
      silent: !somAtivo,
    });
  } catch (erro) {
    console.error('Erro ao criar notificação:', erro);
  }
};

/**
 * Atualiza a lista de processos salvos e dispara notificações se houver novidades
 */
const processarNovosProcessos = async (processosColetados: ProcessoSei[]) => {
  const config = await obterConfiguracao();
  const processosArmazenados = await obterProcessos();
  const mapaArmazenados = new Map(processosArmazenados.map((p) => [p.numero, p]));

  const novosProcessos: ProcessoSei[] = [];
  const listaAtualizada: ProcessoSei[] = [];

  for (const coletado of processosColetados) {
    const existente = mapaArmazenados.get(coletado.numero);
    if (!existente) {
      novosProcessos.push(coletado);
      listaAtualizada.push(coletado);
    } else {
      listaAtualizada.push({
        ...coletado,
        detectadoEm: existente.detectadoEm,
        lido: existente.lido,
        assunto: coletado.assunto || existente.assunto,
      });
    }
  }

  // Preserva processos já conhecidos que não vieram na listagem da página atual
  for (const proc of processosArmazenados) {
    if (!listaAtualizada.some((p) => p.numero === proc.numero)) {
      listaAtualizada.push(proc);
    }
  }

  await salvarProcessos(listaAtualizada);
  await salvarStatusSessao('conectado');
  await atualizarBadge(listaAtualizada);

  if (config.notificacoesAtivas && novosProcessos.length > 0) {
    if (novosProcessos.length > 3 && processosArmazenados.length === 0) {
      const idNotificacao = `sei_lote_${Date.now()}`;
      linksNotificacoes.set(idNotificacao, config.urlControle);
      await chrome.notifications.create(idNotificacao, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title: `🔔 SEI Conectado`,
        message: `${novosProcessos.length} processos encontrados na sua caixa do SEI.`,
        priority: 2,
      });
    } else {
      for (const novo of novosProcessos) {
        await notificarNovoProcesso(novo, config.somAtivo);
      }
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
          }>(aba.id, { tipo: 'EXTRAIR_DOM_SEI' });

          if (respostaTab && respostaTab.autenticado) {
            if (respostaTab.urlAtual && respostaTab.urlAtual.includes('controlador.php')) {
              await salvarConfiguracao({ urlControle: respostaTab.urlAtual });
            }
            const resultado = await processarNovosProcessos(respostaTab.processos || []);
            await salvarStatusSessao('conectado');
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
  // (ex.: página em transição logo após o login). Evita disparar uma requisição
  // paralela ao servidor nesse momento, pois isso pode colidir com a sessão real
  // da aba e derrubá-la. Aguarda a próxima verificação em vez de arriscar.
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
      return { sucesso: false, novos: 0, total: 0, mensagem: 'Faça login no SEI' };
    }

    const processosColetados = parseProcessosHtml(html, config.urlControle);
    const resultado = await processarNovosProcessos(processosColetados);
    await salvarStatusSessao('conectado');

    return {
      sucesso: true,
      novos: resultado.novos,
      total: resultado.total,
    };
  } catch (erro: any) {
    console.error('Erro na verificação do SEI:', erro);
    await salvarStatusSessao('erro');
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
          if (mensagem.urlAtual && mensagem.urlAtual.includes('controlador.php')) {
            await salvarConfiguracao({ urlControle: mensagem.urlAtual });
          }
          if (mensagem.autenticado || (Array.isArray(mensagem.processos) && mensagem.processos.length > 0)) {
            await processarNovosProcessos(mensagem.processos || []);
            await salvarStatusSessao('conectado');
          }
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
