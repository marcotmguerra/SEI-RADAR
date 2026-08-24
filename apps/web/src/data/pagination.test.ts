import { describe, expect, it, vi } from 'vitest';
import { coletarPaginas } from './pagination';

describe('paginacao de consultas', () => {
  it('coleta todas as paginas ate receber uma pagina parcial', async () => {
    const carregar = vi.fn(async (inicio: number) => ({
      data: inicio === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }],
      error: null,
    }));

    const resultado = await coletarPaginas(carregar, 2);

    expect(resultado.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(carregar).toHaveBeenNthCalledWith(1, 0, 1);
    expect(carregar).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it('interrompe e preserva o erro da consulta', async () => {
    const erro = { message: 'falha' };
    const resultado = await coletarPaginas(async () => ({ data: null, error: erro }), 1000);
    expect(resultado).toEqual({ data: [], error: erro });
  });

  it('rejeita tamanho de pagina invalido', async () => {
    await expect(coletarPaginas(async () => ({ data: [], error: null }), 0)).rejects.toThrow(/inteiro positivo/);
  });
});
