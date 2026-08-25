import type { MensagemRuntime } from '../types';

/**
 * Documento offscreen: única forma de tocar áudio a partir do service worker
 * no Manifest V3, já que service workers não têm acesso a APIs de DOM/Audio.
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
  }
});
