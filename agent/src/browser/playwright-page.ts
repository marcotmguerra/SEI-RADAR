import type { Page } from 'playwright';
import { ErroLayout } from './errors';
import type { PortaPaginaSei } from './process-page';

const resolverProximaPaginaSegura = (href: string | null, urlColeta: string): string => {
  if (href === null) throw new ErroLayout('O link de paginação do SEI não possui destino');
  let destino: URL;
  let coleta: URL;
  try {
    coleta = new URL(urlColeta);
    destino = new URL(href, coleta);
  } catch {
    throw new ErroLayout('O destino de paginação do SEI é inválido');
  }
  const acoes = destino.searchParams.getAll('acao');
  if (
    (destino.protocol !== 'http:' && destino.protocol !== 'https:') ||
    destino.origin !== coleta.origin ||
    destino.pathname !== coleta.pathname ||
    acoes.length !== 1 ||
    acoes[0] !== 'procedimento_controlar' ||
    acoes[0] !== coleta.searchParams.get('acao')
  ) {
    throw new ErroLayout('O destino de paginação não é uma navegação SEI somente leitura');
  }
  return destino.href;
};

export const criarPortaPaginaPlaywright = (
  pagina: Page,
  urlColeta: string = pagina.url(),
): PortaPaginaSei => ({
  contar: async (seletor) => pagina.locator(seletor).count(),
  texto: async (seletor) => pagina.locator(seletor).first().innerText(),
  atributo: async (seletor, nome) => pagina.locator(seletor).first().getAttribute(nome),
  textos: async (seletor) => pagina.locator(seletor).allTextContents(),
  proximo: async (seletor) => {
    const proximo = pagina.locator(seletor).first();
    if ((await proximo.count()) === 0) return false;
    const desabilitado = await proximo.getAttribute('aria-desabilitado');
    const nomeClasse = (await proximo.getAttribute('class')) ?? '';
    if (desabilitado === 'true' || /\b(?:desabilitado|desabilitado)\b/iu.test(nomeClasse)) return false;
    const destino = resolverProximaPaginaSegura(await proximo.getAttribute('href'), urlColeta);
    await pagina.goto(destino, { waitUntil: 'domcontentloaded' });
    return true;
  },
});
