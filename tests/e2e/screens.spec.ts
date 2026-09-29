// Visual + layout QA: every major screen renders without errors, has no
// horizontal overflow, and gets a screenshot for review.
import { test, expect } from '@playwright/test';
import { mockBackend } from './mock-backend';
import { checkLayout, collectErrors } from './helpers';

const STUDENT_SCREENS = [
  ['home', '/home'],
  ['study', '/study'],
  ['subject', '/study/igcse.physics'],
  ['tutor', '/tutor'],
  ['tutor-conversation', '/tutor/conv1'],
  ['papers', '/papers'],
  ['notes', '/notes'],
  ['note-editor', '/notes/n1'],
  ['flashcards', '/flashcards'],
  ['deck', '/flashcards/d1'],
  ['review', '/review'],
  ['progress', '/progress'],
  ['reports', '/reports'],
  ['goals', '/goals'],
  ['leagues', '/leagues'],
  ['settings-account', '/settings/account'],
  ['settings-study', '/settings/study'],
  ['settings-tutor', '/settings/tutor'],
  ['settings-plan', '/settings/plan'],
  ['settings-parents', '/settings/parents'],
  ['more', '/more'],
  ['practice', '/practice?subject=igcse.physics&topic=electricity&mode=practice&count=5'],
  ['review-skills', '/practice?mode=review'],
  ['guided', '/practice?mode=guided&skill=igcse.physics/electricity/resistance'],
  ['plan', '/plan'],
] as const;

for (const [name, path] of STUDENT_SCREENS) {
  test(`student screen: ${name}`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await mockBackend(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    await checkLayout(page, name);
    await page.screenshot({ path: `test-results/screens/${info.project.name}-dark-${name}.png`, fullPage: true });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

for (const [name, path] of [['home', '/home'], ['practice', '/practice?subject=igcse.physics&mode=practice&count=5'], ['progress', '/progress'], ['tutor-conversation', '/tutor/conv1']] as const) {
  test(`light theme: ${name}`, async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem('chapter.theme', 'light'));
    await mockBackend(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await checkLayout(page, name);
    await page.screenshot({ path: `test-results/screens/${info.project.name}-light-${name}.png`, fullPage: true });
  });
}

test('new student with no data sees helpful empty states', async ({ page }, info) => {
  const errors = collectErrors(page);
  await mockBackend(page, { empty: true });
  for (const [name, path] of [['home', '/home'], ['progress', '/progress'], ['notes', '/notes'], ['flashcards', '/flashcards'], ['goals', '/goals']]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await checkLayout(page, name);
    await page.screenshot({ path: `test-results/screens/${info.project.name}-empty-${name}.png`, fullPage: true });
  }
  await page.goto('/progress');
  await expect(page.getByText('Your progress will build up here')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('public pages', async ({ page }, info) => {
  const errors = collectErrors(page);
  await mockBackend(page, { signedIn: false });
  for (const [name, path] of [['landing', '/'], ['signin', '/signin'], ['signup', '/signup'], ['forgot', '/forgot-password'], ['privacy', '/privacy'], ['notfound', '/nope']]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await checkLayout(page, name);
    await page.screenshot({ path: `test-results/screens/${info.project.name}-public-${name}.png`, fullPage: true });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('protected pages redirect to sign-in when signed out', async ({ page }) => {
  await mockBackend(page, { signedIn: false });
  await page.goto('/progress');
  await expect(page).toHaveURL(/\/signin\?next=%2Fprogress/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('onboarding for a new account', async ({ page }, info) => {
  const errors = collectErrors(page);
  const { inserted } = await mockBackend(page, { onboarded: false, empty: true });
  await page.goto('/home');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-onboarding-1.png`, fullPage: true });
  await page.getByRole('checkbox', { name: /IGCSE/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Physics/ }).click();
  await page.getByRole('checkbox', { name: /Chemistry/ }).click();
  await page.screenshot({ path: `test-results/screens/${info.project.name}-onboarding-2.png`, fullPage: true });
  await page.getByRole('button', { name: /Continue with 2 subjects/ }).click();
  await page.screenshot({ path: `test-results/screens/${info.project.name}-onboarding-3.png`, fullPage: true });
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/home/);
  expect(inserted.some((i) => i.table === 'student_subjects')).toBe(true);
  expect(inserted.some((i) => i.table === 'profiles' && (i.body as { onboarded_at?: string }).onboarded_at)).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('parent overview', async ({ page }, info) => {
  const errors = collectErrors(page);
  await mockBackend(page, { role: 'parent' });
  await page.goto('/home');
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible();
  await checkLayout(page, 'parent');
  await page.screenshot({ path: `test-results/screens/${info.project.name}-parent.png`, fullPage: true });
  // parents cannot reach student-only pages
  await page.goto('/tutor');
  await expect(page).toHaveURL(/\/parent/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('content admin: admins see the CMS', async ({ page }, info) => {
  const errors = collectErrors(page);
  await mockBackend(page, { admin: true });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Content admin' })).toBeVisible();
  await expect(page.getByText('Published questions', { exact: true })).toBeVisible();
  await checkLayout(page, 'admin');
  await page.screenshot({ path: `test-results/screens/${info.project.name}-admin.png`, fullPage: true });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('content admin is not reachable for students', async ({ page }) => {
  await mockBackend(page, { admin: false });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/home/);
});
