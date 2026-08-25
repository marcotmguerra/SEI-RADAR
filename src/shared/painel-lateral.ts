/**
 * chrome.sidePanel existe a partir do Chrome 114, mas sidePanel.open() só a partir
 * do Chrome 116 — testamos o método, não o namespace, para detectar suporte real.
 */
export const suportaPainelLateral = (): boolean =>
  typeof chrome !== 'undefined' &&
  typeof chrome.sidePanel !== 'undefined' &&
  typeof chrome.sidePanel.open === 'function';
