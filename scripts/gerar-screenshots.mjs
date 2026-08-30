/**
 * Gera as imagens 1280x800 da Chrome Web Store a partir do popup real.
 *
 * Não existe extensão instalada aqui: o popup é servido como uma página comum e alimentado
 * com dados fictícios. Isso é possível porque `obterArmazenamento()` (src/shared/storage.ts)
 * cai para `localStorage` quando `chrome.storage.local` não existe — então basta semear as
 * mesmas chaves antes dos scripts da página rodarem, sem nenhuma gambiarra no código de
 * produção. Pelo mesmo motivo o servidor é HTTP e não file://: origem opaca não tem
 * localStorage.
 *
 * Uso: npm run build && npm run screenshots
 *
 * Precisa do Chromium do Playwright (`npx playwright install chromium`). Se você já tem um
 * Chromium na máquina, aponte para ele com a variável CHROMIUM_PATH.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, prepararFontes, servirArquivos } from './estudio.mjs';

const DIST = path.join(RAIZ, 'dist');
const SAIDA = path.join(RAIZ, 'store-assets', 'screenshots');

const LARGURA_POPUP = 520;
const ALTURA_POPUP = 600;
const LARGURA_LOJA = 1280;
const ALTURA_LOJA = 800;

const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts', 'dados-demo.json'), 'utf8'));

/* -------------------------------------------------------------------------- */
/* Dados fictícios                                                             */
/* -------------------------------------------------------------------------- */

const minutosAtras = (minutos) => new Date(Date.now() - minutos * 60_000).toISOString();
const horasAtras = (horas) => new Date(Date.now() - horas * 3_600_000).toISOString();
const emDias = (dias) => new Date(Date.now() + dias * 86_400_000).toISOString();

const montarEstado = ({ onboarding = false } = {}) => {
  const processos = dados.processos.map((p) => ({
    numero: p.numero,
    assunto: p.assunto,
    link: `${dados.configuracao.urlControle}&id_procedimento=${p.numero.replace(/\D/g, '').slice(-6)}`,
    detectadoEm: minutosAtras(p.minutosAtras),
    lido: p.lido,
    atribuidoPara: p.atribuidoPara,
    marcadores: p.marcadores,
    ...(p.prazoEmDias
      ? {
          prazo: emDias(p.prazoEmDias),
          prazoTexto: new Date(Date.now() + p.prazoEmDias * 86_400_000).toLocaleDateString('pt-BR'),
        }
      : {}),
  }));

  const a = dados.andamento;
  const andamentos = {
    [a.numero]: {
      numero: a.numero,
      unidadeGeradora: a.unidadeGeradora,
      enviadoPorUnidade: a.enviadoPorUnidade,
      dataEnvio: horasAtras(a.linhas[0].horasAtras),
      atualizadoEmSei: horasAtras(a.linhas[0].horasAtras),
      linhas: a.linhas.map((l) => ({
        dataHora: horasAtras(l.horasAtras),
        dataHoraTexto: new Date(Date.now() - l.horasAtras * 3_600_000).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        unidade: l.unidade,
        usuario: l.usuario,
        descricao: l.descricao,
      })),
      coletadoEm: new Date().toISOString(),
    },
  };

  return {
    sei_monitor_configuracao: {
      ...dados.configuracao,
      // O onboarding real começa na opção recomendada, não no escopo do resto da demo
      ...(onboarding
        ? {
            radarOnboardingConcluido: false,
            primeiraCargaRealizada: false,
            escopoRadar: 'atribuidos',
          }
        : {}),
    },
    sei_monitor_processos: onboarding ? [] : processos,
    sei_monitor_status: 'conectado',
    sei_monitor_ultima_verificacao: minutosAtras(2),
    sei_monitor_marcadores_disponiveis: dados.marcadores,
    sei_monitor_andamentos: onboarding ? {} : andamentos,
    sei_monitor_filtros_ui: { filtroTipo: 'todos', periodoFiltro: 'todos', marcadorFiltro: null },
  };
};

/* -------------------------------------------------------------------------- */
/* Composição 1280x800                                                         */
/* -------------------------------------------------------------------------- */

const paginaDeComposicao = (pngBase64, titulo, legenda, temFontes) => `
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
${temFontes ? '<link rel="stylesheet" href="/__fontes/fontes.css">' : ''}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${LARGURA_LOJA}px; height: ${ALTURA_LOJA}px;
    display: flex; align-items: center; justify-content: center; gap: 64px;
    padding: 0 72px;
    background: radial-gradient(circle at 22% 12%, #2f8fcd 0%, #1769a3 42%, #0e4a76 100%);
    font-family: 'Figtree', 'Trebuchet MS', system-ui, sans-serif;
    color: #fff; overflow: hidden;
  }
  /* Grade discreta ao fundo, para a arte não ficar num degradê chapado */
  body::before {
    content: ''; position: absolute; inset: 0; opacity: 0.12;
    background-image:
      linear-gradient(rgba(255,255,255,0.55) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.55) 1px, transparent 1px);
    background-size: 52px 52px;
    mask-image: radial-gradient(circle at 30% 35%, #000 5%, transparent 68%);
  }
  .texto { position: relative; flex: 1; max-width: 520px; }
  .marca {
    display: inline-flex; align-items: center; gap: 9px; margin-bottom: 26px;
    padding: 7px 14px 7px 8px; border-radius: 999px;
    background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22);
  }
  .marca .selo {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 7px;
    background: #fff; color: #1769a3; font-size: 11px; font-weight: 700;
  }
  .marca .nome { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
  h1 {
    font-family: 'Bricolage Grotesque', 'Trebuchet MS', system-ui, sans-serif;
    font-size: 46px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.08;
    text-wrap: balance;
  }
  p {
    margin-top: 20px; font-size: 20px; line-height: 1.45;
    color: rgba(255,255,255,0.85);
  }
  .moldura {
    position: relative; flex-shrink: 0;
    border-radius: 15px;
    background: #e9edf1;
    box-shadow: 0 34px 74px rgba(5, 34, 56, 0.46), 0 2px 0 rgba(255,255,255,0.28) inset;
    overflow: hidden;
  }
  .barra {
    height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 14px;
    background: #dde3e9; border-bottom: 1px solid #c9d1d9;
  }
  .bolinha { width: 11px; height: 11px; border-radius: 50%; background: #b8c2cc; }
  .barra .rotulo { margin-left: 10px; font-size: 12px; color: #5b6672; }
  img { display: block; width: ${LARGURA_POPUP}px; height: ${ALTURA_POPUP}px; }
</style></head><body>
  <div class="texto">
    <div class="marca"><span class="selo">SEI!</span><span class="nome">Radar</span></div>
    <h1>${titulo}</h1>
    <p>${legenda}</p>
  </div>
  <div class="moldura">
    <div class="barra">
      <span class="bolinha"></span><span class="bolinha"></span><span class="bolinha"></span>
      <span class="rotulo">SEI! Radar</span>
    </div>
    <img src="data:image/png;base64,${pngBase64}" alt="">
  </div>
</body></html>`;

/* -------------------------------------------------------------------------- */
/* Roteiro das telas                                                           */
/* -------------------------------------------------------------------------- */

const CENAS = [
  {
    arquivo: '1-lista-de-processos.png',
    titulo: 'Seus processos do SEI, sem abrir o SEI',
    legenda: 'Número, assunto, atribuição, etiquetas e prazo — sem abrir o SEI processo a processo.',
    estado: () => montarEstado(),
  },
  {
    arquivo: '2-escolha-o-que-acompanhar.png',
    titulo: 'Você escolhe o que quer acompanhar',
    legenda: 'Só o que está atribuído a você, tudo da unidade, ou apenas certas etiquetas.',
    estado: () => montarEstado({ onboarding: true }),
    preparar: async (pagina) => {
      await pagina.getByRole('button', { name: 'Começar' }).click();
      await pagina.waitForSelector('.scope-selection-list');
    },
  },
  {
    arquivo: '3-primeira-carga.png',
    titulo: 'A primeira carga acontece na sua frente',
    legenda: 'Nada de tela parada: o radar mostra o progresso enquanto carrega seus processos.',
    estado: () => montarEstado({ onboarding: true }),
    preparar: async (pagina) => {
      await pagina.getByRole('button', { name: 'Começar' }).click();
      await pagina.getByRole('button', { name: /Ativar radar/ }).click();
      await pagina.waitForSelector('.sincronizando');
      // Tempo suficiente para a varredura sair da posição inicial e a mensagem avançar
      await pagina.waitForTimeout(1000);
    },
  },
  {
    arquivo: '4-de-onde-veio-o-processo.png',
    titulo: 'De onde veio o processo, ali mesmo',
    legenda: 'O andamento do SEI aparece dentro do card, com unidade, responsável e data.',
    estado: () => montarEstado(),
    preparar: async (pagina) => {
      await pagina.getByRole('button', { name: /Andamento/ }).first().click();
      await pagina.waitForTimeout(500);
    },
  },
  {
    arquivo: '5-no-seu-ritmo.png',
    titulo: 'As notificações são do seu jeito',
    legenda: 'Escolha o que gera aviso, ligue ou desligue o som e o alerta de sessão do SEI.',
    estado: () => montarEstado(),
    preparar: async (pagina) => {
      await pagina.getByRole('button', { name: 'Abrir configurações' }).click();
      await pagina.waitForSelector('.settings-view');
      await pagina
        .getByText('Avisar quando a sessão do SEI cair')
        .scrollIntoViewIfNeeded();
      await pagina.waitForTimeout(300);
    },
  },
];

/* -------------------------------------------------------------------------- */

const principal = async () => {
  if (!fs.existsSync(path.join(DIST, 'popup.html'))) {
    console.error('dist/ não encontrado ou incompleto. Rode `npm run build` antes.');
    process.exit(1);
  }

  const temFontes = await prepararFontes();
  const { base, fechar } = await servirArquivos({ '/': DIST });
  fs.mkdirSync(SAIDA, { recursive: true });

  // CHROMIUM_PATH permite apontar para um Chromium já instalado na máquina; sem ele, o
  // Playwright usa o navegador que ele mesmo baixou (`npx playwright install chromium`).
  const navegador = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );

  try {
    for (const cena of CENAS) {
      const contexto = await navegador.newContext({
        viewport: { width: LARGURA_POPUP, height: ALTURA_POPUP },
        deviceScaleFactor: 2,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        reducedMotion: 'no-preference',
      });

      const estado = cena.estado();
      await contexto.addInitScript((dadosSemeados) => {
        for (const [chave, valor] of Object.entries(dadosSemeados)) {
          localStorage.setItem(chave, JSON.stringify(valor));
        }
      }, estado);

      const pagina = await contexto.newPage();
      if (temFontes) {
        await pagina.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/__fontes/fontes.css';
            document.head.prepend(link);
          });
        });
      }

      await pagina.goto(`${base}/popup.html`, { waitUntil: 'networkidle' });
      await pagina.waitForSelector('.popup-container');
      if (temFontes) await pagina.evaluate(() => document.fonts.ready);
      if (cena.preparar) await cena.preparar(pagina);

      const captura = await pagina.screenshot();
      await contexto.close();

      const composicao = await navegador.newContext({
        viewport: { width: LARGURA_LOJA, height: ALTURA_LOJA },
        deviceScaleFactor: 1,
      });
      const paginaFinal = await composicao.newPage();
      await paginaFinal.goto(`${base}/popup.html`); // origem certa para carregar /__fontes
      await paginaFinal.setContent(
        paginaDeComposicao(captura.toString('base64'), cena.titulo, cena.legenda, temFontes),
        { waitUntil: 'load' }
      );
      if (temFontes) await paginaFinal.evaluate(() => document.fonts.ready);

      const destino = path.join(SAIDA, cena.arquivo);
      await paginaFinal.screenshot({ path: destino });
      await composicao.close();

      console.log(`  ✓ ${cena.arquivo}`);
    }
  } finally {
    await navegador.close();
    fechar();
  }

  console.log(`\n${CENAS.length} imagens ${LARGURA_LOJA}x${ALTURA_LOJA} em store-assets/screenshots/`);
};

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
