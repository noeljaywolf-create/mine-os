import { expect, test } from '@playwright/test';

test('schematic cards stay separated, labels fit, and selection links operating views', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/app/digital-twin');
  const svg = page.getByTestId('engineering-schematic');
  for (const view of ['Underground sectional twin', 'Electrical single-line twin', 'Hydraulic twin', 'Ore movement twin']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(svg).toBeVisible();
    const issues = await svg.evaluate(element => {
      const nodes = [...element.querySelectorAll<SVGRectElement>('[data-schematic-node]')].map(node => ({
        id: node.dataset.schematicNode!, x: node.x.baseVal.value, y: node.y.baseVal.value,
        w: node.width.baseVal.value, h: node.height.baseVal.value,
      }));
      const problems: string[] = [];
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]; const b = nodes[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) problems.push(`${a.id} overlaps ${b.id}`);
      }
      for (const label of element.querySelectorAll<HTMLElement>('foreignObject > div')) {
        if (label.scrollHeight > label.clientHeight + 1 || label.scrollWidth > label.clientWidth + 1) problems.push(`Clipped label: ${label.textContent}`);
      }
      return problems;
    });
    expect(issues, view).toEqual([]);
    const screenshot = testInfo.outputPath(`${view.replaceAll(' ', '-')}.png`);
    await page.getByTestId('schematic-viewport').screenshot({ path: screenshot });
    await testInfo.attach(view, { path: screenshot, contentType: 'image/png' });
  }
  await page.getByRole('button', { name: 'Hydraulic twin', exact: true }).click();
  const sump = svg.locator('[data-schematic-node="smp-201"]').locator('..');
  await sump.focus();
  await sump.press('Space');
  await expect(sump).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'run', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Electrical single-line twin', exact: true }).click();
  await expect(svg.locator('[data-schematic-node="pmp-201"]')).toHaveAttribute('stroke-width', '2');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in schematic' }).click();
  await expect(page.getByRole('group', { name: 'Schematic zoom controls' })).toContainText('125%');
  await page.getByRole('button', { name: 'Fit width', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fit width', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Schematic zoom controls' })).toContainText('100%');
  await expect(page.locator('.react-flow__edge-path').first()).toBeAttached();
});

test('fit centers the entire drawing and zooming out preserves its viewport center', async ({ page }) => {
  await page.goto('/app/digital-twin');
  await page.getByRole('button', { name: 'Ore movement twin', exact: true }).click();
  await expect(page.getByLabel('Schematic zoom level', { exact: true })).toHaveText('100%');
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  const viewport = page.getByTestId('schematic-viewport');
  const measure = () => viewport.evaluate(el => {
    const svg = el.querySelector('svg')!; const drawing = svg.getBoundingClientRect(); const bounds = el.getBoundingClientRect();
    const left = bounds.left + el.clientLeft; const top = bounds.top + el.clientTop;
    return { x: (left + el.clientWidth / 2 - drawing.left) / drawing.width,
      y: (top + el.clientHeight / 2 - drawing.top) / drawing.height,
      fits: drawing.left >= left && drawing.top >= top && drawing.right <= left + el.clientWidth + 1 && drawing.bottom <= top + el.clientHeight + 1 };
  });
  await expect.poll(async () => (await measure()).fits).toBe(true);
  expect((await measure()).x).toBeCloseTo(0.5, 2);
  expect((await measure()).y).toBeCloseTo(0.5, 2);
  const initial = parseInt(await page.getByLabel('Schematic zoom level', { exact: true }).innerText(), 10);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out schematic' }).click();
  expect(parseInt(await page.getByLabel('Schematic zoom level', { exact: true }).innerText(), 10)).toBeLessThan(initial);
  expect((await measure()).x).toBeCloseTo(0.5, 2);
  expect((await measure()).y).toBeCloseTo(0.5, 2);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await viewport.evaluate(el => { el.scrollLeft += 100; el.scrollTop += 40; });
  const before = await measure();
  await page.getByRole('button', { name: 'Zoom in schematic' }).click();
  expect((await measure()).x).toBeCloseTo(before.x, 2);
  expect((await measure()).y).toBeCloseTo(before.y, 2);
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  await expect.poll(async () => (await measure()).fits).toBe(true);
  await page.setViewportSize({ width: 768, height: 900 });
  await expect.poll(async () => (await measure()).fits).toBe(true);
  expect((await measure()).x).toBeCloseTo(0.5, 2);
});

test('schematics contain drawing overflow at mobile, tablet and desktop sizes', async ({ page }) => {
  test.setTimeout(180_000);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/digital-twin');
    await expect(page.getByTestId('engineering-schematic')).toBeVisible();
    await page.getByRole('button', { name: 'Ore movement twin', exact: true }).click();
    const bounds = await page.getByTestId('schematic-viewport').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Fit width', exact: true }).click();
    expect(await page.getByTestId('schematic-viewport').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
});

test('each schematic opens on an actual asset at readable zoom', async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/digital-twin');
    for (const view of ['Underground sectional twin', 'Electrical single-line twin', 'Hydraulic twin', 'Ore movement twin']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect.poll(() => page.getByTestId('schematic-viewport').evaluate(el => {
        const viewport = el.getBoundingClientRect();
        const node = el.querySelector<SVGRectElement>('[data-schematic-node]')?.getBoundingClientRect();
        return !!node && node.left >= viewport.left && node.right <= viewport.right && node.top >= viewport.top && node.bottom <= viewport.bottom;
      }), { message: `${view} should show its first asset at ${width}px` }).toBe(true);
    }
  }
});
