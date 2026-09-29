// Live AI and Plus check: a throwaway account asks the tutor a real question,
// sees the reply rendered with maths, looks at Chapter Plus and the privacy
// policy, then deletes itself. Uses the configured AI provider's quota.
import { test, expect } from '@playwright/test';

test('the live tutor answers, Plus loads and the privacy policy names the provider', async ({ page }) => {
  test.skip(!process.env.LIVE_URL, 'Set LIVE_URL');
  const email = `chapter.ai.${Date.now()}@mailinator.com`;
  const password = `Ai${Date.now()}x9`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/signup');
  await page.getByLabel('Your first name').fill('Sam');
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

  // tutor: a real streamed reply, with maths rendered by KaTeX
  await page.goto('/tutor');
  await page.getByRole('textbox', { name: 'Message the tutor' }).fill('Explain Ohm\'s law with the formula and one worked example.');
  await page.keyboard.press('Enter');
  const reply = page.locator('.md').last();
  await expect(reply).toContainText(/resist/i, { timeout: 60_000 });
  await expect(page.locator('.md .katex').first()).toBeVisible({ timeout: 60_000 });
  await expect(reply).not.toContainText('\\(');
  await page.waitForTimeout(4000); // let the stream finish
  await page.screenshot({ path: 'test-results-live/tutor.png', fullPage: true });

  // Chapter Plus: RevenueCat loads (an offer, or an honest "not available")
  await page.goto('/settings/usage');
  await expect(page.getByRole('button', { name: /Get Plus/ }).or(page.getByText('Chapter Plus is not available to buy right now.'))).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results-live/plus.png', fullPage: true });

  await page.goto('/privacy');
  await expect(page.getByText(/sent to Groq, Inc\./)).toBeVisible();

  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('DELETE');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).not.toHaveURL(/\/settings/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
