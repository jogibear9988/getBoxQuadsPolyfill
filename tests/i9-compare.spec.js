import { test, chromium, firefox } from '@playwright/test';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, extname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let server, baseURL;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const fp = resolve(ROOT, req.url.slice(1) || 'index.html');
    try {
      const data = readFileSync(fp);
      res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => server?.close());

test('i9 Firefox native screenshot', async () => {
  const browser = await firefox.launch({
    firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
  await page.goto(baseURL + '/i9.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(ROOT, 'tests', 'i9-ff.png') });
  await browser.close();
});

test('i9 Chromium polyfill screenshot', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
  await page.goto(baseURL + '/i9.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(ROOT, 'tests', 'i9-pf.png') });
  await browser.close();
});

test('i9 quad comparison', async () => {
  // Firefox native
  const ffBrowser = await firefox.launch({
    firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
  });
  const ffPage = await ffBrowser.newPage({ viewport: { width: 900, height: 400 } });
  await ffPage.goto(baseURL + '/i9.html');
  await ffPage.waitForLoadState('networkidle');
  // Remove overlay to get clean quads
  await ffPage.evaluate(() => document.getElementById('overlay')?.remove());
  const ffQuads = await ffPage.evaluate(() => {
    const results = {};
    const all = document.body.querySelectorAll('div');
    for (const e of all) {
      const quads = e.getBoxQuads({ box: 'border', relativeTo: document.body });
      const id = e.textContent.trim().slice(0, 20) || e.className || 'div';
      const tag = e.tagName + (e.style.background ? `[bg=${e.style.background}]` : '') + (e.style.rotate ? `[rot=${e.style.rotate}]` : '');
      results[`${tag}:${id}`] = quads.map(q => ({
        p1: { x: Math.round(q.p1.x * 10) / 10, y: Math.round(q.p1.y * 10) / 10 },
        p2: { x: Math.round(q.p2.x * 10) / 10, y: Math.round(q.p2.y * 10) / 10 },
        p3: { x: Math.round(q.p3.x * 10) / 10, y: Math.round(q.p3.y * 10) / 10 },
        p4: { x: Math.round(q.p4.x * 10) / 10, y: Math.round(q.p4.y * 10) / 10 },
      }));
    }
    return results;
  });
  await ffBrowser.close();

  // Chromium polyfill
  const crBrowser = await chromium.launch();
  const crPage = await crBrowser.newPage({ viewport: { width: 900, height: 400 } });
  await crPage.goto(baseURL + '/i9.html');
  await crPage.waitForLoadState('networkidle');
  const pfQuads = await crPage.evaluate(() => {
    const results = {};
    const all = document.body.querySelectorAll('div');
    for (const e of all) {
      const quads = e.getBoxQuads({ box: 'border', relativeTo: document.body });
      const id = e.textContent.trim().slice(0, 20) || e.className || 'div';
      const tag = e.tagName + (e.style.background ? `[bg=${e.style.background}]` : '') + (e.style.rotate ? `[rot=${e.style.rotate}]` : '');
      results[`${tag}:${id}`] = quads.map(q => ({
        p1: { x: Math.round(q.p1.x * 10) / 10, y: Math.round(q.p1.y * 10) / 10 },
        p2: { x: Math.round(q.p2.x * 10) / 10, y: Math.round(q.p2.y * 10) / 10 },
        p3: { x: Math.round(q.p3.x * 10) / 10, y: Math.round(q.p3.y * 10) / 10 },
        p4: { x: Math.round(q.p4.x * 10) / 10, y: Math.round(q.p4.y * 10) / 10 },
      }));
    }
    return results;
  });
  await crBrowser.close();

  // Compare
  const allKeys = new Set([...Object.keys(ffQuads), ...Object.keys(pfQuads)]);
  for (const key of [...allKeys].sort()) {
    const ff = ffQuads[key];
    const pf = pfQuads[key];
    if (!ff || !pf) {
      console.log(`[${key}] MISSING in ${!ff ? 'Firefox' : 'Polyfill'}`);
      continue;
    }
    if (ff.length !== pf.length) {
      console.log(`[${key}] QUAD COUNT MISMATCH FF:${ff.length} PF:${pf.length}`);
    }
    const n = Math.min(ff.length, pf.length);
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      for (const pt of ['p1', 'p2', 'p3', 'p4']) {
        maxDelta = Math.max(maxDelta, Math.abs(ff[i][pt].x - pf[i][pt].x), Math.abs(ff[i][pt].y - pf[i][pt].y));
      }
    }
    if (maxDelta > 2) {
      console.log(`[${key}] MISMATCH delta=${maxDelta.toFixed(1)}`);
      for (let i = 0; i < n; i++) {
        console.log(`  quad[${i}] FF: p1(${ff[i].p1.x},${ff[i].p1.y}) p2(${ff[i].p2.x},${ff[i].p2.y}) p3(${ff[i].p3.x},${ff[i].p3.y}) p4(${ff[i].p4.x},${ff[i].p4.y})`);
        console.log(`  quad[${i}] PF: p1(${pf[i].p1.x},${pf[i].p1.y}) p2(${pf[i].p2.x},${pf[i].p2.y}) p3(${pf[i].p3.x},${pf[i].p3.y}) p4(${pf[i].p4.x},${pf[i].p4.y})`);
      }
    } else {
      console.log(`[${key}] OK delta=${maxDelta.toFixed(1)}`);
    }
  }
});
