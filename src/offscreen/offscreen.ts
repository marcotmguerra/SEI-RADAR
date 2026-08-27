import type { MensagemRuntime } from '../types';
import {
  parseProcessosHtml,
  extrairUsuarioLogado,
  extrairUnidadeAtual,
  extrairTodosMarcadoresDaPagina,
} from '../shared/sei-parser';
import { analisarAndamentoHtml, historicoEstaTruncado } from '../shared/andamento-parser';

/**
 * Documento offscreen: única forma de tocar áudio e de usar DOMParser a partir
 * do service worker no Manifest V3, já que service workers não têm acesso a
 * APIs de DOM/Audio.
 */
const tocarBeep = () => {
  const contexto = new AudioContext();
  const osc = contexto.createOscillator();
  const ganho = contexto.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, contexto.currentTime);
  ganho.gain.setValueAtTime(0.0001, contexto.currentTime);
  ganho.gain.exponentialRampToValueAtTime(0.28, contexto.currentTime + 0.02);
  ganho.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 0.35);

  osc.connect(ganho);
  ganho.connect(contexto.destination);

  osc.start();
  osc.stop(contexto.currentTime + 0.4);
  osc.onended = () => contexto.close();
};

chrome.runtime.onMessage.addListener((mensagem: MensagemRuntime, _sender, sendResponse) => {
  if (mensagem.tipo === 'TOCAR_ALERTA_SONORO') {
    tocarBeep();
    sendResponse({ ok: true });
    return;
  }

  if (mensagem.tipo === 'PARSEAR_HTML_SEI') {
    sendResponse({
      processos: parseProcessosHtml(mensagem.html, mensagem.urlBase),
      usuarioLogado: extrairUsuarioLogado(mensagem.html),
      unidadeAtual: extrairUnidadeAtual(mensagem.html),
      marcadoresDisponiveis: extrairTodosMarcadoresDaPagina(mensagem.html),
    });
    return;
  }

  if (mensagem.tipo === 'PARSEAR_ANDAMENTO_HTML') {
    // Entrega a análise crua: quem pediu é que decide resumir. Devolver o resumo
    // pronto daqui já cortava as linhas antigas, e é justamente a mais antiga que
    // identifica a unidade geradora.
    sendResponse({
      ...analisarAndamentoHtml(mensagem.html),
      truncado: historicoEstaTruncado(mensagem.html),
    });
  }
});
