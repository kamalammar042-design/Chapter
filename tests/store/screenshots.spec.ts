// Screenshots of real use of the live app. Every screen shows data this run
// created through ordinary user actions; the account is deleted at the end.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'submission/screenshots';

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700); // let entrance transitions settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('store screenshots', async ({ page }) => {
  test.skip(!process.env.LIVE_URL, 'Set LIVE_URL');
  mkdirSync(OUT, { recursive: true });
  const email = `chapter.shots.${Date.now()}@mailinator.com`;
  const password = `Shots${Date.now()}x9`;
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  await page.goto('/');
  await shot(page, '01-landing');

  await page.goto('/signup');
  await page.getByLabel('Your first name').fill('Alex');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

  await page.getByRole('checkbox', { name: /IGCSE/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Physics/ }).click();
  await page.getByRole('checkbox', { name: /Chemistry/ }).click();
  await page.getByRole('checkbox', { name: /Mathematics/ }).first().click();
  await page.getByRole('button', { name: /Continue with 3 subjects/ }).click();
  const dates = page.locator('input[type="date"]');
  const offsets = [58, 65, 72];
  for (let i = 0; i < Math.min(await dates.count(), offsets.length); i++) await dates.nth(i).fill(inDays(offsets[i]));
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });

  // A real practice session: alternate options so both feedback states appear.
  await page.goto('/practice?subject=igcse.physics&topic=electricity&mode=practice&count=8');
  let wrongShot = false;
  for (let i = 0; i < 8; i++) {
    await expect(page.locator('.option').first()).toBeVisible({ timeout: 30_000 });
    if (i === 0) await shot(page, '03-question');
    const options = page.locator('.option');
    await options.nth(i % 2 === 0 ? 0 : (await options.count()) - 1).click();
    await expect(page.locator('#feedback')).toBeVisible({ timeout: 15_000 });
    if (!wrongShot && /not quite|incorrect|the answer is/i.test(await page.locator('#feedback').innerText())) {
      await page.locator('#feedback').scrollIntoViewIfNeeded();
      await shot(page, '04-feedback');
      wrongShot = true;
    }
    await page.getByRole('button', { name: /Next question|See results/ }).click();
  }
  await expect(page.getByText('Skills practised')).toBeVisible({ timeout: 15_000 });
  await shot(page, '05-session-summary');

  await page.goto('/practice?subject=igcse.chemistry&mode=practice&count=5');
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('.option').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('.option').nth(i % 3 === 0 ? 1 : 0).click();
    await expect(page.locator('#feedback')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Next question|See results/ }).click();
  }
  await expect(page.getByText('Skills practised')).toBeVisible({ timeout: 15_000 });

  await page.goto('/practice?mode=guided&skill=igcse.physics/electricity/resistance');
  await expect(page.locator('.option').first().or(page.getByRole('dialog'))).toBeVisible({ timeout: 30_000 });
  await shot(page, '06-guided-practice');

  await page.goto('/home');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Alex', { timeout: 20_000 });
  await shot(page, '02-home');

  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible({ timeout: 20_000 });
  await shot(page, '07-progress');

  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Exam plan' })).toBeVisible({ timeout: 20_000 });
  await shot(page, '08-exam-plan');

  await page.goto('/papers');
  await expect(page.getByRole('button', { name: /Open official source/ }).first()).toBeVisible({ timeout: 20_000 });
  await shot(page, '09-past-papers');

  await page.goto('/settings/usage');
  await shot(page, '10-usage-and-plus');

  // clean up: delete the account through the app
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('DELETE');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).not.toHaveURL(/\/settings/, { timeout: 30_000 });
});
