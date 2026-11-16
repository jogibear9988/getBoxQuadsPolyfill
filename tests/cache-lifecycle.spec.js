import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../getBoxQuads.js', import.meta.url), 'utf8').replace(/^export\s+/gm, '');

test('cache clearing is safe before initialization and refreshes changed geometry afterward', async ({ page }) => {
    await page.setContent('<style>body{margin:0}#target{position:absolute;left:10px;top:20px;width:30px;height:40px}</style><div id="target"></div>');
    await page.addScriptTag({ content: source + '\nclearCache(); clearCache(); addPolyfill(window, true);' });
    const positions = await page.evaluate(() => {
        const target = document.getElementById('target');
        const left = () => target.getBoxQuads({ relativeTo: document.documentElement })[0].p1.x;
        const uncached = left();
        useCache();
        const cached = left();
        target.style.left = '80px';
        clearCache();
        clearCache();
        return { uncached, cached, refreshed: left() };
    });
    expect(positions).toEqual({ uncached: 10, cached: 10, refreshed: 80 });
});
