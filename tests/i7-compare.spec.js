import { test, expect, firefox, chromium } from '@playwright/test';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, extname } from 'path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

let server;
let baseURL;

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, '..');
  server = createServer((req, res) => {
    const filePath = resolve(root, req.url === '/' ? 'i7.html' : req.url.slice(1));
    try {
      const data = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  server?.close();
});

/**
 * Add IDs to interesting parent elements so we can match text nodes between browsers.
 */
async function addParentIds(page) {
  await page.evaluate(() => {
    // Tag every element that is a direct parent of a text node with a stable ID
    let idx = 0;
    const iter = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = iter.nextNode())) {
      if (!node.data.trim()) continue;
      const p = node.parentElement;
      if (p && !p.id) {
        p.id = 'tparent-' + idx++;
      }
    }
  });
}

/**
 * Collect text-node box quads grouped by parent ID.
 * Returns a map: parentId -> { parentTag, parentClass, quads: [{ p1, p2, p3, p4 }] }
 */
async function collectTextQuadsByParent(page, rootSelector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const results = {};
    const iter = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = iter.nextNode())) {
      if (!node.data.trim()) continue;
      const p = node.parentElement;
      const pid = p?.id || 'unknown';
      const quads = node.getBoxQuads({ box: 'border', relativeTo: root });
      const mapped = quads.map(q => ({
        p1: { x: Math.round(q.p1.x * 100) / 100, y: Math.round(q.p1.y * 100) / 100 },
        p2: { x: Math.round(q.p2.x * 100) / 100, y: Math.round(q.p2.y * 100) / 100 },
        p3: { x: Math.round(q.p3.x * 100) / 100, y: Math.round(q.p3.y * 100) / 100 },
        p4: { x: Math.round(q.p4.x * 100) / 100, y: Math.round(q.p4.y * 100) / 100 },
      }));
      if (!results[pid]) {
        results[pid] = {
          parentTag: p?.tagName,
          parentClass: p?.className,
          textSnippet: node.data.trim().slice(0, 80),
          quads: mapped,
        };
      } else {
        // Multiple text nodes in same parent – merge quads
        results[pid].quads.push(...mapped);
      }
    }
    return results;
  }, rootSelector);
}

test('compare polyfill text quads against Firefox native', async () => {
  // --- Firefox with native getBoxQuads ---
  const ffBrowser = await firefox.launch({
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  });
  const ffPage = await ffBrowser.newPage({ viewport: { width: 1600, height: 2000 } });
  await ffPage.goto(baseURL + '/i7.html');
  await ffPage.waitForLoadState('networkidle');
  await ffPage.evaluate(() => {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.remove();
  });
  await addParentIds(ffPage);
  const firefoxQuads = await collectTextQuadsByParent(ffPage, '#root');
  await ffBrowser.close();

  // --- Chromium with polyfill ---
  const crBrowser = await chromium.launch();
  const crPage = await crBrowser.newPage({ viewport: { width: 1600, height: 2000 } });
  await crPage.goto(baseURL + '/i7.html');
  await crPage.waitForLoadState('networkidle');
  await addParentIds(crPage);
  const polyfillQuads = await collectTextQuadsByParent(crPage, '#root');
  await crBrowser.close();

  // --- Compare per parent element ---
  // For each parent, compute the bounding box center of all quads combined.
  // Then compare centers. This accounts for different line-breaking.
  const TOLERANCE = 5;

  function quadCenter(q) {
    return {
      x: (q.p1.x + q.p2.x + q.p3.x + q.p4.x) / 4,
      y: (q.p1.y + q.p2.y + q.p3.y + q.p4.y) / 4,
    };
  }

  function allQuadsBBox(quads) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const q of quads) {
      for (const p of [q.p1, q.p2, q.p3, q.p4]) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  const allParentIds = new Set([...Object.keys(firefoxQuads), ...Object.keys(polyfillQuads)]);

  for (const pid of [...allParentIds].sort()) {
    const ff = firefoxQuads[pid];
    const pf = polyfillQuads[pid];

    if (!ff || !pf) {
      console.log(`[${pid}] MISSING in ${!ff ? 'Firefox' : 'Polyfill'}`);
      continue;
    }

    const ffBBox = allQuadsBBox(ff.quads);
    const pfBBox = allQuadsBBox(pf.quads);

    const dcx = Math.abs(ffBBox.cx - pfBBox.cx);
    const dcy = Math.abs(ffBBox.cy - pfBBox.cy);

    // Also compare individual quads when counts match
    if (ff.quads.length === pf.quads.length) {
      let worst = 0;
      for (let i = 0; i < ff.quads.length; i++) {
        const fc = quadCenter(ff.quads[i]);
        const pc = quadCenter(pf.quads[i]);
        const dist = Math.hypot(fc.x - pc.x, fc.y - pc.y);
        worst = Math.max(worst, dist);
      }

      if (worst > TOLERANCE) {
        console.log(`[${pid}] MISMATCH (${ff.quads.length} quads) | ${ff.parentTag}.${ff.parentClass} | text="${ff.textSnippet}"`);
        console.log(`  BBox center: FF(${ffBBox.cx.toFixed(1)}, ${ffBBox.cy.toFixed(1)}) vs PF(${pfBBox.cx.toFixed(1)}, ${pfBBox.cy.toFixed(1)}) delta(${dcx.toFixed(1)}, ${dcy.toFixed(1)})`);
        for (let i = 0; i < ff.quads.length; i++) {
          const fq = ff.quads[i];
          const pq = pf.quads[i];
          console.log(`  quad[${i}] FF: p1(${fq.p1.x},${fq.p1.y}) p2(${fq.p2.x},${fq.p2.y}) p3(${fq.p3.x},${fq.p3.y}) p4(${fq.p4.x},${fq.p4.y})`);
          console.log(`  quad[${i}] PF: p1(${pq.p1.x},${pq.p1.y}) p2(${pq.p2.x},${pq.p2.y}) p3(${pq.p3.x},${pq.p3.y}) p4(${pq.p4.x},${pq.p4.y})`);
        }
      } else {
        console.log(`[${pid}] OK (${ff.quads.length} quads) | ${ff.parentTag}.${ff.parentClass} | worst=${worst.toFixed(1)}px`);
      }
    } else {
      // Different quad counts: compare overall bounding box center
      const dist = Math.hypot(dcx, dcy);
      if (dist > TOLERANCE) {
        console.log(`[${pid}] MISMATCH (FF:${ff.quads.length} vs PF:${pf.quads.length} quads) | ${ff.parentTag}.${ff.parentClass} | text="${ff.textSnippet}"`);
        console.log(`  BBox center: FF(${ffBBox.cx.toFixed(1)}, ${ffBBox.cy.toFixed(1)}) vs PF(${pfBBox.cx.toFixed(1)}, ${pfBBox.cy.toFixed(1)}) delta(${dcx.toFixed(1)}, ${dcy.toFixed(1)})`);
        console.log(`  FF BBox: (${ffBBox.minX.toFixed(1)},${ffBBox.minY.toFixed(1)})-(${ffBBox.maxX.toFixed(1)},${ffBBox.maxY.toFixed(1)})`);
        console.log(`  PF BBox: (${pfBBox.minX.toFixed(1)},${pfBBox.minY.toFixed(1)})-(${pfBBox.maxX.toFixed(1)},${pfBBox.maxY.toFixed(1)})`);
      } else {
        console.log(`[${pid}] OK (FF:${ff.quads.length} vs PF:${pf.quads.length} quads) | ${ff.parentTag}.${ff.parentClass} | bbox_dist=${dist.toFixed(1)}px`);
      }
    }
  }
});
