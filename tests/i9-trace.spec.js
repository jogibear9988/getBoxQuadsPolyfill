import { test, chromium, firefox } from '@playwright/test';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, extname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

let server, baseURL;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const fp = resolve(ROOT, req.url.slice(1) || 'index.html');
    try { const data = readFileSync(fp); res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(data); }
    catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => server?.close());

test('trace first AAAA slot walk', async () => {
  const crBrowser = await chromium.launch();
  const crPage = await crBrowser.newPage({ viewport: { width: 900, height: 400 } });
  await crPage.goto(baseURL + '/i9.html');
  await crPage.waitForLoadState('networkidle');

  const result = await crPage.evaluate(() => {
    // First AAAA is the first lime div
    const aaaa = document.querySelector('wc-test div[style*="lime"]');
    const info = {
      tagName: aaaa.tagName,
      assignedSlot: aaaa.assignedSlot?.tagName,
      offsetLeft: aaaa.offsetLeft,
      offsetTop: aaaa.offsetTop,
      offsetParent: aaaa.offsetParent?.tagName + '.' + aaaa.offsetParent?.id,
      style: {
        left: getComputedStyle(aaaa).left,
        top: getComputedStyle(aaaa).top,
        margin: getComputedStyle(aaaa).margin,
        position: getComputedStyle(aaaa).position,
      },
      bcr: aaaa.getBoundingClientRect(),
      // Walk the slot path
      slotParent: aaaa.assignedSlot?.parentElement?.tagName,
      slotParentStyle: aaaa.assignedSlot?.parentElement ? {
        position: getComputedStyle(aaaa.assignedSlot.parentElement).position,
        rotate: getComputedStyle(aaaa.assignedSlot.parentElement).rotate,
        left: getComputedStyle(aaaa.assignedSlot.parentElement).left,
        top: getComputedStyle(aaaa.assignedSlot.parentElement).top,
        offsetLeft: aaaa.assignedSlot.parentElement.offsetLeft,
        offsetTop: aaaa.assignedSlot.parentElement.offsetTop,
      } : null,
    };
    return info;
  });
  console.log('First AAAA info:', JSON.stringify(result, null, 2));

  // Also trace the second AAAA
  const result2 = await crPage.evaluate(() => {
    const aaaa = document.querySelector('wc-test2 div[style*="lime"]');
    return {
      tagName: aaaa.tagName,
      assignedSlot: aaaa.assignedSlot?.tagName,
      offsetLeft: aaaa.offsetLeft,
      offsetTop: aaaa.offsetTop,
      offsetParent: aaaa.offsetParent?.tagName,
      style: {
        left: getComputedStyle(aaaa).left,
        top: getComputedStyle(aaaa).top,
        margin: getComputedStyle(aaaa).margin,
        position: getComputedStyle(aaaa).position,
      },
      bcr: aaaa.getBoundingClientRect(),
      slotParent: aaaa.assignedSlot?.parentElement?.tagName,
      slotParentStyle: aaaa.assignedSlot?.parentElement ? {
        position: getComputedStyle(aaaa.assignedSlot.parentElement).position,
        left: getComputedStyle(aaaa.assignedSlot.parentElement).left,
        top: getComputedStyle(aaaa.assignedSlot.parentElement).top,
        offsetLeft: aaaa.assignedSlot.parentElement.offsetLeft,
        offsetTop: aaaa.assignedSlot.parentElement.offsetTop,
      } : null,
    };
  });
  console.log('Second AAAA info:', JSON.stringify(result2, null, 2));

  await crBrowser.close();
});
