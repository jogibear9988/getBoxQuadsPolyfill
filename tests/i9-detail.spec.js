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

test('i9 detailed quad comparison including shadow DOM', async () => {
  async function getAllDivQuads(page) {
    return page.evaluate(() => {
      function collectDivs(root, prefix) {
        const results = [];
        // querySelectorAll on shadowRoots too
        const divs = root.querySelectorAll('div');
        for (const div of divs) {
          const rect = div.getBoundingClientRect();
          const style = getComputedStyle(div);
          const quads = div.getBoxQuads({ box: 'border', relativeTo: document.body });
          results.push({
            prefix,
            bg: div.style.background || '',
            rotate: div.style.rotate || '',
            text: div.textContent.trim().slice(0, 20),
            position: style.position,
            bcr: { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10, w: Math.round(rect.width * 10) / 10, h: Math.round(rect.height * 10) / 10 },
            quads: quads.map(q => ({
              p1: { x: Math.round(q.p1.x * 10) / 10, y: Math.round(q.p1.y * 10) / 10 },
              p2: { x: Math.round(q.p2.x * 10) / 10, y: Math.round(q.p2.y * 10) / 10 },
              p3: { x: Math.round(q.p3.x * 10) / 10, y: Math.round(q.p3.y * 10) / 10 },
              p4: { x: Math.round(q.p4.x * 10) / 10, y: Math.round(q.p4.y * 10) / 10 },
            })),
          });
          // Check shadow root
          if (div.shadowRoot) {
            results.push(...collectDivs(div.shadowRoot, prefix + '/shadow'));
          }
        }
        return results;
      }
      // Also get custom elements' shadow roots
      const results = [];
      // Light DOM divs from body
      const bodyDivs = collectDivs(document.body, 'body');
      results.push(...bodyDivs);
      // Shadow DOM from custom elements
      const customs = document.body.querySelectorAll('wc-test, wc-test2');
      for (const ce of customs) {
        if (ce.shadowRoot) {
          const shadowDivs = collectDivs(ce.shadowRoot, ce.tagName);
          results.push(...shadowDivs);
        }
      }
      return results;
    });
  }

  // Firefox
  const ffBrowser = await firefox.launch({ firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true } });
  const ffPage = await ffBrowser.newPage({ viewport: { width: 900, height: 400 } });
  await ffPage.goto(baseURL + '/i9.html');
  await ffPage.waitForLoadState('networkidle');
  await ffPage.evaluate(() => document.getElementById('overlay')?.remove());
  const ffDivs = await getAllDivQuads(ffPage);
  await ffBrowser.close();

  // Chromium
  const crBrowser = await chromium.launch();
  const crPage = await crBrowser.newPage({ viewport: { width: 900, height: 400 } });
  await crPage.goto(baseURL + '/i9.html');
  await crPage.waitForLoadState('networkidle');
  const pfDivs = await getAllDivQuads(crPage);
  await crBrowser.close();

  console.log('\n=== FIREFOX ===');
  for (const d of ffDivs) {
    console.log(`[${d.prefix}] bg=${d.bg} rot=${d.rotate} pos=${d.position} text="${d.text}" bcr=(${d.bcr.x},${d.bcr.y},${d.bcr.w},${d.bcr.h})`);
    for (const q of d.quads) {
      console.log(`  quad: p1(${q.p1.x},${q.p1.y}) p2(${q.p2.x},${q.p2.y}) p3(${q.p3.x},${q.p3.y}) p4(${q.p4.x},${q.p4.y})`);
    }
  }

  console.log('\n=== POLYFILL ===');
  for (const d of pfDivs) {
    console.log(`[${d.prefix}] bg=${d.bg} rot=${d.rotate} pos=${d.position} text="${d.text}" bcr=(${d.bcr.x},${d.bcr.y},${d.bcr.w},${d.bcr.h})`);
    for (const q of d.quads) {
      console.log(`  quad: p1(${q.p1.x},${q.p1.y}) p2(${q.p2.x},${q.p2.y}) p3(${q.p3.x},${q.p3.y}) p4(${q.p4.x},${q.p4.y})`);
    }
  }
});
