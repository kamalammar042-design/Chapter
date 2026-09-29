// Walks through Chapter on the live site so Playwright records a video.
// Real account, real data: every click is an ordinary user action.
import { test, expect, type Page } from '@playwright/test';

const pause = (page: Page, ms = 1800) => page.waitForTimeout(ms);

test('Chapter demo walkthrough', async ({ page }) => {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  test.skip(!process.env.DEMO_URL || !email || !password, 'Set DEMO_URL, DEMO_EMAIL and DEMO_PASSWORD');

  // 1. Landing
  await page.goto('/');
  await pause(page, 3000);
  await page.mouse.wheel(0, 900);
  await pause(page, 2500);

  // 2. Sign in
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 20_000 });
  await pause(page, 2500);

  // 3. Guided practice on one skill
  await page.goto('/study/igcse.physics');
  await pause(page);
  await page.getByRole('button', { name: /Show skills in Electricity/ }).click();
  await pause(page, 1200);
  await page.getByRole('link', { name: /Guided practice: Resistance/ }).click();
  await expect(page.locator('h1')).toBeVisible({ timeout: 20_000 });

  for (let i = 0; i < 8; i++) {
    const card = page.getByRole('dialog', { name: /The idea/ });
    if (await card.isVisible()) {
      await pause(page, 2500);
      await card.getByRole('button', { name: 'Try another question' }).click();
    }
    if (!(await page.locator('.option').first().isVisible().catch(() => false))) break;
    await pause(page, 1500);
    // alternate: first option, then the last one, so both right and wrong feedback appear
    const options = page.locator('.option');
    const n = await options.count();
    await options.nth(i % 2 === 0 ? 0 : n - 1).click();
    await expect(page.locator('#feedback')).toBeVisible();
    await pause(page, 3000);
    const next = page.getByRole('button', { name: /Next question|See results/ });
    if (!(await next.isVisible())) break;
    await next.click();
  }
  await pause(page, 3000);

  // 4. Tutor (skipped quietly if AI is not configured)
  try {
    await page.goto('/tutor');
    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message the tutor' }).fill('A 12 V battery is connected across a 4 ohm resistor. What current flows?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(12_000);
  } catch { /* tutor unavailable */ }

  // 5. Exam plan and progress
  await page.goto('/plan');
  await pause(page, 3500);
  await page.goto('/progress');
  await pause(page, 2500);
  await page.mouse.wheel(0, 700);
  await pause(page, 3000);
});
