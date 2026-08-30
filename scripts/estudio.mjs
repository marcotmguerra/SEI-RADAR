/**
 * Peças comuns aos scripts que renderizam imagens da loja (screenshots e blocos
 * promocionais): download das fontes da marca, um servidor estático mínimo e a
 * verificação do formato exigido pela Chrome Web Store.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE_FONTES = path.join(RAIZ, 'node_modules', '.cache', 'fontes-loja');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/**
 * O popup pede 'Figtree' e 'Bricolage Grotesque', que a extensão não empacota — em máquinas
 * sem elas o CSS cai para Trebuchet MS. Aqui elas são baixadas e servidas localmente para as
 * imagens saírem com a tipografia que o design pede. Sem rede, seguimos com a fonte do
 * sistema: a imagem continua válida, só muda o desenho das letras.
 */
export const prepararFontes = async () => {
  const css = path.join(CACHE_FONTES, 'fontes.css');
  if (fs.existsSync(css)) return true;

  fs.mkdirSync(CACHE_FONTES, { recursive: true });
  const url =
    'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800' +
    '&family=Bricolage+Grotesque:wght@600;700;800&display=block';

  try {
    const resposta = await fetch(url, {
      headers: {
        // Sem User-Agent de navegador o Google devolve TTF em vez de woff2
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      },
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    let folha = await resposta.text();

    const arquivos = [...new Set(folha.match(/https:\/\/fonts\.gstatic\.com[^)]+/g) || [])];
    for (const [i, arquivo] of arquivos.entries()) {
      const bin = await fetch(arquivo);
      if (!bin.ok) throw new Error(`HTTP ${bin.status} em ${arquivo}`);
      const nome = `fonte-${i}.woff2`;
      fs.writeFileSync(path.join(CACHE_FONTES, nome), Buffer.from(await bin.arrayBuffer()));
      folha = folha.split(arquivo).join(`/__fontes/${nome}`);
    }

    fs.writeFileSync(css, folha);
    return true;
  } catch (erro) {
    console.warn(`  ! Fontes indisponíveis (${erro.message}); usando a fonte do sistema.`);
    fs.rmSync(CACHE_FONTES, { recursive: true, force: true });
    return false;
  }
};

/**
 * Sobe um servidor estático nas raízes informadas ({ prefixoUrl: diretório }).
 *
 * Serve por HTTP, e não file://, porque origem opaca não tem localStorage — de que os
 * screenshots dependem para semear o estado do popup.
 */
export const servirArquivos = (raizes) =>
  new Promise((resolve) => {
    const entradas = Object.entries({ '/__fontes': CACHE_FONTES, ...raizes });

    const servidor = http.createServer((req, res) => {
      const caminho = decodeURIComponent((req.url || '/').split('?')[0]);
      const par = entradas.find(([prefixo]) => prefixo !== '/' && caminho.startsWith(`${prefixo}/`));
      const [prefixo, diretorio] = par || ['', raizes['/']];

      if (!diretorio) {
        res.writeHead(404).end('sem raiz para esse caminho');
        return;
      }

      const relativo = path.normalize(caminho.slice(prefixo.length)).replace(/^(\.\.[/\\])+/, '');
      const arquivo = path.join(diretorio, relativo);

      if (!arquivo.startsWith(diretorio) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404).end('não encontrado');
        return;
      }

      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
      fs.createReadStream(arquivo).pipe(res);
    });

    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      resolve({ base: `http://127.0.0.1:${port}`, fechar: () => servidor.close() });
    });
  });

/**
 * Lê o color type do IHDR de um PNG. A Chrome Web Store exige 24 bits **sem alfa**, que é o
 * color type 2 (truecolor). Um PNG com canal alfa é o 6, e a loja rejeita.
 */
export const pngSemAlfa = (buffer) =>
  buffer.length > 25 &&
  buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
  buffer[25] === 2;

/**
 * Captura a página garantindo o formato que a loja aceita.
 *
 * O Chromium costuma gravar PNG truecolor quando a página é totalmente opaca, mas isso não é
 * contratual — se vier com alfa, refazemos em JPEG, que a loja também aceita e que não tem
 * canal alfa por definição. Melhor trocar de formato do que enviar um arquivo recusado.
 */
export const capturarSemAlfa = async (pagina, destinoSemExtensao) => {
  const png = await pagina.screenshot({ type: 'png' });

  if (pngSemAlfa(png)) {
    const destino = `${destinoSemExtensao}.png`;
    fs.writeFileSync(destino, png);
    return { destino, formato: 'PNG 24 bits (truecolor, sem alfa)' };
  }

  const destino = `${destinoSemExtensao}.jpg`;
  fs.writeFileSync(destino, await pagina.screenshot({ type: 'jpeg', quality: 95 }));
  return { destino, formato: 'JPEG (PNG saiu com canal alfa)' };
};
