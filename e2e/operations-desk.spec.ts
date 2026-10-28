import { expect, test } from '@playwright/test';

test('operations desk previews simulation changes without modifying the protected baseline', async ({ page }) => {
  await page.goto('/app');
  const desk = page.getByRole('region', { name: 'Simulated pump controls' });
  await expect(page.getByText('Simulation only.', { exact: false }).first()).toBeVisible();
  await desk.getByRole('button', { name: 'Preview stop' }).first().click();
  const preview = page.getByRole('region', { name: 'Preview simulation change' });
  await expect(preview).toContainText('Estimated pump output');
  await expect(preview.getByRole('button', { name: 'Apply to simulation' })).toBeDisabled();
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Preview generator settings' }).click();
  await preview.getByLabel('Connected', { exact: true }).check();
  await preview.getByLabel('Switching approved in scenario').uncheck();
  await expect(preview).toContainText('Backup will not supply power');
  await expect(preview.getByRole('button', { name: 'Apply to simulation' })).toBeDisabled();
});

test('handover exports a clearly labelled simulation summary', async ({ page }) => {
  await page.goto('/app');
  await page.getByLabel('Notes for the next shift').fill('Check sump levels');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download simulation summary' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('mine-os-simulation-handover.txt');
});

test('an editable scenario can apply reviewed pump and generator changes', async ({ page }) => {
  await page.goto('/app/engineering');
  await page.getByRole('button', { name: 'Create editable branch' }).click();
  await page.getByRole('link', { name: 'Mission Control', exact: true }).click();
  const desk = page.getByRole('region', { name: 'Simulated pump controls' });
  await desk.getByRole('button', { name: 'Preview stop' }).first().click();
  let preview = page.getByRole('region', { name: 'Preview simulation change' });
  await preview.getByRole('button', { name: 'Apply to simulation' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'stopped' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview generator settings' }).click();
  preview = page.getByRole('region', { name: 'Preview simulation change' });
  await preview.getByLabel('Connected', { exact: true }).check();
  await preview.getByLabel('Switching approved in scenario').check();
  await preview.getByLabel('Capacity (kW)').fill('300');
  await preview.getByRole('button', { name: 'Apply to simulation' }).click();
  await expect(page.getByRole('region', { name: 'Simulated generator controls' })).toContainText('Connected · Available · 300 kW');
});
