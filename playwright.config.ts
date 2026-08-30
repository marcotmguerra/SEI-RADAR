import { defineConfig } from '@playwright/test';

/**
 * Os testes de ponta a ponta abrem o popup já compilado (`dist/`), então dependem de um
 * `npm run build` anterior — é o que `npm run test:e2e` garante.
 *
 * O popup do Chrome tem tamanho fixo de 520x600; o viewport reproduz esse limite para os
 * testes verem exatamente o que o usuário vê, inclusive o que fica fora da tela.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    viewport: { width: 520, height: 600 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // CHROMIUM_PATH permite usar um Chromium já instalado, sem baixar outro
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
});
