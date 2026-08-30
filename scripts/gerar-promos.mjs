/**
 * Gera os dois blocos promocionais da Chrome Web Store:
 *
 *   - pequeno .... 440 x 280  (aparece na grade de busca e de categorias)
 *   - letreiro ... 1400 x 560 (usado quando a extensão é destacada na vitrine)
 *
 * Ambos saem em PNG de 24 bits sem canal alfa, como a loja exige — o formato é conferido
 * byte a byte antes de gravar, com JPEG de reserva caso o Chromium escreva alfa.
 *
 * Uso: npm run promos
 *
 * Precisa do Chromium do Playwright (`npx playwright install chromium`). Se você já tem um
 * Chromium na máquina, aponte para ele com a variável CHROMIUM_PATH.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, prepararFontes, servirArquivos, capturarSemAlfa } from './estudio.mjs';

const CACHE_PAGINAS = path.join(RAIZ, 'node_modules', '.cache', 'promo-html');

const SAIDA = path.join(RAIZ, 'store-assets', 'promo');

const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts', 'dados-demo.json'), 'utf8'));
// Processo fictício usado no cartão de notificação do letreiro
const DESTAQUE = dados.processos[0];

/* -------------------------------------------------------------------------- */
/* Elementos de marca                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fundo comum às duas peças: o mesmo azul institucional das capturas de tela, com a grade
 * discreta e um leve halo de varredura, para as peças lerem como um conjunto só.
 */
const fundo = `
  background: radial-gradient(circle at 22% 8%, #2f8fcd 0%, #1769a3 44%, #0e4a76 100%);
  position: relative; overflow: hidden;
`;

const camadasDeFundo = `
  .grade {
    position: absolute; inset: 0; opacity: 0.12; pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,0.55) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.55) 1px, transparent 1px);
  }
  .halo {
    position: absolute; border-radius: 50%; pointer-events: none;
    border: 1px solid rgba(255,255,255,0.16);
  }
`;

/**
 * Marca d'água do radar, desenhada em SVG para ficar nítida em qualquer tamanho.
 *
 * `comAgulha` controla se a varredura e o ponto central entram. Quando o radar é só textura
 * de fundo e fica parcialmente fora da arte, a agulha solta no meio lê como defeito — nesses
 * casos ficam apenas os anéis concêntricos.
 */
const radarDecorativo = (tamanho, opacidade, comAgulha = true) => `
<svg class="radar-marca" width="${tamanho}" height="${tamanho}" viewBox="0 0 200 200"
     style="opacity:${opacidade}" aria-hidden="true">
  <defs>
    <linearGradient id="varredura" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.42"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="92" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="1.5"/>
  <circle cx="100" cy="100" r="66" fill="none" stroke="#fff" stroke-opacity="0.24" stroke-width="1.5"/>
  <circle cx="100" cy="100" r="40" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1.5"/>
  <line x1="100" y1="8" x2="100" y2="192" stroke="#fff" stroke-opacity="0.14"/>
  <line x1="8" y1="100" x2="192" y2="100" stroke="#fff" stroke-opacity="0.14"/>
  ${
    comAgulha
      ? `<path d="M100 100 L192 100 A92 92 0 0 0 100 8 Z" fill="url(#varredura)"/>
  <line x1="100" y1="100" x2="100" y2="8" stroke="#fff" stroke-opacity="0.75" stroke-width="2.5"
        stroke-linecap="round"/>
  <circle cx="100" cy="100" r="6" fill="#fff"/>`
      : ''
  }
</svg>`;

const estiloBase = (temFontes) => `
  ${temFontes ? "@import url('/__fontes/fontes.css');" : ''}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Figtree', 'Trebuchet MS', system-ui, sans-serif;
    color: #fff; ${fundo}
  }
  ${camadasDeFundo}
  h1, .marca-nome {
    font-family: 'Bricolage Grotesque', 'Trebuchet MS', system-ui, sans-serif;
    letter-spacing: -0.03em;
  }
  .icone {
    border-radius: 22%;
    background: #fff;
    box-shadow: 0 10px 26px rgba(4, 30, 50, 0.4);
  }
  .selo-leitura {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 16px 8px 12px; border-radius: 999px;
    background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.26);
    font-weight: 600; white-space: nowrap;
  }
  .selo-leitura svg { flex-shrink: 0; }
`;

/** Cadeado, desenhado inline para não depender de nenhuma biblioteca de ícones */
const iconeCadeado = (tamanho) => `
<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="11" width="18" height="11" rx="2"/>
  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
</svg>`;

/* -------------------------------------------------------------------------- */
/* Peça 1 — bloco pequeno, 440 x 280                                           */
/* -------------------------------------------------------------------------- */

/*
 * Em 440x280 a peça aparece pequena numa grade junto de dezenas de outras: o que precisa
 * sobreviver é a marca e uma frase só. Qualquer texto a mais vira borrão nesse tamanho.
 */
const blocoPequeno = (temFontes) => `
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  ${estiloBase(temFontes)}
  body {
    width: 440px; height: 280px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px; padding: 0 30px; text-align: center;
  }
  .grade { background-size: 40px 40px;
    mask-image: radial-gradient(circle at 50% 42%, #000 4%, transparent 66%); }
  .radar-marca { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  .icone { position: relative; width: 76px; height: 76px; }
  .marca-nome, .frase { position: relative; }
  .marca-nome { margin-top: 16px; font-size: 34px; font-weight: 800; }
  .frase {
    margin-top: 8px; font-size: 16px; line-height: 1.35; font-weight: 500;
    color: rgba(255,255,255,0.9); max-width: 22ch;
  }
</style></head><body>
  <div class="grade"></div>
  ${radarDecorativo(400, 0.32)}
  <img class="icone" src="/__icones/icon-128.png" alt="">
  <div class="marca-nome">SEI! Radar</div>
  <p class="frase">Avisa quando chega processo novo no SEI</p>
</body></html>`;

/* -------------------------------------------------------------------------- */
/* Peça 2 — letreiro, 1400 x 560                                               */
/* -------------------------------------------------------------------------- */

/*
 * O letreiro tem espaço para dizer o que a extensão faz e mostrar o resultado. O cartão à
 * direita reproduz a notificação real do Chrome, com um processo fictício — é o que a pessoa
 * de fato vê quando usa a extensão.
 */
const blocoLetreiro = (temFontes) => `
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  ${estiloBase(temFontes)}
  body {
    width: 1400px; height: 560px;
    display: flex; align-items: center; gap: 70px; padding: 0 90px;
  }
  .grade { background-size: 56px 56px;
    mask-image: radial-gradient(circle at 28% 40%, #000 6%, transparent 70%); }
  .radar-marca { position: absolute; bottom: -300px; right: -140px; }
  .halo-1 { width: 780px; height: 780px; right: -260px; top: -110px; }
  .halo-2 { width: 1120px; height: 1120px; right: -430px; top: -280px; }

  .coluna-texto { position: relative; flex: 1; max-width: 640px; }
  .marca {
    display: flex; align-items: center; gap: 14px; margin-bottom: 30px;
  }
  .marca .icone { width: 52px; height: 52px; }
  .marca-nome { font-size: 27px; font-weight: 700; }
  h1 { font-size: 47px; font-weight: 800; line-height: 1.1; }
  .subtitulo {
    margin-top: 20px; font-size: 21px; line-height: 1.45; font-weight: 500;
    color: rgba(255,255,255,0.86); max-width: 40ch;
  }
  .selo-leitura { margin-top: 30px; font-size: 16px; }

  .coluna-arte { position: relative; flex-shrink: 0; width: 470px; }

  /* Cartão que imita a notificação nativa do Chrome */
  .notificacao {
    border-radius: 14px; background: #fff; color: #2f3439; padding: 20px 22px;
    box-shadow: 0 26px 60px rgba(4, 28, 48, 0.45);
  }
  .notificacao-topo {
    display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
    color: #59636c; font-size: 13px; font-weight: 600;
  }
  .notificacao-topo img { width: 20px; height: 20px; border-radius: 5px; }
  .notificacao-topo .agora { margin-left: auto; font-weight: 500; }
  .notificacao h2 {
    font-family: 'Bricolage Grotesque', 'Trebuchet MS', system-ui, sans-serif;
    font-size: 19px; font-weight: 700; letter-spacing: -0.02em; color: #1a1f24;
  }
  .notificacao .numero {
    margin-top: 8px; font-size: 16px; font-weight: 700; color: #1769a3;
  }
  .notificacao .assunto {
    margin-top: 6px; font-size: 15px; line-height: 1.4; color: #454f58;
  }
  .notificacao .marcadores { margin-top: 16px; display: flex; gap: 8px; }
  .chip {
    padding: 5px 11px; border-radius: 999px; background: #e3edf5; color: #125684;
    font-size: 12.5px; font-weight: 600;
  }
  .chip--pessoa { background: #eef0f2; color: #454f58; }
</style></head><body>
  <div class="grade"></div>
  <div class="halo halo-1"></div>
  <div class="halo halo-2"></div>
  ${radarDecorativo(780, 0.4, false)}

  <div class="coluna-texto">
    <div class="marca">
      <img class="icone" src="/__icones/icon-128.png" alt="">
      <span class="marca-nome">SEI! Radar</span>
    </div>
    <h1>Chegou processo novo?<br>Você fica sabendo na hora.</h1>
    <p class="subtitulo">
      Notificações automáticas dos processos da sua unidade no SEI, com assunto, atribuição
      e link direto para abrir.
    </p>
    <span class="selo-leitura">${iconeCadeado(17)} Somente leitura. Nada é alterado no SEI.</span>
  </div>

  <div class="coluna-arte">
    <div class="notificacao">
      <div class="notificacao-topo">
        <img src="/__icones/icon-128.png" alt="">
        <span>SEI! Radar</span>
        <span class="agora">agora</span>
      </div>
      <h2>Novo processo na sua unidade</h2>
      <p class="numero">${DESTAQUE.numero}</p>
      <p class="assunto">${DESTAQUE.assunto}</p>
      <div class="marcadores">
        <span class="chip">${DESTAQUE.marcadores[0].nome}</span>
        <span class="chip chip--pessoa">Atribuído a você</span>
      </div>
    </div>
  </div>
</body></html>`;

/* -------------------------------------------------------------------------- */

const PECAS = [
  { nome: 'bloco-pequeno-440x280', largura: 440, altura: 280, html: blocoPequeno },
  { nome: 'bloco-letreiro-1400x560', largura: 1400, altura: 560, html: blocoLetreiro },
];

const principal = async () => {
  const temFontes = await prepararFontes();
  const { base, fechar } = await servirArquivos({
    '/__icones': path.join(RAIZ, 'icons'),
    '/__paginas': CACHE_PAGINAS,
  });
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.mkdirSync(CACHE_PAGINAS, { recursive: true });

  const navegador = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );

  try {
    for (const peca of PECAS) {
      const contexto = await navegador.newContext({
        viewport: { width: peca.largura, height: peca.altura },
        // A loja pede exatamente estas dimensões em pixels, então nada de escala 2x
        deviceScaleFactor: 1,
        locale: 'pt-BR',
      });
      const pagina = await contexto.newPage();

      // A peça é gravada em disco e aberta pela mesma origem do servidor, em vez de
      // injetada com setContent: assim as fontes e os ícones em /__fontes e /__icones
      // resolvem como caminhos absolutos normais.
      const arquivoHtml = path.join(CACHE_PAGINAS, `${peca.nome}.html`);
      fs.writeFileSync(arquivoHtml, peca.html(temFontes));
      await pagina.goto(`${base}/__paginas/${peca.nome}.html`, { waitUntil: 'load' });
      if (temFontes) await pagina.evaluate(() => document.fonts.ready);
      await pagina.waitForTimeout(120);

      const { destino, formato } = await capturarSemAlfa(pagina, path.join(SAIDA, peca.nome));
      await contexto.close();

      console.log(`  ✓ ${path.basename(destino)} — ${peca.largura}x${peca.altura}, ${formato}`);
    }
  } finally {
    await navegador.close();
    fechar();
  }

  console.log(`\n${PECAS.length} blocos promocionais em store-assets/promo/`);
};

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
