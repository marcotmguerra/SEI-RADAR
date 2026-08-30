import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DIST = path.join(RAIZ, 'dist');

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Serve a pasta `dist/` por HTTP para os testes de ponta a ponta.
 *
 * Não há extensão instalada: o popup roda como página comum. Isso funciona porque
 * `obterArmazenamento()` (src/shared/storage.ts) cai para `localStorage` quando
 * `chrome.storage.local` não existe — então o estado inicial é semeado ali. Precisa ser
 * HTTP e não file://, porque origem opaca não tem localStorage.
 */
export const servirDist = (): Promise<{ base: string; fechar: () => void }> =>
  new Promise((resolve) => {
    const servidor = http.createServer((req, res) => {
      const caminho = decodeURIComponent((req.url || '/').split('?')[0] ?? '/');
      const arquivo = path.join(DIST, path.normalize(caminho).replace(/^(\.\.[/\\])+/, ''));

      if (!arquivo.startsWith(DIST) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404).end('não encontrado');
        return;
      }

      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
      });
      fs.createReadStream(arquivo).pipe(res);
    });

    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${port}`, fechar: () => servidor.close() });
    });
  });
