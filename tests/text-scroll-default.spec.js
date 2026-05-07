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

test('default text quads stay viewport-relative after scrolling', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  try {
    await page.setContent(`
      <style>
        html, body { margin: 0; padding: 0; }
        #spacer { height: 900px; }
        #page {
          position: relative;
          width: 902px;
          height: 1264px;
          transform: scale(0.75);
          transform-origin: left top;
        }
        #layer {
          position: absolute;
          left: 0;
          top: 0;
          width: 0;
          height: 0;
          transform: scale(0.2);
          transform-origin: left top;
        }
        #text {
          position: absolute;
          display: block;
          left: 313px;
          top: 728px;
          width: 720px;
          height: 1px;
          font-size: 95px;
          line-height: 95px;
        }
      </style>
      <div id="spacer"></div>
      <div id="page">
        <div id="layer">
          <span id="text">Scribd text layer</span>
        </div>
      </div>
    `);

    await injectPolyfill(page);
    await page.evaluate(() => document.getElementById('page').scrollIntoView());

    const result = await page.evaluate(() => {
      const textNode = document.getElementById('text').firstChild;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const rect = range.getClientRects()[0];
      const quad = textNode.getBoxQuads()[0];
      const rootQuad = document.getElementById('page').getBoxQuads()[0];

      return {
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        quad: {
          p1: { x: quad.p1.x, y: quad.p1.y },
          p2: { x: quad.p2.x, y: quad.p2.y },
          p4: { x: quad.p4.x, y: quad.p4.y },
        },
        root: { x: rootQuad.p1.x, y: rootQuad.p1.y },
        scrollY: window.scrollY,
      };
    });

    expect(result.scrollY).toBeGreaterThan(0);
    expect(Math.abs(result.quad.p1.x - result.rect.x)).toBeLessThan(1);
    expect(Math.abs(result.quad.p1.y - result.rect.y)).toBeLessThan(1);
    expect(Math.abs(result.quad.p2.x - (result.rect.x + result.rect.w))).toBeLessThan(1);
    expect(Math.abs(result.quad.p4.y - (result.rect.y + result.rect.h))).toBeLessThan(1);
    expect(Math.abs(result.root.y)).toBeLessThan(1);
  } finally {
    await browser.close();
  }
});
