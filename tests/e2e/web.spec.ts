import { expect, test } from '@playwright/test';

test('acompanha processos e organiza o Kanban sem sair do CRM', async ({ page: pagina }) => {
  await pagina.goto('/');
  await expect(pagina.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(pagina.getByText('Sincronização concluída')).toBeVisible();

  const navegacaoRapida = pagina.getByRole('navigation', { name: 'Navegação rápida' });
  const navegacao = (await navegacaoRapida.isVisible())
    ? navegacaoRapida
    : pagina.locator('aside.sidebar');
  await navegacao.getByRole('link', { name: 'Kanban' }).click();
  await expect(pagina.getByRole('heading', { name: 'Kanban', level: 1 })).toBeVisible();
  const status = pagina.getByLabel(/Status do processo/).first();
  await status.selectOption('EM_ANALISE');
  await expect(status).toHaveValue('EM_ANALISE');
});

test('filtra processos em viewport mobile', async ({ page: pagina }) => {
  await pagina.goto('/processos');
  await pagina.getByPlaceholder('Número, assunto ou marcador').fill('viatura');
  await expect(pagina.getByText('Manutenção preventiva de viatura operacional')).toBeVisible();
  await expect(pagina.getByText('Aquisição de equipamentos de proteção individual')).toBeHidden();
});
