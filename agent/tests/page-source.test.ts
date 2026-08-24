import { describe, expect, it, vi } from 'vitest';
import { ErroSessaoExpirada, ErroLayout } from '../src/browser/errors';
import { SeiFontePaginaProcessos, type PortaPaginaSei } from '../src/browser/process-page';

const pagina = (valores: {
  contagemLogin?: number;
  contagemTotal?: number;
  textoTotal?: string;
  textosProcessos?: string[];
}): PortaPaginaSei => ({
  contar: vi.fn(async (seletor: string) => {
    if (seletor === 'login') return valores.contagemLogin ?? 0;
    if (seletor === 'total') return valores.contagemTotal ?? 1;
    return 0;
  }),
  texto: vi.fn(async () => valores.textoTotal ?? ''),
  atributo: vi.fn(async () => null),
  textos: vi.fn(async () => valores.textosProcessos ?? []),
  proximo: vi.fn(async () => false),
});

const seletores = { login: 'login', total: 'total', processos: 'processos', proximo: 'proximo' };

describe('SeiFontePaginaProcessos', () => {
  it('detecta autenticacao expirada antes de interpretar a pagina', async () => {
    const fonte = new SeiFontePaginaProcessos(pagina({ contagemLogin: 1 }), seletores);
    await expect(fonte.contagemEsperada()).rejects.toBeInstanceOf(ErroSessaoExpirada);
  });

  it('interpreta o total de registros com separador de milhar', async () => {
    const fonte = new SeiFontePaginaProcessos(pagina({ textoTotal: '1.234 registros encontrados' }), seletores);
    await expect(fonte.contagemEsperada()).resolves.toBe(1234);
  });

  it('trata total ausente ou ininteligivel como mudanca de layout', async () => {
    const ausente = new SeiFontePaginaProcessos(pagina({ contagemTotal: 0 }), seletores);
    const invalido = new SeiFontePaginaProcessos(pagina({ textoTotal: 'registros encontrados' }), seletores);
    await expect(ausente.contagemEsperada()).rejects.toBeInstanceOf(ErroLayout);
    await expect(invalido.contagemEsperada()).rejects.toBeInstanceOf(ErroLayout);
  });

  it('delega a leitura de processos e a proxima pagina', async () => {
    const porta = pagina({ textosProcessos: ['1400.01.000001/2026-01'] });
    vi.mocked(porta.proximo).mockResolvedValue(true);
    const fonte = new SeiFontePaginaProcessos(porta, seletores);
    await expect(fonte.numerosProcessos()).resolves.toEqual(['1400.01.000001/2026-01']);
    await expect(fonte.irProximaPagina()).resolves.toBe(true);
  });
});
