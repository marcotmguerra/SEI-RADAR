import { stat } from 'node:fs/promises';

export const validarArquivoAmbienteSeguro = async (
  caminho: string,
  plataforma: NodeJS.Platform = process.platform,
): Promise<void> => {
  if (plataforma === 'win32') return;
  let permissoes: number;
  try {
    permissoes = (await stat(caminho)).mode;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw erro;
  }
  if ((permissoes & 0o077) !== 0) {
    throw new Error('O arquivo .env contém segredos locais; restrinja-o com chmod 600');
  }
};
