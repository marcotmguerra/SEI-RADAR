import { describe, expect, it, vi } from 'vitest';
import { ErroSessaoExpirada, ErroLayout } from '../src/browser/errors';
import { executarSincronizacao } from '../src/sync/sync-once';

const criarDependenciasBase = () => ({
  unidade: 'Unidade A',
  urlControle: 'https://sei.example/controlador.php',
  instalacaoId: '10000000-0000-4000-8000-000000000001',
  tokenInstalacao: 'token-local-com-pelo-menos-32-caracteres',
  abrirNavegador: vi.fn(),
  enviar: vi.fn(async () => undefined),
  agora: vi
    .fn<() => Date>()
    .mockReturnValueOnce(new Date('2026-01-01T10:00:00.000Z'))
    .mockReturnValueOnce(new Date('2026-01-01T10:00:02.000Z')),
  id: () => '00000000-0000-4000-8000-000000000001',
});

describe('executarSincronizacao', () => {
  it('envia retrato completo e fecha o navegador', async () => {
    const dependencias = criarDependenciasBase();
    const fechar = vi.fn(async () => undefined);
    dependencias.abrirNavegador.mockResolvedValue({
      fechar,
      fonte: {
        contagemEsperada: async () => 1,
        numerosProcessos: async () => ['1400.01.000001/2026-01'],
        irProximaPagina: async () => false,
      },
    });

    const resultado = await executarSincronizacao(dependencias);

    expect(resultado.status).toBe('SUCESSO');
    expect(resultado).toMatchObject({
      instalacao_id: '10000000-0000-4000-8000-000000000001',
      token_instalacao: 'token-local-com-pelo-menos-32-caracteres',
    });
    expect(resultado.completa).toBe(true);
    expect(resultado.processos).toEqual([{ numero: '1400.01.000001/2026-01' }]);
    expect(fechar).toHaveBeenCalledOnce();
    expect(dependencias.enviar).toHaveBeenCalledWith(resultado);
  });

  it.each([
    [new ErroSessaoExpirada(), 'SESSAO_EXPIRADA'],
    [new ErroLayout(), 'ERRO_LAYOUT_COLETOR'],
  ] as const)('fecha o navegador e registra %s como %s', async (erro, status) => {
    const dependencias = criarDependenciasBase();
    const fechar = vi.fn(async () => undefined);
    dependencias.abrirNavegador.mockResolvedValue({
      fechar,
      fonte: {
        contagemEsperada: async () => {
          throw erro;
        },
        numerosProcessos: async () => [],
        irProximaPagina: async () => false,
      },
    });

    const resultado = await executarSincronizacao(dependencias);

    expect(resultado).toMatchObject({ status, completa: false, processos: [] });
    expect(fechar).toHaveBeenCalledOnce();
    expect(dependencias.enviar).toHaveBeenCalledWith(resultado);
  });

  it('registra a contagem sem enviar itens parciais quando a coleta diverge', async () => {
    const dependencias = criarDependenciasBase();
    dependencias.abrirNavegador.mockResolvedValue({
      fechar: vi.fn(async () => undefined),
      fonte: {
        contagemEsperada: async () => 2,
        numerosProcessos: async () => ['1400.01.000001/2026-01'],
        irProximaPagina: async () => false,
      },
    });

    const resultado = await executarSincronizacao(dependencias);

    expect(resultado).toMatchObject({
      status: 'INCOMPLETA',
      completa: false,
      capturado: 1,
      processos: [],
      atribuicoes_completas: false,
      marcadores_completos: false,
    });
  });

  it('registra ERROR se o navegador nao abrir ou nao puder ser fechado', async () => {
    const abertura = criarDependenciasBase();
    abertura.abrirNavegador.mockRejectedValue(new Error('chromium indisponivel'));
    await expect(executarSincronizacao(abertura)).resolves.toMatchObject({ status: 'ERRO', processos: [] });

    const fechamento = criarDependenciasBase();
    fechamento.abrirNavegador.mockResolvedValue({
      fechar: vi.fn(async () => {
        throw new Error('falha ao fechar');
      }),
      fonte: {
        contagemEsperada: async () => 0,
        numerosProcessos: async () => [],
        irProximaPagina: async () => false,
      },
    });
    await expect(executarSincronizacao(fechamento)).resolves.toMatchObject({
      status: 'ERRO',
      processos: [],
      atribuicoes_completas: false,
      marcadores_completos: false,
    });
  });

  it('mescla atribuicoes e marcadores somente apos coletas completas', async () => {
    const dependencias = criarDependenciasBase();
    const primeiro = '1400.01.000001/2026-01';
    const segundo = '1400.01.000002/2026-02';
    dependencias.abrirNavegador.mockResolvedValue({
      fechar: vi.fn(async () => undefined),
      fonte: {
        contagemEsperada: async () => 2,
        numerosProcessos: async () => [primeiro, segundo],
        irProximaPagina: async () => false,
      },
      fonteAtribuidos: {
        contagemEsperada: async () => 1,
        numerosProcessos: async () => [segundo],
        irProximaPagina: async () => false,
      },
      fontesMarcadores: {
        Urgente: {
          contagemEsperada: async () => 1,
          numerosProcessos: async () => [primeiro],
          irProximaPagina: async () => false,
        },
        Revisar: {
          contagemEsperada: async () => 1,
          numerosProcessos: async () => [segundo],
          irProximaPagina: async () => false,
        },
      },
    });

    const resultado = await executarSincronizacao(dependencias);

    expect(resultado).toMatchObject({
      status: 'SUCESSO',
      atribuicoes_completas: true,
      atribuicoes_esperadas: 1,
      atribuicoes_capturadas: 1,
      marcadores_completos: true,
    });
    expect(resultado.processos).toEqual([
      { numero: primeiro, atribuido_a_mim: false, marcadores: ['Urgente'] },
      { numero: segundo, atribuido_a_mim: true, marcadores: ['Revisar'] },
    ]);
  });

  it('mantem a lista principal valida sem aplicar atribuicoes incompletas', async () => {
    const dependencias = criarDependenciasBase();
    const numero = '1400.01.000001/2026-01';
    dependencias.abrirNavegador.mockResolvedValue({
      fechar: vi.fn(async () => undefined),
      fonte: {
        contagemEsperada: async () => 1,
        numerosProcessos: async () => [numero],
        irProximaPagina: async () => false,
      },
      fonteAtribuidos: {
        contagemEsperada: async () => 2,
        numerosProcessos: async () => [numero],
        irProximaPagina: async () => false,
      },
    });

    const resultado = await executarSincronizacao(dependencias);

    expect(resultado).toMatchObject({
      status: 'SUCESSO',
      completa: true,
      atribuicoes_completas: false,
      atribuicoes_esperadas: 2,
      atribuicoes_capturadas: 1,
    });
    expect(resultado.processos).toEqual([{ numero: numero }]);
  });

  it('nao aplica nenhum marcador se uma das listas configuradas falhar', async () => {
    const dependencias = criarDependenciasBase();
    const numero = '1400.01.000001/2026-01';
    dependencias.abrirNavegador.mockResolvedValue({
      fechar: vi.fn(async () => undefined),
      fonte: {
        contagemEsperada: async () => 1,
        numerosProcessos: async () => [numero],
        irProximaPagina: async () => false,
      },
      fontesMarcadores: {
        Urgente: {
          contagemEsperada: async () => 1,
          numerosProcessos: async () => [numero],
          irProximaPagina: async () => false,
        },
        Quebrado: {
          contagemEsperada: async () => {
            throw new ErroLayout();
          },
          numerosProcessos: async () => [],
          irProximaPagina: async () => false,
        },
      },
    });

    const resultado = await executarSincronizacao(dependencias);

    expect(resultado).toMatchObject({ status: 'SUCESSO', completa: true, marcadores_completos: false });
    expect(resultado.processos).toEqual([{ numero: numero }]);
  });
});
