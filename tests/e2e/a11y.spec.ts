// Automated accessibility audit (axe-core, WCAG 2.1 A/AA rules) on the main
// screens. Automated checks catch a subset of issues; see docs for the
// manual checklist.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend } from './mock-backend';

const SCREENS = [
  ['home', '/home', {}],
  ['practice', '/practice?subject=igcse.physics&topic=electricity&mode=practice&count=5', {}],
  ['subject', '/study/igcse.physics', {}],
  ['tutor', '/tutor/conv1', {}],
  ['papers', '/papers', {}],
  ['plan', '/plan', {}],
  ['progress', '/progress', {}],
  ['flashcards', '/flashcards', {}],
  ['settings-plan', '/settings/plan', {}],
  ['admin', '/admin', { admin: true }],
  ['parent', '/parent', { role: 'parent' as const }],
] as const;

for (const [name, path, opts] of SCREENS) {
  test(`accessibility: ${name}`, async ({ page }) => {
    await mockBackend(page, opts);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(200);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`)).toEqual([]);
  });
}

test('accessibility: practice feedback state', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/practice?subject=igcse.physics&topic=electricity&mode=practice&count=5');
  await page.locator('.option').first().click();
  await expect(page.locator('#feedback')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
