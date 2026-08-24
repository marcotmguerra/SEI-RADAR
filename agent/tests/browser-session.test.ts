import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracaoAgente } from '../src/config/config';

const simulacoes = vi.hoisted(() => {
  const pagina = {
    goto: vi.fn(async () => undefined),
    locator: vi.fn((seletor: string) => {
      const localizador = {
        first: vi.fn(() => localizador),
        count: vi.fn(async () => (seletor.includes('txtUsuario') ? 0 : 1)),
        innerText: vi.fn(async () => '0 registros'),
        getAttribute: vi.fn(async (nome: string) =>
          nome === 'data-total-registros' ? '0' : null,
        ),
        allTextContents: vi.fn(async () => []),
      };
      return localizador;
    }),
  };
  const contexto = {
    route: vi.fn(async () => undefined),
    newPage: vi.fn(async () => pagina),
    close: vi.fn(async () => undefined),
  };
  const navegador = {
    newContext: vi.fn(async () => contexto),
    close: vi.fn(async () => undefined),
  };
  return { pagina, contexto, navegador, launch: vi.fn(async () => navegador) };
});

vi.mock('playwright', () => ({ chromium: { launch: simulacoes.launch } }));

import { abrirSessaoColetaNavegador } from '../src/browser/session';

const configuracao = (caminhoEstadoSessao: string): ConfiguracaoAgente => ({
  urlBaseSei: 'https://sei.example',
  urlControleSei: 'https://sei.example/controlador.php?acao=procedimento_controlar',
  unidade: 'Unidade A',
  supabase: { url: 'https://x.supabase.co', chavePublica: 'anon-key', email: 'u@x.com', senha: '12345678' },
  instalacao: {
    id: '10000000-0000-4000-8000-000000000001',
    token: 'token-local-com-pelo-menos-32-caracteres',
  },
  caminhoEstadoSessao,
  semInterface: true,
  intervaloMinutos: 10,
  maximoPaginas: 100,
  proxy: { server: 'http://proxy.example:8080' },
});

describe('abrirSessaoColetaNavegador', () => {
  it('aplica proxy/storageState, navega e fecha contexto e navegador', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const diretorio = await mkdtemp(join(tmpdir(), 'crm-sei-sessao-'));
    const caminhoEstado = join(diretorio, 'sei.json');
    await writeFile(caminhoEstado, '{}');

    const sessao = await abrirSessaoColetaNavegador(configuracao(caminhoEstado));
    await sessao.fechar();
    await sessao.fechar();

    expect(simulacoes.launch).toHaveBeenCalledWith({
      headless: true,
      proxy: { server: 'http://proxy.example:8080' },
    });
    expect(simulacoes.navegador.newContext).toHaveBeenCalledWith({ storageState: caminhoEstado });
    expect(simulacoes.contexto.route).toHaveBeenCalledBefore(simulacoes.contexto.newPage);
    expect(simulacoes.pagina.goto).toHaveBeenCalledWith(configuracao(caminhoEstado).urlControleSei, {
      waitUntil: 'domcontentloaded',
    });
    expect(simulacoes.contexto.close).toHaveBeenCalledOnce();
    expect(simulacoes.navegador.close).toHaveBeenCalledOnce();
  });

  it('fecha recursos se a abertura da pagina falhar', async () => {
    simulacoes.contexto.newPage.mockRejectedValueOnce(new Error('falha de pagina'));
    await expect(abrirSessaoColetaNavegador(configuracao('/arquivo/inexistente'))).rejects.toThrow(
      'falha de pagina',
    );
    expect(simulacoes.contexto.close).toHaveBeenCalled();
    expect(simulacoes.navegador.close).toHaveBeenCalled();
  });

  it('cria coletores opcionais preguiçosos no mesmo contexto', async () => {
    const configuracaoEstendida = {
      ...configuracao('/arquivo/inexistente'),
      urlAtribuidos: 'https://sei.example/atribuidos',
      urlsMarcadores: {
        Urgente: 'https://sei.example/marcadores/urgente',
      },
    };
    const sessao = await abrirSessaoColetaNavegador(configuracaoEstendida);
    await expect(sessao.fonteAtribuidos?.contagemEsperada()).resolves.toBe(0);
    await expect(sessao.fontesMarcadores?.Urgente?.contagemEsperada()).resolves.toBe(0);

    expect(simulacoes.pagina.goto).toHaveBeenCalledWith(configuracaoEstendida.urlAtribuidos, {
      waitUntil: 'domcontentloaded',
    });
    expect(simulacoes.pagina.goto).toHaveBeenCalledWith(configuracaoEstendida.urlsMarcadores.Urgente, {
      waitUntil: 'domcontentloaded',
    });
    await sessao.fechar();
  });
});
