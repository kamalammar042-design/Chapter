// Shared checks for browser tests.
import { expect, type Page } from '@playwright/test';

export async function checkLayout(page: Page, name: string) {
  // Compare against clientWidth: on mobile, innerWidth grows with the
  // overflowing layout viewport and would hide the problem.
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll('main *, header *, nav *'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 1) return false;
        // content inside a horizontally scrolling container is fine
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p.getBoundingClientRect().right <= vw + 1) return false;
        }
        return true;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]} → ${Math.round(el.getBoundingClientRect().right)}px of ${vw}px`);
  });
  expect(offenders, `${name} overflows horizontally: ${offenders.join(', ')}`).toEqual([]);
  await expect(page.locator('h1').first()).toBeVisible();
}

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return errors;
}
