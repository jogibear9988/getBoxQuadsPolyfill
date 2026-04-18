import { test, chromium, firefox } from '@playwright/test';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join } from 'path';

const ROOT = '/Users/jkuehner/Documents/Repos/getBoxQuadsPolyfill';
let server, baseURL;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    let p = join(ROOT, req.url === '/' ? 'index.html' : req.url);
    try {
      const body = await readFile(p);
      const ext = p.split('.').pop();
      const types = { html: 'text/html', js: 'application/javascript', css: 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(r => server.listen(0, () => r()));
  baseURL = `http://localhost:${server.address().port}`;
});
test.afterAll(() => server?.close());

test('screenshot i7 at 1600px - Firefox native', async () => {
  const browser = await firefox.launch({
    firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(baseURL + '/i7.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(ROOT, 'tests', 'i7-ff-1600.png'), fullPage: true });
  await browser.close();
});

test('screenshot i7 at 1600px - Chromium polyfill', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(baseURL + '/i7.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(ROOT, 'tests', 'i7-pf-1600.png'), fullPage: true });
  await browser.close();
});

test('screenshot i7 at 1440px - Chromium polyfill', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(baseURL + '/i7.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(ROOT, 'tests', 'i7-pf-1440.png'), fullPage: true });
  await browser.close();
});
