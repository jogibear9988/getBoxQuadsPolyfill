import { test, chromium, firefox, expect } from '@playwright/test';
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

async function getH1Quads(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const h1 = document.querySelector('h1');
    // Get first text node in h1
    const textNode = h1.firstChild;
    const quads = textNode.getBoxQuads({ box: 'border', relativeTo: root });
    return {
      rootOffsetLeft: root.offsetLeft,
      rootOffsetTop: root.offsetTop,
      rootBCR: root.getBoundingClientRect(),
      quads: quads.map(q => ({
        p1: { x: Math.round(q.p1.x * 100) / 100, y: Math.round(q.p1.y * 100) / 100 },
        p2: { x: Math.round(q.p2.x * 100) / 100, y: Math.round(q.p2.y * 100) / 100 },
      })),
    };
  });
}

test('Firefox native quad values at 1600px', async () => {
  const browser = await firefox.launch({
    firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(baseURL + '/i7.html');
  await page.waitForLoadState('networkidle');
  const result = await getH1Quads(page);
  console.log('FIREFOX 1600px:', JSON.stringify(result, null, 2));
  await browser.close();
});

test('Chromium polyfill quad values at 1600px', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(baseURL + '/i7.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const result = await getH1Quads(page);
  console.log('POLYFILL 1600px:', JSON.stringify(result, null, 2));
  await browser.close();
});

test('Chromium polyfill quad values at 1440px', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(baseURL + '/i7.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const result = await getH1Quads(page);
  console.log('POLYFILL 1440px:', JSON.stringify(result, null, 2));
  await browser.close();
});
