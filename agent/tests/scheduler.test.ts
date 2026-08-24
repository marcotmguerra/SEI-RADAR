import { describe, expect, it, vi } from 'vitest';
import { iniciarAgendador } from '../src/scheduler/scheduler';

describe('iniciarAgendador', () => {
  it('rejeita intervalo invalido', () => {
    expect(() => iniciarAgendador({ executar: vi.fn(), intervaloMs: 0, aoErro: vi.fn() })).toThrow(
      /intervalo/,
    );
  });

  it('nao sobrepoe execucoes e parar aguarda a rotina ativa', async () => {
    vi.useFakeTimers();
    let liberar: (() => void) | undefined;
    let concorrentes = 0;
    let maximoConcorrentes = 0;
    const executar = vi.fn(async () => {
      concorrentes += 1;
      maximoConcorrentes = Math.max(maximoConcorrentes, concorrentes);
      await new Promise<void>((resolver) => {
        liberar = resolver;
      });
      concorrentes -= 1;
    });

    const agendador = iniciarAgendador({ executar, intervaloMs: 1_000, aoErro: vi.fn() });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(executar).toHaveBeenCalledOnce();
    const parada = agendador.parar();
    liberar?.();
    await parada;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(maximoConcorrentes).toBe(1);
    expect(executar).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('isola falha da rotina e agenda a proxima tentativa', async () => {
    vi.useFakeTimers();
    const aoErro = vi.fn();
    const executar = vi.fn().mockRejectedValueOnce(new Error('falha')).mockResolvedValue(undefined);
    const agendador = iniciarAgendador({ executar, intervaloMs: 1_000, aoErro });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(aoErro).toHaveBeenCalledOnce();
    expect(executar).toHaveBeenCalledTimes(2);
    await agendador.parar();
    vi.useRealTimers();
  });
});
