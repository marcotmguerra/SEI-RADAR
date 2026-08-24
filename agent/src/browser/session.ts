import { access } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { ConfiguracaoAgente } from '../config/config';
import type { FontePaginaProcessos } from './collector';
import { criarPortaPaginaPlaywright } from './playwright-page';
import { SeiFontePaginaProcessos } from './process-page';
import { instalarProtecaoRotasColeta } from './route-guard';

export interface SessaoColetaNavegador {
  readonly fonte: FontePaginaProcessos;
  readonly fonteAtribuidos?: FontePaginaProcessos;
  readonly fontesMarcadores?: Readonly<Record<string, FontePaginaProcessos>>;
  fechar(): Promise<void>;
}

const caminhoExiste = async (caminho: string): Promise<boolean> => {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
};

const fecharRecursos = async (
  contexto: BrowserContext | undefined,
  navegador: Browser | undefined,
): Promise<void> => {
  let erroFechamento: unknown;
  try {
    await contexto?.close();
  } catch (erro) {
    erroFechamento = erro;
  }
  try {
    await navegador?.close();
  } catch (erro) {
    erroFechamento ??= erro;
  }
  if (erroFechamento) throw erroFechamento;
};

const criarFontePreguicosa = (contexto: BrowserContext, url: string): FontePaginaProcessos => {
  let inicializada: Promise<FontePaginaProcessos> | undefined;
  const obterFonte = (): Promise<FontePaginaProcessos> => {
    inicializada ??= (async () => {
      const pagina = await contexto.newPage();
      await pagina.goto(url, { waitUntil: 'domcontentloaded' });
      return new SeiFontePaginaProcessos(criarPortaPaginaPlaywright(pagina, url));
    })();
    return inicializada;
  };
  return Object.freeze({
    contagemEsperada: async () => (await obterFonte()).contagemEsperada(),
    numerosProcessos: async () => (await obterFonte()).numerosProcessos(),
    irProximaPagina: async () => (await obterFonte()).irProximaPagina(),
  });
};

export const abrirSessaoColetaNavegador = async (
  configuracao: ConfiguracaoAgente,
): Promise<SessaoColetaNavegador> => {
  let navegador: Browser | undefined;
  let contexto: BrowserContext | undefined;
  try {
    navegador = await chromium.launch({
      headless: configuracao.semInterface,
      ...(configuracao.proxy ? { proxy: configuracao.proxy } : {}),
    });
    const possuiEstadoSessao = await caminhoExiste(configuracao.caminhoEstadoSessao);
    contexto = await navegador.newContext(
      possuiEstadoSessao ? { storageState: configuracao.caminhoEstadoSessao } : undefined,
    );
    await instalarProtecaoRotasColeta(contexto, configuracao.urlBaseSei);
    const pagina = await contexto.newPage();
    await pagina.goto(configuracao.urlControleSei, { waitUntil: 'domcontentloaded' });
    const fonteAtribuidos =
      configuracao.urlAtribuidos === undefined ? undefined : criarFontePreguicosa(contexto, configuracao.urlAtribuidos);
    const fontesMarcadores =
      configuracao.urlsMarcadores === undefined
        ? undefined
        : Object.freeze(
            Object.fromEntries(
              Object.entries(configuracao.urlsMarcadores).map(([nome, url]) => [
                nome,
                criarFontePreguicosa(contexto as BrowserContext, url),
              ]),
            ),
          );
    let fechada = false;
    return Object.freeze({
      fonte: new SeiFontePaginaProcessos(criarPortaPaginaPlaywright(pagina, configuracao.urlControleSei)),
      ...(fonteAtribuidos ? { fonteAtribuidos } : {}),
      ...(fontesMarcadores ? { fontesMarcadores } : {}),
      fechar: async () => {
        if (fechada) return;
        fechada = true;
        await fecharRecursos(contexto, navegador);
      },
    });
  } catch (erro) {
    try {
      await fecharRecursos(contexto, navegador);
    } catch {
      // O erro original é mais útil; ambas as tentativas de fechamento já ocorreram.
    }
    throw erro;
  }
};
