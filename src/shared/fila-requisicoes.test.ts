import { describe, it, expect, vi } from 'vitest';
import { executarEmFila, comTimeout } from './fila-requisicoes';

const aguardar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Fila de requisições', () => {
  it('preserva a ordem de entrada nos resultados', async () => {
    const resultados = await executarEmFila([1, 2, 3, 4], async (n) => n * 10, { intervaloMs: 0 });
    expect(resultados.map((r) => r.resultado)).toEqual([10, 20, 30, 40]);
  });

  it('respeita o limite de concorrência', async () => {
    let emVoo = 0;
    let picoDeConcorrencia = 0;

    await executarEmFila(
      [1, 2, 3, 4, 5, 6],
      async () => {
        emVoo++;
        picoDeConcorrencia = Math.max(picoDeConcorrencia, emVoo);
        await aguardar(10);
        emVoo--;
      },
      { concorrencia: 2, intervaloMs: 0 }
    );

    expect(picoDeConcorrencia).toBeLessThanOrEqual(2);
  });

  it('espaça o início das requisições', async () => {
    const inicios: number[] = [];
    const t0 = Date.now();

    await executarEmFila(
      [1, 2, 3],
      async () => {
        inicios.push(Date.now() - t0);
      },
      { concorrencia: 1, intervaloMs: 30 }
    );

    // A terceira requisição não pode começar antes de ~2 intervalos
    expect(inicios[2]!).toBeGreaterThanOrEqual(50);
  });

  it('isola falhas sem derrubar o lote', async () => {
    const resultados = await executarEmFila(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('falhou no meio');
        return n;
      },
      { intervaloMs: 0 }
    );

    expect(resultados[0]?.resultado).toBe(1);
    expect(resultados[1]?.erro).toBe('falhou no meio');
    expect(resultados[1]?.resultado).toBeUndefined();
    expect(resultados[2]?.resultado).toBe(3);
  });

  it('informa o progresso a cada item concluído', async () => {
    const progresso: number[] = [];

    await executarEmFila([1, 2, 3], async (n) => n, {
      concorrencia: 1,
      intervaloMs: 0,
      aoProgredir: (concluidos, total) => {
        expect(total).toBe(3);
        progresso.push(concluidos);
      },
    });

    expect(progresso).toEqual([1, 2, 3]);
  });

  it('interrompe o lote quando cancelado', async () => {
    const controle = new AbortController();
    const executados: number[] = [];

    const promessa = executarEmFila(
      [1, 2, 3, 4, 5],
      async (n) => {
        executados.push(n);
        await aguardar(10);
        return n;
      },
      { concorrencia: 1, intervaloMs: 20, sinal: controle.signal }
    );

    await aguardar(15);
    controle.abort();
    const resultados = await promessa;

    expect(executados.length).toBeLessThan(5);
    // Itens não processados ficam explicitamente marcados como cancelados
    expect(resultados[4]?.erro).toBe('Cancelado');
  });

  it('devolve lista vazia sem itens', async () => {
    expect(await executarEmFila([], async (n) => n)).toEqual([]);
  });

  describe('comTimeout', () => {
    it('resolve quando a promessa termina a tempo', async () => {
      await expect(comTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
    });

    it('rejeita quando o tempo se esgota', async () => {
      vi.useFakeTimers();
      const lenta = new Promise((resolve) => setTimeout(resolve, 5000));
      const comLimite = comTimeout(lenta, 100);
      const assercao = expect(comLimite).rejects.toThrow('Tempo esgotado ao consultar o SEI');
      await vi.advanceTimersByTimeAsync(200);
      await assercao;
      vi.useRealTimers();
    });
  });
});
