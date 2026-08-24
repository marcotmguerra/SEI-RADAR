import { describe, expect, it } from 'vitest';
import { obterStatusAgente } from './Settings';
import type { ExecucaoSincronizacao } from '../types';

const sincronizacao = (status: ExecucaoSincronizacao['status'], iniciadaEm = '2026-08-24T12:00:00.000Z'): ExecucaoSincronizacao => ({
  id: 'sincronizacao-1', status, iniciadaEm, finalizadaEm: iniciadaEm,
  processosEsperados: 10, processosCapturados: 10, mensagemErro: null,
});

describe('status do agente', () => {
  it('reflete ausência, sessão expirada e falhas', () => {
    expect(obterStatusAgente(undefined)).toBe('Sem sincronização');
    expect(obterStatusAgente(sincronizacao('SESSAO_EXPIRADA'))).toBe('Sessão expirada');
    expect(obterStatusAgente(sincronizacao('ERRO_LAYOUT_COLETOR'))).toBe('Layout do SEI alterado');
    expect(obterStatusAgente(sincronizacao('INCOMPLETA'))).toBe('Atenção necessária');
  });

  it('distingue execução recente de agente parado', () => {
    const agora = new Date('2026-08-24T12:20:00.000Z').getTime();
    expect(obterStatusAgente(sincronizacao('SUCESSO'), agora)).toBe('Ativo');
    expect(obterStatusAgente(sincronizacao('SUCESSO', '2026-08-24T10:00:00.000Z'), agora)).toBe('Sem sincronizar');
  });
});
