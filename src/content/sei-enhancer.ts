import {
  parseProcessosHtml,
  extrairUsuarioLogado,
  extrairUnidadeAtual,
  extrairTodosMarcadoresDaPagina,
  ehTelaDeLogin,
} from '../shared/sei-parser';
import {
  extrairUrlsDeFrames,
  analisarAndamentoHtml,
  descreverFalhaAndamento,
  historicoEstaTruncado,
  parseAndamentoHtml,
  procurarAndamento,
  resumirAndamento,
} from '../shared/andamento-parser';
import { executarEmFila } from '../shared/fila-requisicoes';
import { lerHtmlDaResposta } from '../shared/http-sei';
import type {
  AndamentoProcesso,
  LinhaAndamento,
  MensagemRuntime,
  ReferenciaProcesso,
} from '../types';

/**
 * Verifica se o documento atual representa uma tela autenticada do SEI
 */
const verificarAutenticacao = (): boolean => {
  // Indicadores positivos (elementos exclusivos da área autenticada) têm prioridade:
  // o SEI pode manter marcações de formulário de login escondidas na página (ex.: modal
  // de "Alterar Senha") mesmo quando o usuário já está autenticado, então checar o
  // formulário de login antes gerava falso negativo constante.
  const temIndicadoresAutenticado =
    document.querySelector(
      '#tblProcessosRecebidos, #tblProcessosGerados, #divInfraAreaTabela, #divInfraBarraLocalizacao, #infraMenuSistema, #lblUsuario, a[href*="acao=procedimento_"]'
    ) !== null || window.location.href.includes('acao=procedimento_controlar');

  return temIndicadoresAutenticado;
};

/**
 * Coleta processos e sincroniza o estado com o background worker
 */
const sincronizarPaginaSei = () => {
  try {
    const autenticado = verificarAutenticacao();
    const html = document.documentElement.outerHTML;
    const urlAtual = window.location.href;
    const processos = parseProcessosHtml(html, urlAtual);
    const usuarioLogado = extrairUsuarioLogado(document) || undefined;
    const unidadeAtual = extrairUnidadeAtual(document) || undefined;
    const marcadoresDisponiveis = extrairTodosMarcadoresDaPagina(document);

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const mensagem: MensagemRuntime = {
        tipo: 'NOTIFICAR_PAGINA_SEI_CARREGADA',
        processos,
        urlAtual,
        autenticado,
        usuarioLogado,
        unidadeAtual,
        marcadoresDisponiveis,
      };

      chrome.runtime.sendMessage(mensagem).catch(() => {
        // Ignora caso o service worker esteja inativo
      });
    }
  } catch (erro) {
    console.debug('[SEI Radar] Erro ao analisar página do SEI:', erro);
  }
};

// Executa assim que o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sincronizarPaginaSei);
} else {
  sincronizarPaginaSei();
}

/**
 * Busca o andamento de um processo a partir da própria página do SEI.
 *
 * Rodando no content script, o `fetch` é de mesma origem e reaproveita a sessão já
 * autenticada do usuário — não exige nenhuma permissão de host adicional.
 */
const buscarAndamentoDoProcesso = async (
  referencia: ReferenciaProcesso,
  unidadeUsuario?: string
): Promise<AndamentoProcesso> => {
  const base: AndamentoProcesso = {
    numero: referencia.numero,
    unidadeGeradora: null,
    enviadoPorUnidade: null,
    dataEnvio: null,
    atualizadoEmSei: null,
    linhas: [],
    coletadoEm: new Date().toISOString(),
  };

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

  const busca = await procurarAndamento(referencia.link, {
    baixar,
    parsearLinhas: parseAndamentoHtml,
    extrairFrames: extrairUrlsDeFrames,
    ehLogin: ehTelaDeLogin,
    analisar: analisarAndamentoHtml,
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

  const truncado = busca.htmlDaTabela ? historicoEstaTruncado(busca.htmlDaTabela) : false;
  const linhas = busca.linhas;
  const linkAndamento = busca.linkAndamento;

  return {
    ...base,
    ...resumirAndamento(linhas, unidadeUsuario, truncado),
    ...(linkAndamento ? { linkAndamento } : {}),
  };
};

// Responde a pedidos de extração sob demanda vindos do popup ou background
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.tipo === 'EXTRAIR_DOM_SEI') {
      const autenticado = verificarAutenticacao();
      const processos = parseProcessosHtml(document.documentElement.outerHTML, window.location.href);
      const usuarioLogado = extrairUsuarioLogado(document) || undefined;
      const unidadeAtual = extrairUnidadeAtual(document) || undefined;
      const marcadoresDisponiveis = extrairTodosMarcadoresDaPagina(document);
      sendResponse({
        autenticado,
        processos,
        urlAtual: window.location.href,
        usuarioLogado,
        unidadeAtual,
        marcadoresDisponiveis,
      });
      return;
    }

    if (msg.tipo === 'BUSCAR_ANDAMENTO') {
      // O content script roda em todos os frames (all_frames), mas só o frame de topo
      // deve atender: senão cada frame repetiria o lote inteiro contra o SEI
      if (window.top !== window.self) return;

      const referencias: ReferenciaProcesso[] = Array.isArray(msg.processos) ? msg.processos : [];

      executarEmFila(
        referencias,
        // A unidade ativa é lida da própria página, sem depender de configuração
        (referencia) => buscarAndamentoDoProcesso(referencia, extrairUnidadeAtual(document) || undefined),
        { concorrencia: 2, intervaloMs: 400, timeoutMs: 15000 }
      )
        .then((resultados) => {
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
          sendResponse({ sucesso: true, andamentos });
        })
        .catch((erro) => {
          sendResponse({
            sucesso: false,
            andamentos: [],
            mensagem: erro?.message || 'Falha ao consultar o andamento.',
          });
        });

      return true; // resposta assíncrona
    }
  });
}

// Observa mudanças dinâmicas na tabela (ex: paginação AJAX no SEI).
//
// Com debounce: sem ele, uma única renderização do SEI dispara dezenas de mutações,
// cada uma reserializando a página inteira e enviando uma mensagem ao background.
let timeoutSincronizacao: ReturnType<typeof setTimeout> | null = null;

const observador = new MutationObserver(() => {
  if (timeoutSincronizacao) clearTimeout(timeoutSincronizacao);
  timeoutSincronizacao = setTimeout(() => {
    timeoutSincronizacao = null;
    sincronizarPaginaSei();
  }, 800);
});

const elementoTabela =
  document.getElementById('tblProcessosRecebidos') ||
  document.getElementById('divInfraAreaTabela') ||
  document.body;

if (elementoTabela) {
  observador.observe(elementoTabela, { childList: true, subtree: true });
}
