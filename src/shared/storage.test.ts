import { describe, it, expect, beforeEach } from 'vitest';
import {
  obterConfiguracao,
  salvarConfiguracao,
  obterProcessos,
  salvarProcessos,
  marcarProcessoComoLido,
  marcarTodosProcessosComoLidos,
  obterStatusSessao,
  salvarStatusSessao,
} from './storage';
import type { ProcessoSei } from '../types';

describe('Storage Manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retorna configurações padrão inicialmente', async () => {
    const config = await obterConfiguracao();
    expect(config.intervaloMinutos).toBe(5);
    expect(config.somAtivo).toBe(true);
    expect(config.notificacoesAtivas).toBe(true);
    expect(config.urlControle).toContain('controlador.php?acao=procedimento_controlar');
  });

  it('salva e recupera alterações de configuração', async () => {
    await salvarConfiguracao({ intervaloMinutos: 10, somAtivo: false });
    const atualizado = await obterConfiguracao();
    expect(atualizado.intervaloMinutos).toBe(10);
    expect(atualizado.somAtivo).toBe(false);
    expect(atualizado.notificacoesAtivas).toBe(true);
  });

  it('gerencia lista de processos e marcação de lidos', async () => {
    const listaInicial: ProcessoSei[] = [
      {
        numero: '1400.01.000100/2026-01',
        assunto: 'Assunto 1',
        link: 'https://sei.mg.gov.br/1',
        detectadoEm: new Date().toISOString(),
        lido: false,
      },
      {
        numero: '1400.01.000200/2026-02',
        assunto: 'Assunto 2',
        link: 'https://sei.mg.gov.br/2',
        detectadoEm: new Date().toISOString(),
        lido: false,
      },
    ];

    await salvarProcessos(listaInicial);
    const salvos = await obterProcessos();
    expect(salvos).toHaveLength(2);

    // Marca 1 como lido
    const aposLido = await marcarProcessoComoLido('1400.01.000100/2026-01');
    expect(aposLido.find((p) => p.numero === '1400.01.000100/2026-01')?.lido).toBe(true);
    expect(aposLido.find((p) => p.numero === '1400.01.000200/2026-02')?.lido).toBe(false);

    // Marca todos como lidos
    const todosLidos = await marcarTodosProcessosComoLidos();
    expect(todosLidos.every((p) => p.lido)).toBe(true);
  });

  it('salva e recupera status da sessão', async () => {
    await salvarStatusSessao('conectado');
    const sessao = await obterStatusSessao();
    expect(sessao.status).toBe('conectado');
    expect(sessao.ultimaVerificacao).toBeTruthy();
  });
});

