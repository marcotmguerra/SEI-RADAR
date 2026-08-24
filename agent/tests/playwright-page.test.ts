import { describe, expect, it, vi } from 'vitest';
import { criarPortaPaginaPlaywright } from '../src/browser/playwright-page';

describe('criarPortaPaginaPlaywright', () => {
  it('delega leituras ao primeiro localizador e avanca pagina habilitada', async () => {
    const localizador = {
      first: vi.fn(() => localizador),
      count: vi.fn(async () => 1),
      innerText: vi.fn(async () => 'texto'),
      getAttribute: vi.fn(async (nome: string) => {
        if (nome === 'class') return 'link';
        if (nome === 'href') return '/controlador.php?acao=procedimento_controlar&pagina=2';
        return null;
      }),
      allTextContents: vi.fn(async () => ['A', 'B']),
      click: vi.fn(async () => undefined),
    };
    const pagina = {
      locator: vi.fn(() => localizador),
      url: vi.fn(() => 'https://sei.example/controlador.php?acao=procedimento_controlar'),
      goto: vi.fn(async () => undefined),
    };
    const porta = criarPortaPaginaPlaywright(
      pagina as never,
      'https://sei.example/controlador.php?acao=procedimento_controlar',
    );

    await expect(porta.contar('x')).resolves.toBe(1);
    await expect(porta.texto('x')).resolves.toBe('texto');
    await expect(porta.atributo('x', 'title')).resolves.toBeNull();
    await expect(porta.textos('x')).resolves.toEqual(['A', 'B']);
    await expect(porta.proximo('x')).resolves.toBe(true);
    expect(localizador.click).not.toHaveBeenCalled();
    expect(pagina.goto).toHaveBeenCalledWith(
      'https://sei.example/controlador.php?acao=procedimento_controlar&pagina=2',
      { waitUntil: 'domcontentloaded' },
    );
  });

  it('nao clica quando o proximo link esta ausente ou desabilitado', async () => {
    const ausente = {
      first: () => ausente,
      count: async () => 0,
      getAttribute: vi.fn(),
      click: vi.fn(),
    };
    const portaAusente = criarPortaPaginaPlaywright(
      { locator: () => ausente } as never,
      'https://sei.example/controlador.php?acao=procedimento_controlar',
    );
    await expect(portaAusente.proximo('proximo')).resolves.toBe(false);

    const desabilitado = {
      first: () => desabilitado,
      count: async () => 1,
      getAttribute: async (nome: string) => (nome === 'aria-desabilitado' ? 'true' : null),
      click: vi.fn(),
    };
    const portaDesabilitada = criarPortaPaginaPlaywright(
      { locator: () => desabilitado } as never,
      'https://sei.example/controlador.php?acao=procedimento_controlar',
    );
    await expect(portaDesabilitada.proximo('proximo')).resolves.toBe(false);
    expect(desabilitado.click).not.toHaveBeenCalled();
  });

  it.each([
    null,
    'javascript:alert(1)',
    'https://externo.example/controlador.php?acao=procedimento_controlar',
    '/outra-rota?acao=procedimento_controlar',
    '/controlador.php?acao=usuario_sair',
    '/controlador.php?acao=procedimento_controlar&acao=procedimento_controlar',
  ])('falha fechado para destino de paginacao inseguro: %s', async (destinoHref) => {
    const localizador = {
      first: () => localizador,
      count: async () => 1,
      getAttribute: async (nome: string) => (nome === 'href' ? destinoHref : null),
    };
    const pagina = {
      locator: () => localizador,
      url: () => 'https://sei.example/controlador.php?acao=procedimento_controlar',
      goto: vi.fn(),
    };
    const porta = criarPortaPaginaPlaywright(
      pagina as never,
      'https://sei.example/controlador.php?acao=procedimento_controlar',
    );

    await expect(porta.proximo('proximo')).rejects.toThrow(/paginação/i);
    expect(pagina.goto).not.toHaveBeenCalled();
  });
});
