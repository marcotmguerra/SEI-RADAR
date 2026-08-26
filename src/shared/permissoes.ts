/**
 * Sufixos de domínio institucionais brasileiros aos quais a permissão opcional de host
 * (optional_host_permissions no manifest) está restrita. Mantido em sincronia manual com
 * manifest.json — cobre a imensa maioria das instalações do SEI (poder executivo, judiciário,
 * legislativo, Ministério Público e Defensoria Pública), evitando o padrão amplo de acesso a
 * qualquer site.
 */
export const SUFIXOS_HOST_SUPORTADOS = ['.gov.br', '.jus.br', '.leg.br', '.mp.br', '.def.br'];

/**
 * Converte uma URL completa no padrão de origem aceito pela API chrome.permissions
 * (ex.: "https://sei.mg.gov.br/sei/controlador.php?..." -> "https://sei.mg.gov.br/*")
 */
export const obterPadraoOrigem = (url: string): string | null => {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return null;
  }
};

/**
 * Verifica se o domínio da URL está entre os sufixos institucionais declarados em
 * optional_host_permissions. Uma URL fora dessa lista nunca poderá ter a permissão concedida —
 * chrome.permissions.request rejeita silenciosamente origens não cobertas pelo manifest.
 */
export const ehOrigemSuportada = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return SUFIXOS_HOST_SUPORTADOS.some((sufixo) => hostname.endsWith(sufixo));
  } catch {
    return false;
  }
};

/**
 * Verifica se a extensão já possui permissão de host concedida para a origem da URL informada
 */
export const possuiPermissaoParaUrl = async (url: string): Promise<boolean> => {
  const padrao = obterPadraoOrigem(url);
  if (!padrao) return false;
  if (typeof chrome === 'undefined' || !chrome.permissions) return false;

  try {
    return await chrome.permissions.contains({ origins: [padrao] });
  } catch {
    return false;
  }
};

/**
 * Solicita ao usuário permissão de host para a origem da URL informada, caso ainda não concedida.
 * Deve ser chamada a partir de um gesto do usuário (ex.: clique em "Salvar"), exigência da API
 * chrome.permissions.request para exibir o prompt nativo do navegador. Retorna false sem tentar
 * pedir nada quando o domínio não está entre os sufixos institucionais suportados.
 */
export const solicitarPermissaoParaUrl = async (url: string): Promise<boolean> => {
  if (!ehOrigemSuportada(url)) return false;

  const padrao = obterPadraoOrigem(url);
  if (!padrao) return false;
  if (typeof chrome === 'undefined' || !chrome.permissions) return false;

  try {
    const jaConcedida = await chrome.permissions.contains({ origins: [padrao] });
    if (jaConcedida) return true;
    return await chrome.permissions.request({ origins: [padrao] });
  } catch (erro) {
    console.error('Erro ao solicitar permissão de acesso à URL do SEI:', erro);
    return false;
  }
};
