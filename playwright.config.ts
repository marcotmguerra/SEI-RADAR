import { defineConfig, devices } from '@playwright/test';

const portaE2e = Number(process.env.PORTA_E2E ?? 4175);
const urlBaseE2e = `http://127.0.0.1:${portaE2e}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: urlBaseE2e, trace: 'on-first-retry' },
  webServer: {
    command: `npm run build --workspace @crm-sei/web && npm run preview --workspace @crm-sei/web -- --host 127.0.0.1 --port ${portaE2e} --strictPort`,
    url: urlBaseE2e,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
