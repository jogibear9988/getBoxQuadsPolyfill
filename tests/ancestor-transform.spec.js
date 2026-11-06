import { readFileSync } from 'node:fs';
import { expect, firefox, test } from '@playwright/test';

const source = readFileSync(new URL('../getBoxQuads.js', import.meta.url), 'utf8').replace(/^export\s+/gm, '');

test('uncached ancestor-relative quads preserve transform order and refresh after mutations', async () => {
    const browser = await firefox.launch({ firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true } });
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>
            #root { position:relative; transform:rotate(4deg) scale(1.1); }
            #parent { position:relative; transform:rotate(11deg); padding:20px; }
            .target { width:120px;height:60px;transform-origin:30px 20px; }
            #plain { transform:rotate(21deg) scale(1.2,.8); }
            #individual { translate:10px 15px;rotate:17deg;scale:1.2 .9;transform:skewX(8deg); }
            #percent { translate:25% 30%;transform:rotate(-12deg); }
            </style><div id="root"><div id="parent">
            <div id="plain" class="target"></div><div id="individual" class="target"></div>
            <div id="percent" class="target"></div></div></div>`);

        const collect = () => page.evaluate(() => {
            const relativeTo = document.getElementById('root');
            return [...document.querySelectorAll('.target')].map(element => {
                const q = element.getBoxQuads({ relativeTo })[0];
                return [q.p1, q.p2, q.p3, q.p4].map(p => ({ x: p.x, y: p.y }));
            });
        });
        const original = await collect();
        await page.evaluate(() => { document.getElementById('parent').style.transform = 'rotate(-7deg)'; });
        const changed = await collect();
        await page.evaluate(() => { document.getElementById('parent').style.transform = 'rotate(11deg)'; });
        await page.addScriptTag({ content: `${source}\naddPolyfill(window, true);` });
        const actualOriginal = await collect();
        await page.evaluate(() => { document.getElementById('parent').style.transform = 'rotate(-7deg)'; });
        const actualChanged = await collect();
        for (const [expected, actual] of [[original, actualOriginal], [changed, actualChanged]]) {
            for (let target = 0; target < expected.length; target++) {
                for (let corner = 0; corner < 4; corner++) {
                    expect(actual[target][corner].x).toBeCloseTo(expected[target][corner].x, 1);
                    expect(actual[target][corner].y).toBeCloseTo(expected[target][corner].y, 1);
                }
            }
        }
        expect(actualChanged).not.toEqual(actualOriginal);
    } finally {
        await browser.close();
    }
});

test('3D transform origins retain depth and perspective', async ({ page }) => {
    await page.setContent(`<div style="position:relative;perspective:500px;perspective-origin:0 0">
        <div id="target" style="position:absolute;left:0;top:0;width:120px;height:60px;
            transform:rotateY(30deg);transform-origin:20px 10px 15px"></div></div>`);
    await page.addScriptTag({ content: source });
    const point = await page.evaluate(() => {
        // @ts-ignore Injected polyfill API.
        const matrix = getElementCombinedTransform(document.getElementById('target'));
        return matrix.transformPoint(new DOMPoint(0, 0, 0)).toJSON();
    });
    const angle = Math.PI / 6;
    const x = 20 - 20 * Math.cos(angle) - 15 * Math.sin(angle);
    const z = 15 + 20 * Math.sin(angle) - 15 * Math.cos(angle);
    // Computed CSS matrix serialization rounds the rotation coefficients.
    expect(point.x).toBeCloseTo(x, 3);
    expect(point.y).toBeCloseTo(0, 5);
    expect(point.z).toBeCloseTo(z, 3);
    expect(point.w).toBeCloseTo(1 - z / 500, 5);
});

test('layout translations preserve perspective and scrolling', async ({ page }) => {
    await page.setContent(`<div id="root" style="position:relative;transform-style:preserve-3d;
        width:200px;height:100px;overflow:auto">
        <div id="target" style="position:absolute;left:35px;top:25px;width:120px;height:60px;
            transform:perspective(500px) rotateY(30deg);transform-origin:0 0"></div>
        <div style="width:600px;height:400px"></div></div>`);
    await page.addScriptTag({ content: source });
    const results = await page.evaluate(() => {
        const root = document.getElementById('root');
        const target = document.getElementById('target');
        const measure = () => {
            // @ts-ignore Injected polyfill API.
            const m = getResultingTransformationBetweenElementAndAllAncestors(target, root);
            return m.transformPoint(new DOMPoint(100, 20, 30)).toJSON();
        };
        const before = measure();
        root.scrollLeft = 10;
        root.scrollTop = 15;
        return { before, after: measure() };
    });
    const angle = Math.PI / 6;
    const rotatedX = 100 * Math.cos(angle) + 30 * Math.sin(angle);
    const z = -100 * Math.sin(angle) + 30 * Math.cos(angle);
    const w = 1 - z / 500;
    for (const [point, x, y] of [[results.before, 35, 25], [results.after, 25, 10]]) {
        expect(point.x).toBeCloseTo(rotatedX + x * w, 3);
        expect(point.y).toBeCloseTo(20 + y * w, 3);
        expect(point.z).toBeCloseTo(z, 3);
        expect(point.w).toBeCloseTo(w, 5);
    }
});
