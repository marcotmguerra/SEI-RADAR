// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDadosCrm } from './useCrmData';

describe('useDadosCrm em demonstracao', () => {
  it('atualiza o status interno de forma imutavel', async () => {
    const { result: resultadoGancho } = renderHook(() => useDadosCrm());
    const original = resultadoGancho.current.processos;

    await act(async () => resultadoGancho.current.atualizarStatus('p1', 'FINALIZADO'));

    expect(resultadoGancho.current.processos).not.toBe(original);
    expect(resultadoGancho.current.processos.find((processo) => processo.id === 'p1')?.statusCrm).toBe('FINALIZADO');
    await act(async () => resultadoGancho.current.atualizarProcesso('p1', {
      statusCrm: 'EM_ANALISE', prioridade: 'ALTA', dataPrazo: null, observacoes: 'Revisar amanhã.',
    }));
    expect(resultadoGancho.current.processos.find((processo) => processo.id === 'p1')?.observacoes).toBe('Revisar amanhã.');
    await act(async () => resultadoGancho.current.atualizarDados());
  });
});
