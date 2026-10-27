import { expect, test, type Page } from '@playwright/test';

async function holdCalculations(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      override postMessage() { /* Keep the real worker idle: simulate an arbitrarily slow calculation. */ }
    };
  });
}

test('navigation stays interactive while a background calculation is deliberately held', async ({ page }, testInfo) => {
  let requested = false;
  page.on('worker', () => { requested = true; });
  await holdCalculations(page);
    await page.goto('/app/forecast');
    await expect(page.getByTestId('analysis-loading')).toBeVisible();
    await expect.poll(() => requested).toBe(true);
    await page.evaluate(() => {
      const link = document.querySelector('a[href="/app/digital-twin"]')!;
      link.addEventListener('click', () => performance.mark('navigation-start'), { once: true });
      const observer = new MutationObserver(() => {
        if ([...document.querySelectorAll('h2')].some(h => h.textContent === 'Engineering schematics')) {
          observer.disconnect();
          requestAnimationFrame(() => { performance.mark('navigation-ready'); performance.measure('navigation-response', 'navigation-start', 'navigation-ready'); });
        }
      });
      observer.observe(document.querySelector('main')!, { childList: true, subtree: true });
    });
    await page.getByRole('link', { name: 'Digital Twin', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Engineering schematics', exact: true })).toBeVisible({ timeout: 1500 });
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName('navigation-response').length)).toBe(1);
    const elapsed = await page.evaluate(() => performance.getEntriesByName('navigation-response')[0].duration);
    expect(elapsed).toBeLessThan(1500);
    await testInfo.attach('navigation-latency', { body: JSON.stringify({ elapsedMs: elapsed, backgroundWorkerDeliberatelyHeld: true }), contentType: 'application/json' });
  await expect(page.getByTestId('analysis-status')).not.toBeAttached();
});

test('investment studies do not block switching to another engineering view', async ({ page }) => {
  await holdCalculations(page);
    await page.goto('/app/engineering?view=investment');
    await expect(page.getByTestId('analysis-loading')).toBeVisible();
    await page.getByRole('button', { name: 'Hydraulic laboratory', exact: true }).click();
    await expect(page.getByTestId('pump-operating-flow')).toBeVisible({ timeout: 1500 });
});

test('time advance exposes progress and cancellation while navigation remains usable', async ({ page }) => {
  await page.goto('/app/engineering?view=challenge');
  await page.getByRole('combobox', { name: 'Challenge', exact: true }).selectOption('delayed');
  await page.getByRole('button', { name: 'Start deterministic challenge', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel time advance', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel time advance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel time advance', exact: true })).not.toBeAttached();
  await page.getByRole('link', { name: 'Digital Twin', exact: true }).click();
  await expect(page.getByTestId('engineering-schematic')).toBeVisible();
});

test('live analysis exposes snapshot age and pausing refreshes the exact current step', async ({ page }) => {
  await page.goto('/app/forecast');
  await expect(page.locator('[data-engineering-proof="analysis:forecast"]')).toBeVisible();
  await page.getByRole('button', { name: 'run', exact: true }).click();
  await expect(page.getByTestId('analysis-status')).toContainText('pause for an exact current-step calculation');
  await page.getByRole('button', { name: 'pause', exact: true }).click();
  await page.locator('[data-engineering-proof="analysis:forecast"]').click();
  const time = /T\+(\d+)m/.exec(await page.getByRole('banner').innerText());
  expect(time).not.toBeNull();
  const recorded = page.getByRole('dialog').getByRole('row').filter({ hasText: 'Forecast snapshot time' }).locator('td').nth(1);
  await expect(recorded).toHaveText(String(Number(time![1]) * 60));
});
