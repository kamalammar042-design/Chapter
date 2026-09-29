// Turns the showcase recording (tests/demo/showcase.spec.ts) into a 1080p
// demo video with a title card, a caption per scene and an end card.
// Needs ffmpeg on PATH. Output: demo-video/chapter-demo.mp4
//   node scripts/make-demo-video.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'demo-video';
const RAW = join(DIR, 'raw');
const clip = readdirSync(RAW, { recursive: true }).map(String).find((f) => f.includes('showcase') && f.endsWith('.webm'));
if (!clip) throw new Error('Record first: npx playwright test --config playwright.demo.config.ts showcase');
const video = join(RAW, clip);
const marks = JSON.parse(readFileSync(join(DIR, 'marks.json'), 'utf8'));
const at = (scene) => marks.find((m) => m.scene === scene)?.at;

const TITLE = 3.5;
const END = 4.5;
const start = at('landing') - 0.3;
const stop = at('end');
const W = 1920, H = 1080;
// the recording is the 412 × 860 viewport (older recordings pad it into a larger frame)
const VW = 412, VH = 860;
const PHONE_H = 1000, PHONE_W = Math.round((VW / VH) * PHONE_H / 2) * 2, PHONE_X = 250, PHONE_Y = 40;

const CAPTIONS = {
  landing: ['Chapter knows what you don’t understand yet.', 'Adaptive practice for IGCSE and Digital SAT students. Free for every student.'],
  signup: ['Set up in under a minute', 'Pick your exams, subjects and exam dates.'],
  home: ['One clear next step', 'Chapter recommends what to practise from your own answers.'],
  question: ['Every answer is judged on the server', 'Each one updates skill mastery, the review schedule and detected misconceptions.'],
  feedback: ['Mistakes get a name', 'Wrong options are mapped to the misconception behind them.'],
  explain: ['“Explain my mistake”', 'The AI tutor explains why the right answer is right and why the wrong one was tempting. Live AI: open models on Groq.'],
  summary: ['Session summary', 'Mastery per skill, weighted by difficulty. Weak skills come back for review after 1, 3 and 7 days.'],
  tutor: ['A tutor that teaches, not tells', 'Hints come in levels and never give the answer away.'],
  plus: ['Chapter Plus, powered by RevenueCat', 'An optional subscription that triples the AI allowances; everything else stays free. Shown in RevenueCat’s Test Store: no real money.'],
  plus_active: ['Verified on the server', 'A Supabase function confirms the purchase with RevenueCat’s API and webhooks track renewals. The app can’t grant itself Plus.'],
  plan: ['An exam plan that adapts', 'Rebuilt every day from exam dates and weak skills, so a missed day never piles up.'],
  progress: ['Honest progress', 'Everything is calculated from your own answers.'],
};

const scenes = Object.keys(CAPTIONS).filter((s) => at(s) != null);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const mark = `<svg width="56" height="56" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#7C3AED"/><path d="M8 10.5c2.6-.9 5.2-.6 7.3.9v11.3c-2.1-1.4-4.7-1.7-7.3-.9V10.5Z" fill="#fff" opacity=".92"/><path d="M16.7 11.4c2.1-1.5 4.7-1.8 7.3-.9v11.3c-2.6-.8-5.2-.5-7.3.9V11.4Z" fill="#fff" opacity=".55"/><path d="M19 19.5l2-2.5 1.8 1.4" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const base = `margin:0;width:${W}px;height:${H}px;font-family:'Segoe UI',system-ui,sans-serif;color:#F3F3F7;
  background:radial-gradient(1100px 600px at 80% -10%, rgba(124,58,237,.30), transparent 70%), radial-gradient(900px 500px at 0% 110%, rgba(124,58,237,.18), transparent 70%), #08080C;overflow:hidden;position:relative`;
const brand = `<div style="position:absolute;left:${PHONE_X + PHONE_W + 140}px;top:80px;display:flex;align-items:center;gap:16px;font-family:Georgia,serif;font-size:40px">${mark}<span>Chapter</span></div>`;

function sceneHtml(title, body, i, n) {
  const x = PHONE_X + PHONE_W + 140;
  return `<body style="${base}">
    <div style="position:absolute;left:${PHONE_X - 8}px;top:${PHONE_Y - 8}px;width:${PHONE_W + 16}px;height:${PHONE_H + 16}px;border-radius:28px;background:#1A1A24;box-shadow:0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08)"></div>
    ${brand}
    <div style="position:absolute;left:${x}px;right:120px;top:360px">
      <div style="font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:#B69CFD;margin-bottom:22px">${i} / ${n}</div>
      <div style="font-size:64px;font-weight:700;line-height:1.08;letter-spacing:-.02em">${esc(title)}</div>
      <div style="font-size:32px;line-height:1.45;color:#B0B0C3;margin-top:28px">${esc(body)}</div>
    </div></body>`;
}

const titleHtml = `<body style="${base};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div style="display:flex;align-items:center;gap:22px;font-family:Georgia,serif;font-size:72px">${mark.replace(/56/g, '96')}<span>Chapter</span></div>
  <div style="font-size:60px;font-weight:700;margin-top:56px;letter-spacing:-.02em">Knows what you don’t understand yet.</div>
  <div style="font-size:56px;margin-top:6px;color:#B69CFD;font-family:Georgia,serif;font-style:italic">And teaches it until it sticks.</div>
  <div style="font-size:28px;color:#B0B0C3;margin-top:48px">Adaptive study for IGCSE &amp; Digital SAT · RevenueCat Shipaton 2026 · Next Gen</div></body>`;

const endHtml = `<body style="${base};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div style="display:flex;align-items:center;gap:22px;font-family:Georgia,serif;font-size:64px">${mark.replace(/56/g, '84')}<span>Chapter</span></div>
  <div style="font-size:52px;font-weight:700;margin-top:48px">Try it free: chapter-sepia-omega.vercel.app</div>
  <div style="font-size:32px;color:#B0B0C3;margin-top:24px">Open source (MIT) · github.com/kamalammar042-design/Chapter</div>
  <div style="font-size:26px;color:#8A8AA0;margin-top:48px">React · TypeScript · Supabase · RevenueCat Web SDK · Groq (open models)</div></body>`;

const slides = join(DIR, 'slides');
mkdirSync(slides, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const shoot = async (html, name) => { await page.setContent(html); await page.screenshot({ path: join(slides, name) }); };
await shoot(titleHtml, 'title.png');
await shoot(endHtml, 'end.png');
for (let i = 0; i < scenes.length; i++) await shoot(sceneHtml(...CAPTIONS[scenes[i]], i + 1, scenes.length), `${scenes[i]}.png`);
await browser.close();

// background track: title, one caption slide per scene, end card
const lines = [];
const add = (file, dur) => { lines.push(`file '${file}'`, `duration ${dur.toFixed(3)}`); };
add('title.png', TITLE);
for (let i = 0; i < scenes.length; i++) {
  const from = Math.max(at(scenes[i]), start);
  const to = i + 1 < scenes.length ? at(scenes[i + 1]) : stop;
  add(`${scenes[i]}.png`, to - from + (i === 0 ? at(scenes[0]) - start : 0));
}
add('end.png', END);
lines.push("file 'end.png'");
writeFileSync(join(slides, 'list.txt'), lines.join('\n'));

const total = TITLE + (stop - start) + END;
const out = join(DIR, 'chapter-demo.mp4');
execFileSync('ffmpeg', [
  '-v', 'error', '-y',
  '-f', 'concat', '-safe', '0', '-i', join(slides, 'list.txt'),
  '-i', video,
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-filter_complex',
  `[0:v]fps=30,format=yuv420p,setsar=1[bg];` +
  `[1:v]trim=start=${start.toFixed(3)}:end=${stop.toFixed(3)},setpts=PTS-STARTPTS+${TITLE}/TB,crop=${VW}:${VH}:0:0,scale=${PHONE_W}:${PHONE_H}:flags=lanczos,fps=30[ph];` +
  `[bg][ph]overlay=x=${PHONE_X}:y=${PHONE_Y}:eof_action=pass,format=yuv420p[v]`,
  '-map', '[v]', '-map', '2:a',
  '-t', total.toFixed(3),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '128k',
  out,
], { stdio: 'inherit' });
console.log(`wrote ${out} (${total.toFixed(1)} s)`);
