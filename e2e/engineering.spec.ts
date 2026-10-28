import { expect, test } from '@playwright/test';

test('water formula explains its terms and presents geometry without raw JSON', async ({ page }) => {
  await page.goto('/app/dewatering');
  await page.locator('[data-engineering-proof="smp-101"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('In plain language');
  await expect(dialog).toContainText('dividing by 3,600');
  const coordinates = dialog.getByRole('row').filter({ hasText: 'Stage-storage coordinates' });
  await expect(coordinates).toContainText('(0, 0)');
  await expect(coordinates).not.toContainText('levelM');
});

test('hydraulic condition changes shared flow, exposes basis, and preserves state across routes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app/engineering');
  await page.getByRole('button', { name: 'Create editable branch' }).click();
  const original = await page.getByTestId('pump-operating-flow').innerText();
  await page.getByLabel('Main diameter (m)', { exact: true }).press('Home');
  await expect(page.getByTestId('pump-operating-flow')).not.toHaveText(original);
  const changed = await page.getByTestId('pump-operating-flow').innerText();
  await page.getByRole('button', { name: 'Show Engineering Basis', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Hsystem');
  await expect(page.getByRole('dialog')).toContainText('Validation status');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'DeepWater', exact: true }).click();
  await expect(page.getByTestId('pump-operating-flow')).toHaveText(changed);
  expect(errors).toEqual([]);
});

test('joint feeder failure causes delayed storage rise and an incident, with working replay', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app/engineering?view=resilience');
  await page.getByRole('button', { name: 'Initiate Simulated Feeder Failure', exact: true }).click();
  const before = await page.getByTestId('north-sump-volume').innerText();
  await page.getByRole('button', { name: 'Advance simulation 1 h', exact: true }).click();
  await expect(page.getByTestId('north-sump-volume')).not.toHaveText(before);
  await page.getByLabel('Consistent scenario replay frame').press('Home');
  await expect(page.getByText('Historical snapshot', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Return to live state' }).click();
  await page.getByRole('link', { name: /^Incidents/ }).click();
  await expect(page.locator('body')).toContainText('F-02');
  expect(errors).toEqual([]);
});

test('challenge rewards unique measurement process and evidence-supported conclusion', async ({ page }) => {
  await page.goto('/app/engineering?view=challenge');
  await page.getByRole('button', { name: 'Start deterministic challenge' }).click();
  for (const name of ['flow', 'inflow', 'head', 'power', 'suction']) await page.getByRole('button', { name: `Request ${name}`, exact: true }).click();
  await page.getByLabel('Evidence-based conclusion').selectOption('inflow');
  await page.getByRole('button', { name: 'Review investigative process' }).click();
  await expect(page.getByRole('status').filter({ hasText: '25/100' })).toBeVisible();
  for (const id of ['flow', 'inflow']) await page.getByLabel(`Primary claim cite ${id}`, { exact: true }).check();
  await page.getByRole('combobox', { name: 'Tested competing hypothesis', exact: true }).selectOption('suction');
  await page.getByLabel('Alternative test cite suction', { exact: true }).check();
  await page.getByRole('combobox', { name: 'Quantitative mechanism', exact: true }).selectOption('balance');
  const accumulation = parseFloat(await page.getByTestId('observation-inflow').locator('td').nth(3).innerText());
  await page.getByLabel('Calculated result', { exact: false }).fill(String(accumulation));
  await page.getByRole('combobox', { name: 'Intervention / verification proposal', exact: true }).selectOption('verify-inflow');
  await page.getByRole('button', { name: 'Review investigative process' }).click();
  await expect(page.getByRole('status').filter({ hasText: '100/100' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request flow', exact: true })).toBeDisabled();
});

test('primary ore route failure and alternate opening change actual constrained throughput', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app/production');
  await page.getByRole('button', { name: 'Create material-handling branch' }).click();
  await page.getByRole('button', { name: 'North primary ore route: available', exact: true }).click();
  await expect(page.getByTestId('route-flow-mat-north')).toHaveText('0.0 t/h');
  await page.getByRole('button', { name: 'Shared alternative crosscut: unavailable', exact: true }).click();
  await expect(page.getByTestId('route-flow-mat-crosscut')).toHaveText('0.0 t/h');
  await page.getByRole('button', { name: 'Advance material simulation 1 h', exact: true }).click();
  await expect(page.getByTestId('route-flow-mat-crosscut')).toHaveText('250.0 t/h');
  await page.getByRole('button', { name: 'Show Engineering Basis', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Edmonds');
});

test('all existing routes and new engineering demonstrations render without runtime exceptions', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const route of ['', 'digital-twin', 'dewatering', 'impact', 'incidents', 'energy', 'production', 'scenarios', 'forecast', 'assets', 'telemetry', 'decisions', 'analytics', 'governance']) {
    await page.goto('/app/' + route);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('body')).not.toHaveText('');
  }
  for (const view of ['investigation', 'comparison', 'investment', 'validation']) {
    await page.goto(`/app/engineering?view=${view}`);
    await expect(page.getByRole('heading', { name: /Engineering Challenge & Resilience Lab/i })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
