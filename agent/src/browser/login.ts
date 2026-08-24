import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ConfiguracaoProxyAgente } from '../config/config';

export interface ConfiguracaoLoginManual {
  readonly urlBaseSei: string;
  readonly urlControleSei: string;
  readonly caminhoEstadoSessao: string;
  readonly proxy?: ConfiguracaoProxyAgente;
}

interface PortaPaginaLogin {
  goto(url: string): Promise<unknown>;
}

interface PortaContextoLogin {
  newPage(): Promise<PortaPaginaLogin>;
  storageState(opcoes: { path: string }): Promise<unknown>;
  close(): Promise<void>;
}

interface PortaNavegadorLogin {
  newContext(): Promise<PortaContextoLogin>;
  close(): Promise<void>;
}

export interface DependenciasLoginManual {
  readonly iniciarNavegador?: (opcoes: {
    headless: false;
    proxy?: ConfiguracaoProxyAgente;
  }) => Promise<PortaNavegadorLogin>;
  readonly aguardarAutenticacao?: (pagina: PortaPaginaLogin) => Promise<void>;
}

const esperaPadraoAutenticacao = async (pagina: PortaPaginaLogin, urlControle: string): Promise<void> => {
  const paginaPlaywright = pagina as Page;
  const destino = new URL(urlControle);
  await paginaPlaywright.waitForURL((url) =>
    url.origin === destino.origin &&
    url.pathname === destino.pathname &&
    url.searchParams.get('acao') === destino.searchParams.get('acao'), {
    timeout: 0,
  });
};

const fecharRecursosLogin = async (
  contexto: PortaContextoLogin | undefined,
  navegador: PortaNavegadorLogin | undefined,
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

export const realizarLoginManual = async (
  configuracao: ConfiguracaoLoginManual,
  dependencias: DependenciasLoginManual = {},
): Promise<void> => {
  const iniciarNavegador = dependencias.iniciarNavegador ?? ((opcoes) => chromium.launch(opcoes) as Promise<Browser>);
  let navegador: PortaNavegadorLogin | undefined;
  let contexto: PortaContextoLogin | undefined;
  let erroOperacao: unknown;
  try {
    navegador = await iniciarNavegador({ headless: false, ...(configuracao.proxy ? { proxy: configuracao.proxy } : {}) });
    contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    await pagina.goto(configuracao.urlControleSei);
    if (dependencias.aguardarAutenticacao) await dependencias.aguardarAutenticacao(pagina);
    else await esperaPadraoAutenticacao(pagina, configuracao.urlControleSei);
    await mkdir(dirname(configuracao.caminhoEstadoSessao), { recursive: true, mode: 0o700 });
    await contexto.storageState({ path: configuracao.caminhoEstadoSessao });
    await chmod(configuracao.caminhoEstadoSessao, 0o600);
  } catch (erro) {
    erroOperacao = erro;
  }
  try {
    await fecharRecursosLogin(contexto, navegador);
  } catch (erro) {
    erroOperacao ??= erro;
  }
  if (erroOperacao) throw erroOperacao;
};

// Compile-time checks for Playwright's concrete resources.
const _compatibilidadeNavegador: PortaNavegadorLogin | undefined = undefined as Browser | undefined;
const _compatibilidadeContexto: PortaContextoLogin | undefined = undefined as BrowserContext | undefined;
void _compatibilidadeNavegador;
void _compatibilidadeContexto;
