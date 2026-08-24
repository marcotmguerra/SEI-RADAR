import { esquemaNumeroProcesso, type NumeroProcesso } from '@crm-sei/core';
import { ErroLayout } from './errors';

export { ErroLayout } from './errors';

export interface FontePaginaProcessos {
  contagemEsperada(): Promise<number | null>;
  numerosProcessos(): Promise<readonly string[]>;
  irProximaPagina(): Promise<boolean>;
}

export interface ResultadoColeta {
  readonly status: 'SUCESSO' | 'INCOMPLETA';
  readonly esperado: number;
  readonly capturado: number;
  readonly processos: readonly NumeroProcesso[];
}

export interface OpcoesColeta {
  readonly maximoPaginas?: number;
}

export const coletarTodasPaginas = async (
  fonte: FontePaginaProcessos,
  opcoes: OpcoesColeta = {},
): Promise<ResultadoColeta> => {
  const esperado = await fonte.contagemEsperada();
  if (esperado === null || !Number.isSafeInteger(esperado) || esperado < 0) {
    throw new ErroLayout('O total de registros do SEI não pôde ser lido');
  }

  const maximo = opcoes.maximoPaginas ?? 1_000;
  const coletados = new Set<NumeroProcesso>();
  const impressoesPaginas = new Set<string>();

  for (let numeroPagina = 1; numeroPagina <= maximo; numeroPagina += 1) {
    const numerosBrutos = await fonte.numerosProcessos();
    const numeros = numerosBrutos.map((numero) => {
      const resultado = esquemaNumeroProcesso.safeParse(numero);
      if (!resultado.success) throw new ErroLayout('A lista contém um número de processo inválido');
      return resultado.data;
    });
    const impressao = [...new Set(numeros)].sort().join('|');
    if (impressoesPaginas.has(impressao)) {
      throw new ErroLayout('Foi detectado um ciclo na paginação do SEI');
    }
    impressoesPaginas.add(impressao);
    for (const numero of numeros) coletados.add(numero);

    if (!(await fonte.irProximaPagina())) {
      const processos = Object.freeze([...coletados]);
      return Object.freeze({
        status: processos.length === esperado ? 'SUCESSO' : 'INCOMPLETA',
        esperado,
        capturado: processos.length,
        processos,
      });
    }
  }

  throw new ErroLayout(`A paginação excedeu o limite seguro de ${maximo} páginas`);
};
