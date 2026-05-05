import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const POLYFILL_SOURCE = readFileSync(resolve(ROOT, 'getBoxQuads.js'), 'utf8').replace(/^export\s+/gm, '');

async function injectPolyfill(page) {
  await page.addScriptTag({
    content: `${POLYFILL_SOURCE}\n;addPolyfill(window, true);`,
  });
  await page.waitForFunction(() => typeof Node.prototype.getBoxQuads === 'function');
}

test('sticky positioned element aligns with bounding client rect after sticking', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

  try {
    await page.setContent(`
      <style>
        html, body { margin: 0; padding: 0; }
        #spacer { height: 220px; }
        #scroller {
          height: 240px;
          width: 360px;
          overflow: auto;
          border: 2px solid #444;
          margin: 16px;
          position: relative;
        }
        #inner-spacer { height: 420px; }
        #target {
          position: sticky;
          top: 12px;
          left: 0;
          width: 180px;
          height: 36px;
          background: #e53935;
        }
      </style>
      <div id="spacer"></div>
      <div id="scroller">
        <div id="inner-spacer"></div>
        <div id="target"></div>
        <div style="height: 600px"></div>
      </div>
    `);

    await injectPolyfill(page);

    const result = await page.evaluate(async () => {
      const scroller = document.getElementById('scroller');
      const target = document.getElementById('target');
      if (!scroller || !target) throw new Error('Missing test elements');

      scroller.scrollTop = 520;
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

      const rect = target.getBoundingClientRect();
      const quad = target.getBoxQuads({ box: 'border', relativeTo: document.body })[0];

      return {
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        quad: {
          p1: { x: quad.p1.x, y: quad.p1.y },
          p2: { x: quad.p2.x, y: quad.p2.y },
          p3: { x: quad.p3.x, y: quad.p3.y },
          p4: { x: quad.p4.x, y: quad.p4.y },
        },
      };
    });

    expect(Math.abs(result.quad.p1.x - result.rect.x)).toBeLessThan(1);
    expect(Math.abs(result.quad.p1.y - result.rect.y)).toBeLessThan(1);
    expect(Math.abs(result.quad.p2.x - (result.rect.x + result.rect.w))).toBeLessThan(1);
    expect(Math.abs(result.quad.p4.y - (result.rect.y + result.rect.h))).toBeLessThan(1);
  } finally {
    await browser.close();
  }
});
