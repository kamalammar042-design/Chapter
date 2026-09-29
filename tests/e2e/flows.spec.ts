import { test, expect } from '@playwright/test';
import { mockBackend, POOL } from './mock-backend';

test('tutor streams a reply and opens the new conversation', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/tutor');
  await page.getByRole('textbox', { name: 'Message the tutor' }).fill('Why do resistances add in series?');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Why do resistances add in series?').first()).toBeVisible();
  await expect(page.getByText('What do you think happens in parallel?')).toBeVisible();
  await expect(page).toHaveURL(/\/tutor\/conv-new/);
});

test('tutor replies can be saved as a note', async ({ page }) => {
  const { inserted } = await mockBackend(page);
  await page.goto('/tutor/conv1');
  await page.getByRole('button', { name: 'Save as note' }).last().click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  const note = inserted.find((i) => i.table === 'notes')?.body as { body: string; subject_key: string };
  expect(note.body).toContain('same current');
  expect(note.subject_key).toBe('igcse.physics');
});

test('practice answers go through submit_attempt with the stored option index', async ({ page }) => {
  const { inserted, submitted } = await mockBackend(page);
  await page.goto('/practice?subject=igcse.physics&topic=electricity&mode=practice&count=3');
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('h1')).toBeVisible();
    await page.locator('.option').first().click();
    await expect(page.locator('#feedback')).toBeVisible();
    await page.getByRole('button', { name: /Next question|See results/ }).click();
  }
  await expect(page.getByText(/Excellent work|Good session|Solid effort|Keep at it/)).toBeVisible();
  await expect(page.getByText('Skills practised')).toBeVisible();
  expect(inserted[0].table).toBe('practice_sessions');
  // answers are never inserted directly
  expect(inserted.filter((i) => i.table === 'question_attempts')).toHaveLength(0);
  expect(submitted).toHaveLength(3);
  for (const a of submitted) {
    expect(POOL.some((q) => q.id === a.p_question_id)).toBe(true);
    expect(typeof a.p_selected).toBe('number');
    expect(a).toMatchObject({ p_mode: 'practice', p_hints: 0 });
    expect(a).not.toHaveProperty('correct');
    expect(a).not.toHaveProperty('user_id');
  }
  expect(new Set(submitted.map((a) => a.p_client_id)).size).toBe(3);
});

test('guided practice finds the level, explains after mistakes and ends with a next step', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/practice?mode=guided&skill=igcse.physics/electricity/resistance');
  await expect(page.getByText('Finding your level')).toBeVisible();
  // answer every question wrong: after the probes the concept card appears,
  // and three wrong in a row ends the session with advice
  for (let i = 0; i < 6; i++) {
    const card = page.getByRole('dialog', { name: /The idea/ });
    if (await card.isVisible()) await card.getByRole('button', { name: 'Try another question' }).click();
    if (await page.getByText('Let’s look at the idea again').isVisible()) break;
    const correctText = await page.locator('h1').innerText();
    const q = POOL.find((x) => x.stem === correctText)!;
    const wrong = q.options.find((_, k) => k !== q.correct_index)!.text;
    await page.getByRole('button', { name: new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.getByRole('button', { name: 'Next question' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Let’s look at the idea again' })).toBeVisible();
});

test('hints are counted and halve XP', async ({ page }) => {
  const { submitted } = await mockBackend(page);
  await page.goto('/practice?subject=igcse.physics&topic=electricity&mode=practice&count=3');
  const stem = await page.locator('h1').innerText();
  const q = POOL.find((x) => x.stem === stem)!;
  const hint = page.getByRole('button', { name: 'Show a hint' });
  await hint.click();
  await expect(page.getByRole('note')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(q.options[q.correct_index].text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await expect(page.getByText('+10 XP')).toBeVisible();
  expect(submitted[0]).toMatchObject({ p_hints: 1 });
});

test('a student can report a problem with a question', async ({ page }) => {
  const { inserted } = await mockBackend(page);
  await page.goto('/practice?subject=igcse.physics&topic=electricity&mode=practice&count=3');
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: /Report a problem/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('A person will review this question.')).toBeVisible();
  const report = inserted.find((i) => i.table === 'question_reports')?.body as Record<string, unknown>;
  expect(report).toMatchObject({ reason: 'wrong_answer' });
  expect(report).not.toHaveProperty('user_id');
  expect(report).not.toHaveProperty('resolved_at');
});

test('past papers distinguish official sources, Chapter-owned files and unavailable links', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/papers');
  await expect(page.getByRole('button', { name: /Open official source: Cambridge IGCSE Physics/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Download: Electricity practice paper/ })).toBeVisible();
  await expect(page.getByText('Chapter-owned')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open official source: Cambridge IGCSE Chemistry/ })).toBeDisabled();
  await expect(page.getByText(/This link stopped working/)).toBeVisible();
  await page.getByLabel('Curriculum').selectOption('sat');
  await expect(page.getByText('Official SAT practice tests (full-length, digital)')).toBeVisible();
  await expect(page.getByText('Electricity practice paper')).toHaveCount(0);
});

test('the usage page shows fair-use allowances and nothing to buy', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/settings/plan'); // old link still works
  await expect(page).toHaveURL(/\/settings\/usage/);
  await expect(page.getByText('Chapter is free.', { exact: false })).toBeVisible();
  await expect(page.getByText('Tutor messages')).toBeVisible();
  await expect(page.getByText(/\bPro\b|upgrade|subscription|price/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Choose|Checkout|Upgrade|Buy/ })).toHaveCount(0);
});

test('settings theme switch applies immediately and persists', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/settings/appearance');
  await page.getByRole('radio', { name: /Light/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
