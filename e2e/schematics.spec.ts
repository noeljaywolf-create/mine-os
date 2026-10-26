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
  await page.getByRole('button', { name: 'Zoom in schematic' }).click();
  await expect(page.getByRole('group', { name: 'Schematic zoom controls' })).toContainText('120%');
  await page.getByRole('button', { name: 'Fit width', exact: true }).click();
  await expect(svg).toHaveAttribute('width', '100%');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Schematic zoom controls' })).toContainText('100%');
  await expect(page.locator('.react-flow__edge-path').first()).toBeAttached();
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
