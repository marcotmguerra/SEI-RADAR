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
 * chrome.permissions.request para exibir o prompt nativo do navegador.
 */
export const solicitarPermissaoParaUrl = async (url: string): Promise<boolean> => {
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
