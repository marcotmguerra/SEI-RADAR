import { describe, expect, it } from 'vitest';
import {
  esquemaProcessosConhecidos,
  esquemaNumeroProcesso,
  esquemaRetratoSincronizacao,
} from '../src/schemas';

describe('schemas de dominio', () => {
  it('normaliza um numero SEI valido', () => {
    expect(esquemaNumeroProcesso.parse(' 1400.01.000001/2026-01 ')).toBe('1400.01.000001/2026-01');
  });

  it('rejeita numero e retrato invalidos', () => {
    expect(esquemaNumeroProcesso.safeParse('javascript:alert(1)').success).toBe(false);
    expect(esquemaRetratoSincronizacao.safeParse({ completa: true, esperado: 2, processos: [] }).success).toBe(false);
  });

  it('exige total esperado para declarar uma coleta completa', () => {
    expect(esquemaRetratoSincronizacao.safeParse({ completa: true, processos: [] }).success).toBe(false);
  });

  it('normaliza os campos textuais sem alterar o valor recebido', () => {
    const entrada = {
      completa: true,
      esperado: 1,
      processos: [
        {
          numero: ' 1400.01.000001/2026-01 ',
          atribuidoAMim: false,
          marcadores: [' Urgente ', 'Financeiro'],
        },
      ],
    };

    expect(esquemaRetratoSincronizacao.parse(entrada)).toEqual({
      completa: true,
      esperado: 1,
      atribuicoesCompletas: false,
      marcadoresCompletos: false,
      processos: [
        {
          numero: '1400.01.000001/2026-01',
          atribuidoAMim: false,
          marcadores: ['Urgente', 'Financeiro'],
        },
      ],
    });
    expect(entrada.processos[0]?.numero).toBe(' 1400.01.000001/2026-01 ');
  });

  it('rejeita processos e marcadores duplicados', () => {
    const processo = {
      numero: '1400.01.000001/2026-01',
      atribuidoAMim: false,
      marcadores: ['Urgente', ' Urgente '],
    };

    expect(esquemaRetratoSincronizacao.safeParse({ completa: true, esperado: 1, processos: [processo] }).success).toBe(false);
    expect(
      esquemaProcessosConhecidos.safeParse([
        { ...processo, marcadores: [], naUnidade: true, contagemAusencias: 0 },
        { ...processo, marcadores: [], naUnidade: true, contagemAusencias: 0 },
      ]).success,
    ).toBe(false);
  });
});
