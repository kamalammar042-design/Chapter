// Real end-to-end run against the live backend: sign up, onboard, practise,
// check progress and papers, then delete the account.
import { test, expect } from '@playwright/test';

test('a new student can sign up, practise and delete their account', async ({ page }) => {
  const email = `chapter.smoke.${Date.now()}@mailinator.com`;
  const password = `Smoke${Date.now()}x9`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // sign up (email confirmation is off, so a session starts immediately)
  await page.goto('/signup');
  await page.getByLabel('Your first name').fill('Smoke');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

  // onboarding
  await page.getByRole('checkbox', { name: /IGCSE/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Physics/ }).click();
  await page.getByRole('checkbox', { name: /Chemistry/ }).click();
  await page.getByRole('button', { name: /Continue with 2 subjects/ }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Smoke');

  // practise: questions come from the live pool and answers go through submit_attempt
  await page.goto('/practice?subject=igcse.physics&topic=electricity&mode=practice&count=3');
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.option').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('.option').nth(i % 2).click();
    await expect(page.locator('#feedback')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#feedback')).not.toContainText('Something went wrong');
    await page.getByRole('button', { name: /Next question|See results/ }).click();
  }
  await expect(page.getByText(/Excellent work|Good session|Solid effort|Keep at it/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Skills practised')).toBeVisible();
  await page.screenshot({ path: 'test-results-live/summary.png', fullPage: true });

  // guided practice loads a real pool for one skill
  await page.goto('/practice?mode=guided&skill=igcse.physics/electricity/resistance');
  await expect(page.getByText('Finding your level')).toBeVisible({ timeout: 30_000 });

  // progress and papers read live data
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await page.goto('/papers');
  await expect(page.getByRole('button', { name: /Open official source: Cambridge IGCSE Physics/ })).toBeVisible({ timeout: 20_000 });
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Exam plan' })).toBeVisible();

  // delete the account (live delete-account function)
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('DELETE');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).not.toHaveURL(/\/settings/, { timeout: 30_000 });

  // the account is really gone
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That email and password combination is not right.')).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});
