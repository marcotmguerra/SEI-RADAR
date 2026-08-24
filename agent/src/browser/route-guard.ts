const METODOS_SOMENTE_LEITURA = new Set(['GET', 'HEAD']);
const ACOES_SEI_PERMITIDAS = new Set(['procedimento_controlar', 'login', 'usuario_autenticar']);

export interface PortaRequisicaoColeta {
  method(): string;
  url(): string;
}

export interface PortaRotaColeta {
  request(): PortaRequisicaoColeta;
  abort(): Promise<unknown>;
  continue(): Promise<unknown>;
}

export type ManipuladorRotaColeta = (rota: PortaRotaColeta) => Promise<void>;

export interface PortaContextoRotasColeta {
  route(padrao: string, manipulador: ManipuladorRotaColeta): Promise<unknown>;
}

const deveAbortar = (rota: PortaRotaColeta, origemSei: string): boolean => {
  const requisicao = rota.request();
  if (!METODOS_SOMENTE_LEITURA.has(requisicao.method().toUpperCase())) return true;

  let url: URL;
  try {
    url = new URL(requisicao.url());
  } catch {
    return true;
  }
  if (url.origin !== origemSei) return true;
  if (!url.searchParams.has('acao')) return false;
  const acoes = url.searchParams.getAll('acao');
  return acoes.length !== 1 || !ACOES_SEI_PERMITIDAS.has(acoes[0] ?? '');
};

export const instalarProtecaoRotasColeta = async (
  contexto: PortaContextoRotasColeta,
  urlBaseSei: string,
): Promise<void> => {
  const origemSei = new URL(urlBaseSei).origin;
  await contexto.route('**/*', async (rota) => {
    if (deveAbortar(rota, origemSei)) {
      await rota.abort();
      return;
    }
    await rota.continue();
  });
};
