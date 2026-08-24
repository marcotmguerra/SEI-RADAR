import { describe, expect, it } from 'vitest';
import { coletarTodasPaginas, ErroLayout } from '../src/browser/collector';

describe('coletarTodasPaginas', () => {
  it('percorre paginas, elimina repetidos e valida o total', async () => {
    const paginas = [
      ['1400.01.000001/2026-01', '1400.01.000002/2026-02'],
      ['1400.01.000002/2026-02', '1400.01.000003/2026-03'],
    ];
    let atual = 0;
    const fonte = {
      contagemEsperada: async () => 3,
      numerosProcessos: async () => paginas[atual] ?? [],
      irProximaPagina: async () => {
        if (atual >= paginas.length - 1) return false;
        atual += 1;
        return true;
      },
    };

    const resultado = await coletarTodasPaginas(fonte);

    expect(resultado.status).toBe('SUCESSO');
    expect(resultado.esperado).toBe(3);
    expect(resultado.processos).toHaveLength(3);
  });

  it('marca coleta divergente como incompleta', async () => {
    const resultado = await coletarTodasPaginas({
      contagemEsperada: async () => 2,
      numerosProcessos: async () => ['1400.01.000001/2026-01'],
      irProximaPagina: async () => false,
    });

    expect(resultado.status).toBe('INCOMPLETA');
  });

  it('interrompe quando elementos essenciais somem', async () => {
    await expect(
      coletarTodasPaginas({
        contagemEsperada: async () => null,
        numerosProcessos: async () => [],
        irProximaPagina: async () => false,
      }),
    ).rejects.toBeInstanceOf(ErroLayout);
  });

  it('falha fechado ao detectar ciclo de paginacao', async () => {
    await expect(
      coletarTodasPaginas({
        contagemEsperada: async () => 2,
        numerosProcessos: async () => ['1400.01.000001/2026-01'],
        irProximaPagina: async () => true,
      }),
    ).rejects.toBeInstanceOf(ErroLayout);
  });

  it('falha fechado quando um numero coletado nao e um numero SEI', async () => {
    await expect(
      coletarTodasPaginas({
        contagemEsperada: async () => 1,
        numerosProcessos: async () => ['javascript:alert(1)'],
        irProximaPagina: async () => false,
      }),
    ).rejects.toBeInstanceOf(ErroLayout);
  });
});
