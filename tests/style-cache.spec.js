import { readFileSync } from 'node:fs';
import { chromium, firefox, expect, test } from '@playwright/test';

const source = readFileSync(new URL('../getBoxQuads.js', import.meta.url), 'utf8').replace(/^export\s+/gm, '');

for (const browserType of [firefox, chromium]) {
    test(`${browserType.name()}: style reuse is scoped to one measurement`, async () => {
        const browser = await browserType.launch();
        try {
            const page = await browser.newPage();
            await page.setContent(`<div style="position:relative;transform:rotate(5deg)">
                <div id="target" style="width:100px;height:40px">text</div></div>`);
            await page.addScriptTag({ content: `${source}\naddPolyfill(window, true);` });
            const result = await page.evaluate(() => {
                const target = document.getElementById('target');
                const original = window.getComputedStyle;
                const reads = new Map();
                window.getComputedStyle = function (element, pseudo) {
                    reads.set(element, (reads.get(element) ?? 0) + 1);
                    return original.call(this, element, pseudo);
                };
                const before = target.getBoxQuads()[0];
                const maxReads = Math.max(...reads.values());
                reads.clear();
                target.style.transform = 'translateX(30px)';
                const after = target.getBoxQuads()[0];
                const freshReads = reads.get(target);
                const dx = after.p1.x - before.p1.x;
                const dy = after.p1.y - before.p1.y;
                const countingStyle = window.getComputedStyle;
                window.getComputedStyle = function (element, pseudo) {
                    if (element === target.parentElement) throw new Error('interrupted measurement');
                    return countingStyle.call(this, element, pseudo);
                };
                let threw = false;
                try { target.getBoxQuads(); } catch { threw = true; }
                window.getComputedStyle = countingStyle;
                reads.clear();
                target.getBoxQuads();
                return { maxReads, freshReads, distance: Math.hypot(dx, dy), threw, readsAfterError: reads.get(target) };
            });
            expect(result.maxReads).toBe(1);
            expect(result.freshReads).toBe(1);
            expect(result.distance).toBeCloseTo(30, 3);
            expect(result.threw).toBe(true);
            expect(result.readsAfterError).toBe(1);

            const cached = await page.evaluate(() => {
                const target = document.getElementById('target');
                // @ts-ignore Injected polyfill API.
                useCache();
                const options = { relativeTo: target.parentElement };
                const before = target.getBoxQuads(options)[0];
                let reads = 0;
                const original = window.getComputedStyle;
                window.getComputedStyle = function (...args) {
                    reads++;
                    return original.apply(this, args);
                };
                const hit = target.getBoxQuads(options)[0];
                const hitReads = reads;
                target.style.transform = 'translateX(60px)';
                // @ts-ignore Injected polyfill API.
                clearCache();
                const after = target.getBoxQuads(options)[0];
                return { hitReads, same: hit === before, dx: after.p1.x - before.p1.x };
            });
            expect(cached.hitReads).toBe(0);
            expect(cached.same).toBe(true);
            expect(cached.dx).toBeCloseTo(30, 5);
        } finally {
            await browser.close();
        }
    });
}
