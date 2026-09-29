// Records the Devpost demo on the LIVE site with a throwaway account that
// uses Chapter for real (live questions, live AI tutor, a RevenueCat Test
// Store purchase), then deletes itself. Writes demo-video/marks.json with
// the time each scene starts, which scripts/make-demo-video.mjs turns into
// captions. Run:
//   $env:DEMO_URL = "https://chapter-sepia-omega.vercel.app"
//   npx playwright test --config playwright.demo.config.ts showcase
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('Chapter showcase video', async ({ page }) => {
  test.skip(!process.env.DEMO_URL, 'Set DEMO_URL');
  test.setTimeout(6 * 60_000);
  const t0 = Date.now();
  const marks: Array<{ scene: string; at: number }> = [];
  const mark = (scene: string) => marks.push({ scene, at: (Date.now() - t0) / 1000 });
  const pause = (ms: number) => page.waitForTimeout(ms);
  const smoothScroll = async (p: Page, dy: number) => {
    for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, dy / 10); await p.waitForTimeout(60); }
  };

  const email = `chapter.demo.${Date.now()}@mailinator.com`;
  const password = `Demo${Date.now()}x9`;

  // 1. landing
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  mark('landing');
  await pause(3500);
  await smoothScroll(page, 700);
  await pause(2500);

  // 2. sign up and onboarding
  await page.goto('/signup');
  mark('signup');
  await page.getByLabel('Your first name').pressSequentially('Alex', { delay: 60 });
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('checkbox').check();
  await pause(500);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  await page.getByRole('checkbox', { name: /IGCSE/ }).click();
  await pause(600);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Physics/ }).click();
  await page.getByRole('checkbox', { name: /Chemistry/ }).click();
  await pause(600);
  await page.getByRole('button', { name: /Continue with 2 subjects/ }).click();
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const dates = page.locator('input[type="date"]');
  if (await dates.count()) await dates.first().fill(inDays(60));
  await pause(800);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  mark('home');
  await pause(2500);

  // 3. practice: pick the tempting wrong answer (V × R instead of V ÷ R) when it is offered
  await page.goto('/practice?subject=igcse.physics&topic=electricity&mode=practice&count=3');
  await expect(page.locator('.option').first()).toBeVisible({ timeout: 30_000 });
  mark('question');
  let sawMistake = false;
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.option').first()).toBeVisible({ timeout: 30_000 });
    await pause(1800);
    const stem = await page.locator('.practice__question').innerText().catch(() => '');
    const nums = (stem.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    const options = page.locator('.option');
    const texts = await options.allInnerTexts();
    let pick = sawMistake ? 0 : texts.length - 1;
    if (!sawMistake && nums.length >= 2) {
      const product = nums[0] * nums[1];
      const hit = texts.findIndex((t) => (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).includes(product));
      if (hit >= 0) pick = hit;
    }
    await options.nth(pick).click();
    await expect(page.locator('#feedback')).toBeVisible({ timeout: 15_000 });
    const wrong = /not quite|the answer is/i.test(await page.locator('#feedback').innerText());
    if (wrong && !sawMistake) {
      sawMistake = true;
      mark('feedback');
      await page.locator('#feedback').scrollIntoViewIfNeeded();
      await pause(3500);
      const explain = page.getByRole('button', { name: /Explain my mistake/ });
      if (await explain.isVisible()) {
        await explain.click();
        mark('explain');
        await expect(page.locator('.inline-explain .md')).toBeVisible({ timeout: 60_000 });
        await pause(6000); // the live explanation streams in
        await smoothScroll(page, 500);
        await pause(2500);
      }
    } else {
      await pause(1500);
    }
    const next = page.getByRole('button', { name: /Next question|See results/ });
    if (await next.isVisible().catch(() => false)) await next.click();
  }
  await expect(page.getByText('Skills practised')).toBeVisible({ timeout: 20_000 });
  mark('summary');
  await pause(3000);
  await smoothScroll(page, 600);
  await pause(2500);

  // 4. tutor: a hint that does not give the answer away
  await page.goto('/tutor');
  mark('tutor');
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message the tutor' }).pressSequentially('A 6 V supply is connected across a 3 ohm resistor. What current flows?', { delay: 25 });
  await page.keyboard.press('Enter');
  await expect(page.locator('.md').last()).toContainText(/\w{4,}/, { timeout: 60_000 });
  await pause(8000);

  // 5. Chapter Plus through RevenueCat (Test Store: simulated, no money)
  await page.goto('/settings/usage');
  const buy = page.getByRole('button', { name: /Get Plus/ });
  await expect(buy).toBeVisible({ timeout: 30_000 });
  await buy.scrollIntoViewIfNeeded();
  mark('plus');
  await pause(3000);
  await buy.click();
  const valid = page.getByRole('button', { name: 'Test valid purchase' });
  await expect(valid).toBeVisible({ timeout: 30_000 });
  await pause(2500);
  await valid.click();
  await expect(page.getByText(/You are a Plus supporter/)).toBeVisible({ timeout: 45_000 });
  mark('plus_active');
  await page.getByText(/You are a Plus supporter/).scrollIntoViewIfNeeded();
  await pause(1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await pause(3000);

  // 6. exam plan and progress
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Exam plan' })).toBeVisible({ timeout: 20_000 });
  mark('plan');
  await pause(3500);
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible({ timeout: 20_000 });
  mark('progress');
  await pause(3500);
  mark('end');

  mkdirSync('demo-video', { recursive: true });
  writeFileSync('demo-video/marks.json', JSON.stringify(marks, null, 2));

  // clean up (after the "end" mark, so it is cut from the video)
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('DELETE');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).not.toHaveURL(/\/settings/, { timeout: 30_000 });
});
