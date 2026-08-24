import { describe, expect, it } from 'vitest';
import { reconciliarRetrato, type ProcessoConhecido } from '../src/reconcile';

const conhecidos = (alteracoes: Partial<ProcessoConhecido> = {}): ProcessoConhecido => ({
  numero: '1400.01.000001/2026-01',
  naUnidade: true,
  atribuidoAMim: false,
  contagemAusencias: 0,
  marcadores: [],
  ...alteracoes,
});

describe('reconciliarRetrato', () => {
  it('detecta entrada e primeira visualizacao sem duplicar eventos', () => {
    const resultado = reconciliarRetrato([], {
      completa: true,
      esperado: 1,
      processos: [{ numero: '1400.01.000002/2026-02', atribuidoAMim: false, marcadores: [] }],
    });

    expect(resultado.processos[0]).toMatchObject({ naUnidade: true, contagemAusencias: 0 });
    expect(resultado.eventos.map((evento) => evento.tipo)).toEqual(['IDENTIFICADO_PRIMEIRA_VEZ', 'ENTROU_NA_UNIDADE']);
  });

  it('confirma a saida somente na segunda ausencia completa consecutiva', () => {
    const primeira = reconciliarRetrato([conhecidos()], { completa: true, esperado: 0, processos: [] });
    const segunda = reconciliarRetrato(primeira.processos, { completa: true, esperado: 0, processos: [] });

    expect(primeira.processos[0]).toMatchObject({ naUnidade: true, contagemAusencias: 1 });
    expect(primeira.eventos).toEqual([]);
    expect(segunda.processos[0]).toMatchObject({ naUnidade: false, contagemAusencias: 2 });
    expect(segunda.eventos.map((evento) => evento.tipo)).toEqual(['SAIU_DA_UNIDADE']);
  });

  it('ignora ausencias quando a coleta esta incompleta', () => {
    const resultado = reconciliarRetrato([conhecidos()], { completa: false, processos: [] });

    expect(resultado.processos[0]).toEqual(conhecidos());
    expect(resultado.eventos).toEqual([]);
  });

  it('detecta atribuicao, desatribuicao e alteracoes de marcadores', () => {
    const adicionado = reconciliarRetrato([conhecidos()], {
      completa: true,
      esperado: 1,
      atribuicoesCompletas: true,
      marcadoresCompletos: true,
      processos: [{ numero: conhecidos().numero, atribuidoAMim: true, marcadores: ['Urgente'] }],
    });
    const removido = reconciliarRetrato(adicionado.processos, {
      completa: true,
      esperado: 1,
      atribuicoesCompletas: true,
      marcadoresCompletos: true,
      processos: [{ numero: conhecidos().numero, atribuidoAMim: false, marcadores: [] }],
    });

    expect(adicionado.eventos.map((evento) => evento.tipo)).toEqual(['ATRIBUIDO_A_MIM', 'MARCADOR_ADICIONADO']);
    expect(removido.eventos.map((evento) => evento.tipo)).toEqual(['ATRIBUICAO_REMOVIDA', 'MARCADOR_REMOVIDO']);
  });

  it('reseta a contagem de ausencia quando o processo reaparece', () => {
    const anterior = conhecidos({ contagemAusencias: 1 });
    const resultado = reconciliarRetrato([anterior], {
      completa: true,
      esperado: 1,
      processos: [{ numero: anterior.numero, atribuidoAMim: false, marcadores: [] }],
    });

    expect(resultado.processos[0]).toMatchObject({ naUnidade: true, contagemAusencias: 0 });
    expect(resultado.eventos).toEqual([]);
    expect(anterior.contagemAusencias).toBe(1);
  });

  it('detecta o retorno de um processo que ja havia saído', () => {
    const anterior = conhecidos({ naUnidade: false, contagemAusencias: 2 });
    const resultado = reconciliarRetrato([anterior], {
      completa: true,
      esperado: 1,
      processos: [{ numero: anterior.numero, atribuidoAMim: false, marcadores: [] }],
    });

    expect(resultado.processos[0]).toMatchObject({ naUnidade: true, contagemAusencias: 0 });
    expect(resultado.eventos.map((evento) => evento.tipo)).toEqual(['ENTROU_NA_UNIDADE']);
  });

  it('processa itens presentes mas preserva ausencias em retrato incompleto', () => {
    const presente = conhecidos();
    const ausente = conhecidos({ numero: '1400.01.000002/2026-02' });
    const resultado = reconciliarRetrato([presente, ausente], {
      completa: false,
      esperado: 3,
      processos: [{ numero: presente.numero, atribuidoAMim: true, marcadores: [] }],
    });

    expect(resultado.processos[0]).toMatchObject({ atribuidoAMim: false });
    expect(resultado.processos[1]).toEqual(ausente);
    expect(resultado.eventos).toEqual([]);
  });

  it('preserva atribuicao e marcadores quando suas coletas estao incompletas', () => {
    const anterior = conhecidos({ atribuidoAMim: true, marcadores: ['Urgente'] });
    const resultado = reconciliarRetrato([anterior], {
      completa: true,
      esperado: 1,
      atribuicoesCompletas: false,
      marcadoresCompletos: false,
      processos: [{ numero: anterior.numero, atribuidoAMim: false, marcadores: [] }],
    });

    expect(resultado.processos[0]).toMatchObject({ atribuidoAMim: true, marcadores: ['Urgente'] });
    expect(resultado.eventos).toEqual([]);
  });
});
