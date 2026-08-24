import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validarArquivoAmbienteSeguro } from '../src/config/env-file';

describe('validarArquivoAmbienteSeguro', () => {
  it('rejeita permissoes de grupo/outros em sistemas POSIX', async () => {
    const diretorio = await mkdtemp(join(tmpdir(), 'crm-sei-env-'));
    const caminho = join(diretorio, '.env');
    await writeFile(caminho, 'SEGREDO=local\n', { mode: 0o644 });
    await chmod(caminho, 0o644);
    await expect(validarArquivoAmbienteSeguro(caminho, 'linux')).rejects.toThrow(/chmod 600/);
    await chmod(caminho, 0o600);
    await expect(validarArquivoAmbienteSeguro(caminho, 'linux')).resolves.toBeUndefined();
  });

  it('ignora arquivo ausente e deixa ACL do Windows para a plataforma', async () => {
    await expect(validarArquivoAmbienteSeguro('/arquivo/ausente/.env', 'linux')).resolves.toBeUndefined();
    await expect(validarArquivoAmbienteSeguro('/arquivo/ausente/.env', 'win32')).resolves.toBeUndefined();
  });
});
