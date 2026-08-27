import { describe, it, expect, beforeEach } from 'vitest';
import {
  obterConfiguracao,
  salvarConfiguracao,
  obterProcessos,
  salvarProcessos,
  marcarProcessoComoLido,
  marcarTodosProcessosComoLidos,
  limparProcessos,
  obterStatusSessao,
  salvarStatusSessao,
  obterMarcadoresDisponiveis,
  salvarMarcadoresDisponiveis,
  obterAndamentos,
  salvarAndamentos,
  limparAndamentos,
  andamentoEstaFresco,
  obterFiltrosUi,
  salvarFiltrosUi,
  VALIDADE_ANDAMENTO_MS,
  VALIDADE_ERRO_MS,
} from './storage';
import type { AndamentoProcesso, ProcessoSei } from '../types';

const criarAndamento = (
  numero: string,
  coletadoEm: string = new Date().toISOString()
): AndamentoProcesso => ({
  numero,
  unidadeGeradora: 'SEC',
  enviadoPorUnidade: '1ªCIA',
  dataEnvio: '2026-08-20T17:32:00.000Z',
  atualizadoEmSei: '2026-08-22T12:15:00.000Z',
  linhas: [],
  coletadoEm,
});

describe('Storage Manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retorna configurações padrão inicialmente para nova instalação', async () => {
    const config = await obterConfiguracao();
    expect(config.intervaloMinutos).toBe(5);
    expect(config.somAtivo).toBe(true);
    expect(config.notificacoesAtivas).toBe(true);
    expect(config.regraNotificacao).toBe('todos');
    expect(config.usuarioSigla).toBe('');
    expect(config.marcadoresNotificacao).toEqual([]);
    expect(config.primeiraCargaRealizada).toBe(false);
    expect(config.escopoRadar).toBe('atribuidos');
    expect(config.marcadoresRadar).toEqual([]);
    expect(config.radarOnboardingConcluido).toBe(false);
    expect(config.urlControle).toContain('controlador.php?acao=procedimento_controlar');
  });

  it('migra usuários legados automaticamente sem alterar comportamento', async () => {
    // Simula storage antigo de usuário que já utilizava a extensão
    localStorage.setItem(
      'sei_monitor_configuracao',
      JSON.stringify({
        intervaloMinutos: 5,
        somAtivo: true,
        notificacoesAtivas: true,
        regraNotificacao: 'atribuidos',
        usuarioSigla: '00652162614',
        marcadoresNotificacao: ['Urgente'],
        primeiraCargaRealizada: true,
      })
    );

    const configMigrada = await obterConfiguracao();
    expect(configMigrada.radarOnboardingConcluido).toBe(true);
    expect(configMigrada.escopoRadar).toBe('unidade'); // Mantém o comportamento original
    expect(configMigrada.usuarioSigla).toBe('00652162614');
    expect(configMigrada.marcadoresRadar).toEqual(['Urgente']);
    expect(configMigrada.primeiraCargaRealizada).toBe(true);
  });

  it('salva e recupera alterações de configuração incluindo radar', async () => {
    await salvarConfiguracao({
      intervaloMinutos: 10,
      somAtivo: false,
      regraNotificacao: 'atribuidos_e_marcadores',
      usuarioSigla: 'MG123456',
      marcadoresNotificacao: ['Urgente', 'Licitação'],
      primeiraCargaRealizada: true,
      escopoRadar: 'marcadores',
      marcadoresRadar: ['Urgente', 'Licitação'],
      radarOnboardingConcluido: true,
    });
    const atualizado = await obterConfiguracao();
    expect(atualizado.intervaloMinutos).toBe(10);
    expect(atualizado.somAtivo).toBe(false);
    expect(atualizado.notificacoesAtivas).toBe(true);
    expect(atualizado.regraNotificacao).toBe('atribuidos_e_marcadores');
    expect(atualizado.usuarioSigla).toBe('MG123456');
    expect(atualizado.marcadoresNotificacao).toEqual(['Urgente', 'Licitação']);
    expect(atualizado.primeiraCargaRealizada).toBe(true);
    expect(atualizado.escopoRadar).toBe('marcadores');
    expect(atualizado.marcadoresRadar).toEqual(['Urgente', 'Licitação']);
    expect(atualizado.radarOnboardingConcluido).toBe(true);
  });

  it('gerencia marcadores disponíveis com deduplicação case-insensitive', async () => {
    expect(await obterMarcadoresDisponiveis()).toEqual([]);

    await salvarMarcadoresDisponiveis(['Urgente', 'Licitações', 'urgente', 'FINANCEIRO']);
    const salvos = await obterMarcadoresDisponiveis();
    expect(salvos).toContain('Urgente');
    expect(salvos).toContain('Licitações');
    expect(salvos).toContain('FINANCEIRO');
    expect(salvos.filter((m) => m.toLowerCase() === 'urgente')).toHaveLength(1);
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

  it('limpa todos os processos sincronizados', async () => {
    await salvarProcessos([
      {
        numero: '1400.01.000300/2026-03',
        assunto: 'Assunto 3',
        link: 'https://sei.mg.gov.br/3',
        detectadoEm: new Date().toISOString(),
        lido: false,
      },
    ]);
    expect(await obterProcessos()).toHaveLength(1);

    await limparProcessos();
    expect(await obterProcessos()).toEqual([]);
  });

  it('salva e recupera status da sessão', async () => {
    await salvarStatusSessao('conectado');
    const sessao = await obterStatusSessao();
    expect(sessao.status).toBe('conectado');
    expect(sessao.ultimaVerificacao).toBeTruthy();
  });

  describe('cache de andamentos', () => {
    it('grava e recupera andamentos indexados por número', async () => {
      await salvarAndamentos([criarAndamento('1400.01.000100/2026-01')]);
      const guardados = await obterAndamentos();
      expect(guardados['1400.01.000100/2026-01']?.unidadeGeradora).toBe('SEC');
      expect(guardados['1400.01.000100/2026-01']?.enviadoPorUnidade).toBe('1ªCIA');
    });

    it('sobrescreve o andamento anterior do mesmo processo', async () => {
      await salvarAndamentos([criarAndamento('1400.01.000100/2026-01')]);
      await salvarAndamentos([
        { ...criarAndamento('1400.01.000100/2026-01'), unidadeGeradora: 'CMDO' },
      ]);
      const guardados = await obterAndamentos();
      expect(Object.keys(guardados)).toHaveLength(1);
      expect(guardados['1400.01.000100/2026-01']?.unidadeGeradora).toBe('CMDO');
    });

    it('considera fresco apenas o que está dentro da validade', async () => {
      const agora = Date.now();
      expect(andamentoEstaFresco(criarAndamento('a'), agora)).toBe(true);

      const vencido = criarAndamento('b', new Date(agora - VALIDADE_ANDAMENTO_MS - 1000).toISOString());
      expect(andamentoEstaFresco(vencido, agora)).toBe(false);

      expect(andamentoEstaFresco(undefined, agora)).toBe(false);
    });

    it('não guarda uma falha pelo mesmo tempo de um sucesso', async () => {
      const agora = Date.now();
      const comErro = {
        ...criarAndamento('c', new Date(agora - VALIDADE_ERRO_MS - 1000).toISOString()),
        erro: 'Link do histórico não localizado (3 página(s) inspecionada(s)).',
      };

      // Passados os poucos minutos de validade, a falha deve ser reconsultada...
      expect(andamentoEstaFresco(comErro, agora)).toBe(false);

      // ...enquanto um sucesso da mesma idade continua válido
      const sucessoMesmaIdade = criarAndamento(
        'd',
        new Date(agora - VALIDADE_ERRO_MS - 1000).toISOString()
      );
      expect(andamentoEstaFresco(sucessoMesmaIdade, agora)).toBe(true);
    });

    it('segura a falha por alguns minutos para não martelar o SEI', () => {
      const agora = Date.now();
      const recemFalhado = { ...criarAndamento('e'), erro: 'HTTP 500' };
      expect(andamentoEstaFresco(recemFalhado, agora)).toBe(true);
    });

    it('poda os andamentos mais antigos ao ultrapassar o limite', async () => {
      const base = Date.now();
      const muitos = Array.from({ length: 505 }, (_, i) =>
        criarAndamento(`proc-${i}`, new Date(base - i * 1000).toISOString())
      );

      await salvarAndamentos(muitos);
      const guardados = await obterAndamentos();

      expect(Object.keys(guardados)).toHaveLength(500);
      // Os mais recentes sobrevivem; os cinco mais antigos são descartados
      expect(guardados['proc-0']).toBeDefined();
      expect(guardados['proc-504']).toBeUndefined();
    });

    it('limpa o cache por completo', async () => {
      await salvarAndamentos([criarAndamento('1400.01.000100/2026-01')]);
      await limparAndamentos();
      expect(await obterAndamentos()).toEqual({});
    });
  });

  describe('filtros da interface', () => {
    it('devolve os padrões quando nada foi salvo', async () => {
      const filtros = await obterFiltrosUi();
      expect(filtros).toEqual({
        filtroTipo: 'todos',
        periodoFiltro: 'todos',
        marcadorFiltro: null,
      });
    });

    it('persiste alterações parciais preservando o restante', async () => {
      await salvarFiltrosUi({ filtroTipo: 'sem_atribuicao' });
      await salvarFiltrosUi({ marcadorFiltro: 'Urgente' });

      const filtros = await obterFiltrosUi();
      expect(filtros.filtroTipo).toBe('sem_atribuicao');
      expect(filtros.marcadorFiltro).toBe('Urgente');
      expect(filtros.periodoFiltro).toBe('todos');
    });
  });
});

