import { test, expect, type Page } from '@playwright/test';
import { servirDist } from './servidor';

let base = '';
let fechar = () => {};

test.beforeAll(async () => {
  ({ base, fechar } = await servirDist());
});

test.afterAll(() => fechar());

const CONFIG_NOVA = {
  urlControle: 'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar',
  intervaloMinutos: 5,
  escopoRadar: 'atribuidos',
  radarOnboardingConcluido: false,
  primeiraCargaRealizada: false,
};

const PROCESSOS_DEMO = [
  {
    numero: '1400.01.0000871/2026-42',
    assunto: 'Aquisição de material de expediente',
    link: '#',
    detectadoEm: new Date().toISOString(),
    lido: false,
    atribuidoPara: '00000000191',
    marcadores: [{ nome: 'Urgente' }],
  },
  {
    numero: '1400.01.0000864/2026-07',
    assunto: 'Manutenção preventiva de veículo oficial',
    link: '#',
    detectadoEm: new Date().toISOString(),
    lido: false,
    atribuidoPara: '00000000191',
    marcadores: [],
  },
];

const abrirPopup = async (page: Page, estado: Record<string, unknown>) => {
  await page.addInitScript((dados) => {
    for (const [chave, valor] of Object.entries(dados as Record<string, unknown>)) {
      localStorage.setItem(chave, JSON.stringify(valor));
    }
  }, estado);
  await page.goto(`${base}/popup.html`);
  await page.waitForSelector('.popup-container');
};

test.describe('primeira abertura', () => {
  test('percorre boas-vindas, escopo, sincronização e conclusão', async ({ page }) => {
    await abrirPopup(page, {
      sei_monitor_configuracao: CONFIG_NOVA,
      sei_monitor_processos: PROCESSOS_DEMO,
      sei_monitor_status: 'conectado',
    });

    // 1. Boas-vindas: a promessa de leitura vem antes de qualquer configuração
    await expect(page.getByRole('heading', { name: 'SEI! Radar' })).toBeVisible();
    await expect(page.getByText('Só leitura, sempre.')).toBeVisible();
    await page.getByRole('button', { name: 'Começar' }).click();

    // 2. Escopo: começa na opção recomendada
    await expect(page.getByText('Configure seu Radar')).toBeVisible();
    await expect(page.locator('.scope-card.active')).toContainText('Processos atribuídos a mim');
    await page.getByRole('button', { name: /Ativar radar/ }).click();

    // 3. Sincronização: a tela aparece imediatamente, sem o vazio que existia antes
    await expect(page.locator('.sincronizando')).toBeVisible();
    await expect(page.locator('.radar-animado')).toBeVisible();
    await expect(page.locator('.sincronizando-mensagem')).not.toBeEmpty();

    // 4. Conclusão: o número mostrado é o total, nunca "novos" — a primeira carga é
    // um retrato silencioso e devolve novos: 0 por definição.
    await expect(page.locator('.pronto')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.pronto-contador')).toContainText('2');
    await page.getByRole('button', { name: /Ver meus processos/ }).click();

    await expect(page.locator('.process-list')).toBeVisible();
    await expect(page.locator('.process-list .empty-state')).toHaveCount(0);
  });

  test('oferece abrir o SEI quando a primeira carga não traz nada', async ({ page }) => {
    // Desfecho mais provável de uma instalação nova: nenhuma aba do SEI aberta e nenhuma
    // permissão de host concedida.
    await abrirPopup(page, {
      sei_monitor_configuracao: CONFIG_NOVA,
      sei_monitor_processos: [],
    });

    await page.getByRole('button', { name: 'Começar' }).click();
    await page.getByRole('button', { name: /Ativar radar/ }).click();

    await expect(page.locator('.pronto')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Abrir o SEI/ })).toBeVisible();
  });

  test('não reaparece para quem já configurou o Radar', async ({ page }) => {
    await abrirPopup(page, {
      sei_monitor_configuracao: { ...CONFIG_NOVA, radarOnboardingConcluido: true },
      sei_monitor_processos: PROCESSOS_DEMO,
      sei_monitor_status: 'conectado',
    });

    await expect(page.locator('.process-list')).toBeVisible();
    await expect(page.locator('.boas-vindas')).toHaveCount(0);
  });
});

test.describe('aviso de sessão finalizada', () => {
  test('o toggle existe e vem desligado', async ({ page }) => {
    await abrirPopup(page, {
      sei_monitor_configuracao: { ...CONFIG_NOVA, radarOnboardingConcluido: true },
      sei_monitor_status: 'conectado',
    });

    await page.getByRole('button', { name: 'Abrir configurações' }).click();

    const linha = page.locator('.setting-toggle-row', {
      hasText: 'Avisar quando a sessão do SEI cair',
    });
    await expect(linha).toBeVisible();
    await expect(linha.locator('input[type="checkbox"]')).not.toBeChecked();
  });

  test('o estado desconectado aparece no banner, não só numa notificação', async ({ page }) => {
    await abrirPopup(page, {
      sei_monitor_configuracao: { ...CONFIG_NOVA, radarOnboardingConcluido: true },
      sei_monitor_status: 'desconectado',
    });

    await expect(page.locator('.connection-banner.warning')).toContainText('Sessão finalizada');
    await expect(page.getByRole('button', { name: 'Fazer Login' })).toBeVisible();
  });
});
