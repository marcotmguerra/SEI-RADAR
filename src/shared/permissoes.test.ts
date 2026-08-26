import { describe, it, expect, afterEach, vi } from 'vitest';
import { ehOrigemSuportada, obterPadraoOrigem, solicitarPermissaoParaUrl } from './permissoes';

describe('ehOrigemSuportada', () => {
  it('aceita domínios institucionais brasileiros que hospedam o SEI', () => {
    expect(ehOrigemSuportada('https://www.sei.mg.gov.br/sei/controlador.php')).toBe(true);
    expect(ehOrigemSuportada('https://sei.trf1.jus.br/sei/controlador.php')).toBe(true);
    expect(ehOrigemSuportada('https://sei.camara.leg.br/sei/controlador.php')).toBe(true);
    expect(ehOrigemSuportada('https://sei.mpmg.mp.br/sei/controlador.php')).toBe(true);
    expect(ehOrigemSuportada('https://sei.defensoria.def.br/sei/controlador.php')).toBe(true);
  });

  it('rejeita domínios fora da lista institucional suportada', () => {
    expect(ehOrigemSuportada('https://exemplo.com/sei')).toBe(false);
    expect(ehOrigemSuportada('https://gov.br.exemplo.com/sei')).toBe(false);
    expect(ehOrigemSuportada('não é uma url')).toBe(false);
  });
});

describe('obterPadraoOrigem', () => {
  it('converte a URL completa no padrão de origem para chrome.permissions', () => {
    expect(obterPadraoOrigem('https://www.sei.mg.gov.br/sei/controlador.php?acao=x')).toBe(
      'https://www.sei.mg.gov.br/*'
    );
    expect(obterPadraoOrigem('não é uma url')).toBeNull();
  });
});

describe('solicitarPermissaoParaUrl', () => {
  afterEach(() => {
    delete (globalThis as any).chrome;
    vi.restoreAllMocks();
  });

  it('não chama chrome.permissions quando o domínio não é institucional suportado', async () => {
    const contains = vi.fn();
    const request = vi.fn();
    (globalThis as any).chrome = { permissions: { contains, request } };

    const resultado = await solicitarPermissaoParaUrl('https://exemplo.com/sei');

    expect(resultado).toBe(false);
    expect(contains).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('solicita a permissão apenas para a origem específica de um domínio suportado', async () => {
    const contains = vi.fn().mockResolvedValue(false);
    const request = vi.fn().mockResolvedValue(true);
    (globalThis as any).chrome = { permissions: { contains, request } };

    const resultado = await solicitarPermissaoParaUrl('https://www.sei.mg.gov.br/sei/controlador.php');

    expect(resultado).toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ['https://www.sei.mg.gov.br/*'] });
  });
});
