import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const diretorioScript = path.dirname(fileURLToPath(import.meta.url));
const diretorioIcones = path.resolve(diretorioScript, '../icons');
const arquivoSvg = path.join(diretorioIcones, 'icon.svg');
const tamanhosIcone = [16, 32, 48, 128];

if (!fs.existsSync(arquivoSvg)) {
  throw new Error(`Arquivo de origem do ícone não encontrado: ${arquivoSvg}`);
}

/**
 * Gera os PNGs exigidos pelo Manifest V3 a partir do SVG da marca.
 * O fallback usa os PNGs versionados para permitir o build em ambientes
 * que não tenham ImageMagick instalado.
 */
const gerarPngs = () => {
  for (const tamanho of tamanhosIcone) {
    const destino = path.join(diretorioIcones, `icon-${tamanho}.png`);
    const resultado = spawnSync(
      'magick',
      [
        arquivoSvg,
        '-background',
        'none',
        '-resize',
        `${tamanho}x${tamanho}`,
        '-define',
        'png:color-type=6',
        destino,
      ],
      { stdio: 'inherit' }
    );

    if (resultado.error || resultado.status !== 0) {
      return false;
    }
  }

  return true;
};

const pngsEstaoAtualizados = () => {
  const dataSvg = fs.statSync(arquivoSvg).mtimeMs;
  return tamanhosIcone.every((tamanho) => {
    const caminhoPng = path.join(diretorioIcones, `icon-${tamanho}.png`);
    return fs.existsSync(caminhoPng) && fs.statSync(caminhoPng).mtimeMs >= dataSvg;
  });
};

if (pngsEstaoAtualizados()) {
  console.log('Ícones PNG já estão atualizados a partir de icons/icon.svg');
} else if (gerarPngs()) {
  console.log('Ícones PNG gerados a partir de icons/icon.svg');
} else {
  const faltantes = tamanhosIcone.filter(
    (tamanho) => !fs.existsSync(path.join(diretorioIcones, `icon-${tamanho}.png`))
  );

  if (faltantes.length > 0) {
    throw new Error(
      `ImageMagick não está disponível e faltam os ícones: ${faltantes.join(', ')}`
    );
  }

  console.warn('ImageMagick não encontrado; usando os PNGs versionados em icons/.');
}
