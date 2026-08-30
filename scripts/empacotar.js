import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

/**
 * Gera o dist.zip que vai para a Chrome Web Store, a partir do que o build produziu.
 *
 * Existe porque o zip anterior era montado à mão e ficou parado na 1.0.1 — ele ainda
 * pedia host_permissions em todos os sites e a permissão `cookies`, já removidos do código,
 * e era esse pacote velho que fazia o navegador avisar sobre acesso amplo na instalação.
 *
 * O manifest fica na raiz do zip, e não dentro de uma pasta: é assim que a Chrome Web Store
 * espera receber o pacote.
 */
const diretorioScript = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(diretorioScript, '..');
const dist = path.join(raiz, 'dist');
const destino = path.join(raiz, 'dist.zip');

if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json não encontrado. Rode `npm run build` antes.');
  process.exit(1);
}

const listarArquivos = (diretorio, prefixo = '') =>
  fs.readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const relativo = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;
    return entrada.isDirectory()
      ? listarArquivos(path.join(diretorio, entrada.name), relativo)
      : [relativo];
  });

/* Escrita do ZIP (deflate), sem dependência externa. */

const crcTabela = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTabela[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/**
 * Data fixa nas entradas do zip para que builds do mesmo código produzam bytes idênticos —
 * assim dá para conferir se o pacote enviado corresponde mesmo ao commit publicado.
 */
const DATA_ZIP = { hora: 0, data: 0x2821 }; // 2000-01-01 00:00

const arquivos = listarArquivos(dist).sort();
const registros = [];
const partes = [];
let deslocamento = 0;

for (const nome of arquivos) {
  const conteudo = fs.readFileSync(path.join(dist, nome));
  const comprimido = zlib.deflateRawSync(conteudo, { level: 9 });
  const nomeBytes = Buffer.from(nome, 'utf8');
  const crc = crc32(conteudo);

  const cabecalho = Buffer.alloc(30);
  cabecalho.writeUInt32LE(0x04034b50, 0);
  cabecalho.writeUInt16LE(20, 4); // versão mínima
  cabecalho.writeUInt16LE(0x0800, 6); // nomes em UTF-8
  cabecalho.writeUInt16LE(8, 8); // deflate
  cabecalho.writeUInt16LE(DATA_ZIP.hora, 10);
  cabecalho.writeUInt16LE(DATA_ZIP.data, 12);
  cabecalho.writeUInt32LE(crc, 14);
  cabecalho.writeUInt32LE(comprimido.length, 18);
  cabecalho.writeUInt32LE(conteudo.length, 22);
  cabecalho.writeUInt16LE(nomeBytes.length, 26);

  partes.push(cabecalho, nomeBytes, comprimido);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DATA_ZIP.hora, 12);
  central.writeUInt16LE(DATA_ZIP.data, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comprimido.length, 20);
  central.writeUInt32LE(conteudo.length, 24);
  central.writeUInt16LE(nomeBytes.length, 28);
  central.writeUInt32LE(deslocamento, 42);
  registros.push(Buffer.concat([central, nomeBytes]));

  deslocamento += cabecalho.length + nomeBytes.length + comprimido.length;
}

const diretorioCentral = Buffer.concat(registros);
const fim = Buffer.alloc(22);
fim.writeUInt32LE(0x06054b50, 0);
fim.writeUInt16LE(arquivos.length, 8);
fim.writeUInt16LE(arquivos.length, 10);
fim.writeUInt32LE(diretorioCentral.length, 12);
fim.writeUInt32LE(deslocamento, 16);

fs.writeFileSync(destino, Buffer.concat([...partes, diretorioCentral, fim]));

const { version } = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const tamanho = (fs.statSync(destino).size / 1024).toFixed(0);
console.log(`✓ dist.zip gerado — versão ${version}, ${arquivos.length} arquivos, ${tamanho} KB`);
