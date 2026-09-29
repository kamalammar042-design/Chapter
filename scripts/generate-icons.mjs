#!/usr/bin/env node
// Renders the PWA icons, favicon PNG, Apple touch icon and Open Graph image
// from SVG using Playwright's Chromium. Run: npm run icons
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const mark = (size, { padding = 0, radius = 0.25 } = {}) => {
  const inner = size - padding * 2;
  const s = inner / 32;
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${padding ? 0 : size * radius}" fill="#7C3AED"/>
    <g transform="translate(${padding} ${padding}) scale(${s})">
      <path d="M8 10.5c2.6-.9 5.2-.6 7.3.9v11.3c-2.1-1.4-4.7-1.7-7.3-.9V10.5Z" fill="#fff" opacity=".92"/>
      <path d="M16.7 11.4c2.1-1.5 4.7-1.8 7.3-.9v11.3c-2.6-.8-5.2-.5-7.3.9V11.4Z" fill="#fff" opacity=".55"/>
      <path d="M19 19.5l2-2.5 1.8 1.4" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
};

const og = `
<html><head><style>
  body { margin: 0; width: 1200px; height: 630px; font-family: 'Segoe UI', system-ui, sans-serif;
    background: radial-gradient(900px 420px at 15% -10%, rgba(124,58,237,.35), transparent 70%), #08080C; color: #F3F3F7;
    display: flex; flex-direction: column; justify-content: center; padding: 0 96px; box-sizing: border-box; }
  .brand { display: flex; align-items: center; gap: 20px; font-family: Georgia, serif; font-size: 44px; }
  h1 { font-size: 76px; line-height: 1.05; margin: 48px 0 16px; letter-spacing: -0.03em; font-weight: 700; }
  p { font-size: 32px; color: #B0B0C3; margin: 0; }
  .accent { color: #B69CFD; font-family: Georgia, serif; font-weight: 400; font-style: italic; }
</style></head><body>
  <div class="brand">${mark(72)}<span>Chapter</span></div>
  <h1>Your AI study companion.<br><span class="accent">Smarter studying. Better results.</span></h1>
  <p>IGCSE · SAT · AI tutoring · Personalised practice</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const render = async (html, w, h, file) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: join(pub, file), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('wrote', file);
};

await render(mark(32), 32, 32, 'favicon-32.png');
await render(mark(180, { radius: 0 }), 180, 180, 'apple-touch-icon.png');
await render(mark(192), 192, 192, 'icon-192.png');
await render(mark(512), 512, 512, 'icon-512.png');
await render(mark(512, { padding: 96 }), 512, 512, 'icon-maskable-512.png');
// Devpost / store icon: full square (stores round the corners themselves), no transparency
mkdirSync(join(pub, '..', 'submission'), { recursive: true });
await render(mark(1024, { radius: 0 }), 1024, 1024, '../submission/icon-1024.png');
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og);
await page.screenshot({ path: join(pub, 'og-image.png') });
console.log('wrote og-image.png');
await browser.close();
