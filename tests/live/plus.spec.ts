// Live Chapter Plus purchase: a throwaway account buys Plus through the
// RevenueCat SDK (Test Store or Web Billing sandbox, no real money), the
// server verifies it with RevenueCat, the allowances triple, and the account
// is deleted. Needs a Test Store or sandbox key on the deployed site.
import { test, expect } from '@playwright/test';

test('a student can buy Chapter Plus and the server grants it', async ({ page }) => {
  test.skip(!process.env.LIVE_URL, 'Set LIVE_URL');
  const email = `chapter.plus.${Date.now()}@mailinator.com`;
  const password = `Plus${Date.now()}x9`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/signup');
  await page.getByLabel('Your first name').fill('Riley');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  await page.getByRole('checkbox', { name: /IGCSE/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Physics/ }).click();
  await page.getByRole('button', { name: /Continue with 1 subject/ }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });

  await page.goto('/settings/usage');
  await expect(page.getByText(/of 900/)).toBeVisible({ timeout: 20_000 });
  const buy = page.getByRole('button', { name: /Get Plus/ });
  await expect(buy).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results-live/plus-offer.png', fullPage: true });
  await buy.click();

  // RevenueCat's Test Store checkout
  const valid = page.getByRole('button', { name: 'Test valid purchase' });
  await expect(valid).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results-live/plus-checkout.png' });
  await valid.click();

  // verified on the server by revenuecat-sync, then shown
  await expect(page.getByText(/You are a Plus supporter/)).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByText(/of 2700/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/You are a Plus supporter/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results-live/plus-active.png', fullPage: true });

  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('DELETE');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).not.toHaveURL(/\/settings/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
