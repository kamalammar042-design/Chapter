// Runs key screens under the production Content-Security-Policy from
// netlify.toml to prove nothing the app needs is blocked.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockBackend } from './mock-backend';

const csp = /Content-Security-Policy = "([^"]+)"/.exec(readFileSync('netlify.toml', 'utf8'))![1];

test('app works under the production CSP', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text()); });
  await mockBackend(page);
  await page.route('http://localhost:4173/**', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers(), 'content-security-policy': csp };
    await route.fulfill({ response: res, headers });
  });
  for (const path of ['/home', '/tutor/conv1', '/progress', '/practice?subject=igcse.physics&mode=practice&count=5']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeAttached();
  }
  expect(violations).toEqual([]);
});
