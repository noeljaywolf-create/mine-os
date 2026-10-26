import { expect, test, type Page } from '@playwright/test';

const cases = [
  { id: 'rising', answer: 'inflow', requests: ['flow', 'inflow', 'suction'], citations: ['flow', 'inflow'], calculation: 'balance', row: 'inflow', column: 3, action: 'verify-inflow' },
  { id: 'backup', answer: 'power', requests: ['load-margin', 'electrical-path', 'suction'], citations: ['load-margin', 'electrical-path'], calculation: 'capacity-margin', row: 'load-margin', column: 3, action: 'review-loads' },
  { id: 'sensors', answer: 'instrumentation', requests: ['level', 'independent-level', 'suction'], citations: ['level', 'independent-level'], calculation: 'level-residual', row: 'level', column: 3, action: 'verify-instrument' },
  { id: 'larger', answer: 'resistance', requests: ['pipe-diameter', 'flow', 'head', 'suction'], citations: ['pipe-diameter', 'flow'], calculation: 'head-residual', row: 'head', column: 3, action: 'inspect-discharge' },
  { id: 'delayed', answer: 'delayed', requests: ['timeline', 'access', 'suction'], citations: ['timeline', 'access'], calculation: 'delay', row: 'timeline', column: 1, action: 'restore-and-monitor' },
];
async function reasoning(page: Page, item: typeof cases[number]) {
  await page.getByRole('combobox', { name: 'Evidence-based conclusion', exact: true }).selectOption(item.answer);
  for (const id of item.citations) await page.getByLabel(`Primary claim cite ${id}`, { exact: true }).check();
  await page.getByRole('combobox', { name: 'Tested competing hypothesis', exact: true }).selectOption('suction');
  await page.getByLabel('Alternative test cite suction', { exact: true }).check();
  await page.getByRole('combobox', { name: 'Quantitative mechanism', exact: true }).selectOption(item.calculation);
  const value = parseFloat(await page.getByTestId(`observation-${item.row}`).locator('td').nth(item.column).innerText());
  expect(Number.isFinite(value)).toBe(true);
  await page.getByLabel('Calculated result', { exact: false }).fill(String(value));
  await page.getByRole('combobox', { name: 'Intervention / verification proposal', exact: true }).selectOption(item.action);
}

for (const item of cases) test(`challenge ${item.id}: evidence and reasoning resolve the actual scenario`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app/engineering?view=challenge');
  await page.getByRole('combobox', { name: 'Challenge', exact: true }).selectOption(item.id);
  await page.getByRole('combobox', { name: 'Difficulty / evidence requirements', exact: true }).selectOption('beginner');
  await page.getByRole('button', { name: 'Start deterministic challenge', exact: true }).click();
  for (const id of item.requests) await page.getByRole('button', { name: `Request ${id}`, exact: true }).click();
  await reasoning(page, item);
  await page.getByRole('button', { name: 'Review investigative process', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '100/100' })).toBeVisible();
  await page.locator('[data-engineering-proof="analysis:challenge"]').click();
  await expect(page.getByRole('dialog')).toContainText('Causal claims with supporting citations');
});

test('advanced challenge requires a concurrent diagnosis and prevents difficulty switching within an attempt', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app/engineering?view=challenge');
  await page.getByRole('combobox', { name: 'Difficulty / evidence requirements', exact: true }).selectOption('advanced');
  await page.getByRole('button', { name: 'Start deterministic challenge', exact: true }).click();
  for (const id of ['flow', 'inflow', 'head', 'power', 'condition', 'suction']) await page.getByRole('button', { name: `Request ${id}`, exact: true }).click();
  await reasoning(page, cases[0]);
  await page.getByRole('button', { name: 'Review investigative process', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Further investigation needed' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Concurrent impairment', exact: true }).selectOption('wear');
  for (const id of ['condition', 'flow']) await page.getByLabel(`Secondary claim cite ${id}`, { exact: true }).check();
  await page.getByRole('button', { name: 'Review investigative process', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '100/100' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Difficulty / evidence requirements', exact: true }).selectOption('beginner');
  await expect(page.getByTestId('challenge-reasoning')).not.toBeAttached();
});

test('inspection records keep missing values null and require explicit refresh after time advances', async ({ page }) => {
  await page.goto('/app/engineering?view=investigation');
  await page.getByRole('button', { name: 'Create investigation branch', exact: true }).click();
  await page.getByRole('combobox', { name: 'Synthetic observation fault', exact: true }).selectOption('missing');
  for (const id of ['level', 'flow', 'current']) await page.getByRole('button', { name: `Request ${id}`, exact: true }).click();
  await expect(page.getByTestId('observation-level')).toContainText('Missing — no substitution');
  await expect(page.getByTestId('observation-current')).toContainText('Unsupported');
  await page.getByTitle('Advance one simulation step', { exact: true }).click();
  await expect(page.getByTestId('observation-flow')).toContainText('stale for this snapshot');
  await page.getByRole('button', { name: 'Refresh requested evidence at displayed time', exact: true }).click();
  await expect(page.getByTestId('observation-flow')).toContainText('synthetic-inspection');
  await expect(page.getByTestId('observation-current')).toContainText('Indeterminate');
  await page.locator('[data-engineering-proof="analysis:diagnostics"]').click();
  await expect(page.getByRole('dialog')).toContainText('Counterfactuals retain other faults');
});

test('comparison exposes achieved recovery criteria and the actual study proof', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app/engineering?view=comparison');
  await expect(page.getByRole('columnheader', { name: 'Achieved recovery', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('sustained for 15 minutes');
  await page.locator('[data-engineering-proof="analysis:recovery"]').first().click();
  await expect(page.getByRole('dialog')).toContainText('Configured repair delay is not the recovery objective');
  await expect(page.getByRole('dialog')).toContainText('Time resolution');
});

test('proof inventory has no unmapped output and forecast evidence is bound to forecast results', async ({ page }) => {
  await page.goto('/app/engineering?view=validation');
  await expect(page.getByTestId('proof-coverage-audit')).toContainText('0 uncovered runtime fields');
  await page.locator('[data-engineering-proof="plant-01"]').click();
  await expect(page.getByRole('dialog')).toContainText('Processed tonnes');
  await page.keyboard.press('Escape');
  await page.goto('/app/forecast');
  await page.locator('[data-engineering-proof="analysis:forecast"]').click();
  await expect(page.getByRole('dialog')).toContainText('not confidence intervals');
});
