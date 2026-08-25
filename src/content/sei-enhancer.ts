import {
  parseProcessosHtml,
  extrairUsuarioLogado,
  extrairTodosMarcadoresDaPagina,
} from '../shared/sei-parser';
import type { MensagemRuntime, ProcessoSei } from '../types';

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
    const marcadoresDisponiveis = extrairTodosMarcadoresDaPagina(document);

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const mensagem: MensagemRuntime = {
        tipo: 'NOTIFICAR_PAGINA_SEI_CARREGADA',
        processos,
        urlAtual,
        autenticado,
        usuarioLogado,
        marcadoresDisponiveis,
      };

      chrome.runtime.sendMessage(mensagem).catch(() => {
        // Ignora caso o service worker esteja inativo
      });
    }
  } catch (erro) {
    console.debug('[SEI Notifier] Erro ao analisar página do SEI:', erro);
  }
};

// Executa assim que o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sincronizarPaginaSei);
} else {
  sincronizarPaginaSei();
}

// Responde a pedidos de extração sob demanda vindos do popup ou background
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.tipo === 'EXTRAIR_DOM_SEI') {
      const autenticado = verificarAutenticacao();
      const processos = parseProcessosHtml(document.documentElement.outerHTML, window.location.href);
      const usuarioLogado = extrairUsuarioLogado(document) || undefined;
      const marcadoresDisponiveis = extrairTodosMarcadoresDaPagina(document);
      sendResponse({
        autenticado,
        processos,
        urlAtual: window.location.href,
        usuarioLogado,
        marcadoresDisponiveis,
      });
    }
  });
}

// Observa mudanças dinâmicas na tabela (ex: paginação AJAX no SEI)
const observador = new MutationObserver(() => {
  sincronizarPaginaSei();
});

const elementoTabela =
  document.getElementById('tblProcessosRecebidos') ||
  document.getElementById('divInfraAreaTabela') ||
  document.body;

if (elementoTabela) {
  observador.observe(elementoTabela, { childList: true, subtree: true });
}
