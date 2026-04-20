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

test('fixed positioned ancestor does not inherit parent layout offset', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });

    try {
        await page.setContent(`
            <style>
                body { margin: 0; }
                #content {
                    position: relative;
                    top: 56px;
                    height: 200px;
                }
                #masthead-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 320px;
                    height: 56px;
                }
                #buttons {
                    position: absolute;
                    top: 8px;
                    left: 200px;
                    width: 80px;
                    height: 40px;
                    background: red;
                }
            </style>
            <div id="content">
                <div id="masthead-container">
                    <div id="buttons"></div>
                </div>
            </div>
        `);

        await injectPolyfill(page);

        const result = await page.evaluate(() => {
            const target = document.getElementById('buttons');
            const rect = target.getBoundingClientRect();
            const quad = target.getBoxQuads({ relativeTo: document.body })[0];

            return {
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                quad: {
                    p1: { x: quad.p1.x, y: quad.p1.y },
                    p2: { x: quad.p2.x, y: quad.p2.y },
                    p3: { x: quad.p3.x, y: quad.p3.y },
                    p4: { x: quad.p4.x, y: quad.p4.y },
                },
            };
        });

        expect(Math.abs(result.quad.p1.x - result.rect.x)).toBeLessThan(0.1);
        expect(Math.abs(result.quad.p1.y - result.rect.y)).toBeLessThan(0.1);
        expect(Math.abs(result.quad.p2.x - (result.rect.x + result.rect.width))).toBeLessThan(0.1);
        expect(Math.abs(result.quad.p4.y - (result.rect.y + result.rect.height))).toBeLessThan(0.1);
    } finally {
        await browser.close();
    }
});