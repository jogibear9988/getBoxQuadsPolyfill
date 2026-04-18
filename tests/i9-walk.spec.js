import { test, chromium } from '@playwright/test';
import { createServer } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, extname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

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

test('trace walk for both AAAA elements', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
  page.on('console', msg => {
    if (msg.text().startsWith('WALK:') || msg.text().startsWith('RESULT:')) {
      console.log(msg.text());
    }
  });
  await page.goto(baseURL + '/i9.html');
  await page.waitForLoadState('networkidle');

  // Inject tracing into the polyfill by calling getBoxQuads with logging
  await page.evaluate(() => {
    function traceQuad(elem, label) {
      console.log(`WALK: === ${label} ===`);
      let node = elem;
      let actualElement = elem;
      
      // Walk up the tree like the polyfill does
      while (actualElement && actualElement !== document.body) {
        const parent = actualElement.assignedSlot || actualElement.parentElement;
        const tag = actualElement.tagName || '#text';
        const pos = actualElement.nodeType === 1 ? getComputedStyle(actualElement).position : '';
        const isSlotted = actualElement.assignedSlot != null;
        
        if (actualElement.nodeType === 1) {
          const oL = actualElement.offsetLeft;
          const oT = actualElement.offsetTop;
          const oP = actualElement.offsetParent?.tagName || 'null';
          console.log(`WALK: ${tag} pos=${pos} slotted=${isSlotted} offsetL=${oL} offsetT=${oT} offsetParent=${oP}`);
          if (isSlotted) {
            const st = getComputedStyle(actualElement);
            console.log(`WALK:   CSS: left=${st.left} top=${st.top} margin=${st.margin}`);
          }
        } else {
          console.log(`WALK: ${tag} slotted=${isSlotted}`);
        }

        actualElement = parent;
      }
      
      // Get actual quad
      const quads = elem.getBoxQuads({ box: 'border', relativeTo: document.body });
      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        console.log(`RESULT: ${label} quad[${i}]: p1(${q.p1.x.toFixed(1)},${q.p1.y.toFixed(1)}) p2(${q.p2.x.toFixed(1)},${q.p2.y.toFixed(1)}) p3(${q.p3.x.toFixed(1)},${q.p3.y.toFixed(1)}) p4(${q.p4.x.toFixed(1)},${q.p4.y.toFixed(1)})`);
      }
    }

    const aaaa1 = document.querySelector('wc-test div[style*="lime"]');
    const aaaa2 = document.querySelector('wc-test2 div[style*="lime"]');
    traceQuad(aaaa1, 'AAAA1-wctest');
    traceQuad(aaaa2, 'AAAA2-wctest2');
  });

  await browser.close();
});
