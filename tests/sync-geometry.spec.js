import { readFileSync } from 'node:fs';
import { chromium, firefox, expect, test } from '@playwright/test';

const source = readFileSync(new URL('../getBoxQuads.js', import.meta.url), 'utf8').replace(/^export\s+/gm, '');
const fixture = `<style>
    html, body { margin:0; }
    body { height:2000px; }
    #relative { position:absolute;left:100px;top:200px;width:300px;height:200px;
        transform:scale(1.5);transform-origin:0 0; }
    #fixed { position:fixed;left:25px;top:35px;width:70px;height:40px; }
    svg { position:absolute;left:400px;top:100px; }
    </style>
    <div id="relative"></div><div><div id="fixed"></div></div>
    <svg width="200" height="200"><rect id="rotated" x="20" y="30" width="80" height="45"
        transform="rotate(20 60 50)"/></svg>`;

async function measure(page) {
    return page.evaluate(() => {
        const relativeTo = document.getElementById('relative');
        return ['fixed', 'rotated'].map(id => {
            const quad = document.getElementById(id).getBoxQuads({ relativeTo })[0];
            return ['p1', 'p2', 'p3', 'p4'].map(point => ({ x: quad[point].x, y: quad[point].y }));
        });
    });
}

test('ported fixed and rotated SVG geometry preserves coordinate spaces', async () => {
    const nativeBrowser = await firefox.launch({
        firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
    });
    let expected;
    try {
        const page = await nativeBrowser.newPage();
        await page.setContent(fixture);
        await page.evaluate(() => window.scrollTo(0, 300));
        expected = await measure(page);
        // The designer uses the oriented SVG box; native Firefox returns an
        // axis-aligned SVG bounding box. Check the known rotation explicitly.
        const angle = 20 * Math.PI / 180;
        expected[1] = [[20, 30], [100, 30], [100, 75], [20, 75]].map(([x, y]) => ({
            x: (300 + 60 + (x - 60) * Math.cos(angle) - (y - 50) * Math.sin(angle)) / 1.5,
            y: (-100 + 50 + (x - 60) * Math.sin(angle) + (y - 50) * Math.cos(angle)) / 1.5,
        }));
    } finally {
        await nativeBrowser.close();
    }
    for (const browserType of [firefox, chromium]) {
        const browser = await browserType.launch();
        try {
            const page = await browser.newPage();
            await page.setContent(fixture);
            await page.evaluate(() => window.scrollTo(0, 300));
            await page.addScriptTag({ content: `${source}\naddPolyfill(window, true);` });
            const actual = await measure(page);
            for (let index = 0; index < expected.length; index++) {
                for (let point = 0; point < 4; point++) {
                    expect(actual[index][point].x, `${browserType.name()} target ${index}`).toBeCloseTo(expected[index][point].x, 1);
                    expect(actual[index][point].y, `${browserType.name()} target ${index}`).toBeCloseTo(expected[index][point].y, 1);
                }
            }
        } finally {
            await browser.close();
        }
    }
});
