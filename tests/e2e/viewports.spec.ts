// Layout at every supported size: 375×667, 390×844, 430×932 (phones) and
// 1366×768, 1440×900, 1920×1080 (desktops). Runs in every project.
import { test, expect } from '@playwright/test';
import { mockBackend } from './mock-backend';
import { checkLayout, collectErrors } from './helpers';

const KEY_SCREENS = [
  ['home', '/home'],
  ['practice', '/practice?subject=igcse.physics&topic=electricity&mode=practice&count=5'],
  ['subject', '/study/igcse.physics'],
  ['papers', '/papers'],
  ['plan', '/plan'],
  ['progress', '/progress'],
] as const;

for (const [name, path] of KEY_SCREENS) {
  test(`layout: ${name}`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await mockBackend(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await checkLayout(page, name);
    await page.screenshot({ path: `test-results/viewports/${info.project.name}-${name}.png` });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('tutor: the message box stays on screen and the layout resizes for the keyboard', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/tutor/conv1');
  // the viewport meta asks mobile browsers to shrink the layout when the keyboard opens
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/);
  const input = page.getByRole('textbox', { name: 'Message the tutor' });
  await input.focus();
  const box = await input.boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh);
  // simulate the keyboard taking 40% of the screen: the input must still be visible
  await page.setViewportSize({ width: page.viewportSize()!.width, height: Math.round(vh * 0.6) });
  await page.waitForTimeout(200);
  const after = await input.boundingBox();
  expect(after!.y + after!.height).toBeLessThanOrEqual(Math.round(vh * 0.6));
  await expect(input).toBeInViewport();
});

test('desktop uses the width: sidebar and side column are visible on wide screens', async ({ page }) => {
  const width = page.viewportSize()!.width;
  test.skip(width < 1200, 'desktop only');
  await mockBackend(page);
  await page.goto('/home');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Overview' })).toBeVisible();
});
