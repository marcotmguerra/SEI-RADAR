export interface ResultadoPagina<Registro, ValorErro> {
  readonly data: readonly Registro[] | null;
  readonly error: ValorErro | null;
}

export async function coletarPaginas<Registro, ValorErro>(
  carregarPagina: (inicio: number, fim: number) => PromiseLike<ResultadoPagina<Registro, ValorErro>>,
  tamanhoPagina = 1000,
): Promise<{ readonly data: readonly Registro[]; readonly error: ValorErro | null }> {
  if (!Number.isSafeInteger(tamanhoPagina) || tamanhoPagina < 1) {
    throw new Error('tamanhoPagina deve ser um inteiro positivo');
  }
  const registros: Registro[] = [];
  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const resultado = await carregarPagina(inicio, inicio + tamanhoPagina - 1);
    if (resultado.error) return { data: registros, error: resultado.error };
    const pagina = resultado.data ?? [];
    registros.push(...pagina);
    if (pagina.length < tamanhoPagina) return { data: registros, error: null };
  }
}
