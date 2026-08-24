import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { realizarLoginManual } from '../src/browser/login';

describe('realizarLoginManual', () => {
  it('abre Chromium visivel, persiste storageState local e sempre fecha', async () => {
    const diretorio = await mkdtemp(join(tmpdir(), 'crm-sei-login-'));
    const caminhoEstadoSessao = join(diretorio, 'auth', 'sei.json');
    const pagina = { goto: vi.fn(async () => undefined) };
    const contexto = {
      newPage: vi.fn(async () => pagina),
      storageState: vi.fn(async ({ path }: { path: string }) => {
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(join(diretorio, 'auth'), { recursive: true });
        await writeFile(path, '{"cookies":[]}');
      }),
      close: vi.fn(async () => undefined),
    };
    const navegador = {
      newContext: vi.fn(async () => contexto),
      close: vi.fn(async () => undefined),
    };
    const iniciarNavegador = vi.fn(async () => navegador);

    await realizarLoginManual(
      {
        urlBaseSei: 'https://sei.example',
        urlControleSei: 'https://sei.example/controlador.php?acao=procedimento_controlar',
        caminhoEstadoSessao,
        proxy: { server: 'http://proxy.example:8080' },
      },
      { iniciarNavegador, aguardarAutenticacao: vi.fn(async () => undefined) },
    );

    expect(iniciarNavegador).toHaveBeenCalledWith({
      headless: false,
      proxy: { server: 'http://proxy.example:8080' },
    });
    expect(pagina.goto).toHaveBeenCalledWith('https://sei.example/controlador.php?acao=procedimento_controlar');
    expect(await readFile(caminhoEstadoSessao, 'utf8')).toContain('cookies');
    expect(contexto.close).toHaveBeenCalledOnce();
    expect(navegador.close).toHaveBeenCalledOnce();
  });
});
