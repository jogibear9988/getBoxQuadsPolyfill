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

test('fixed element remains viewport-anchored even when nested in static containers', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  try {
    await page.setContent(`
      <style>
        html, body { margin: 0; padding: 0; }
        #scroll-space { height: 2200px; }
        #outer {
          margin-top: 20px;
          margin-left: 20px;
          width: 520px;
          height: 180px;
          border: 1px solid #777;
        }
        #mid {
          width: 360px;
          height: 120px;
        }
        #target {
          position: fixed;
          left: 12px;
          top: 8px;
          width: 120px;
          height: 30px;
          background: #e53935;
        }
      </style>
      <div id="outer">
        <div id="mid">
          <a id="target" href="#"></a>
        </div>
      </div>
      <div id="scroll-space"></div>
    `);

    await injectPolyfill(page);
    await page.evaluate(() => window.scrollTo(0, 600));

    const result = await page.evaluate(() => {
      const target = document.getElementById('target');
      if (!target) throw new Error('target missing');
      const rect = target.getBoundingClientRect();
      const quad = target.getBoxQuads({ box: 'border' })[0];
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
