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

test('i10: compare myRect1 and myRect2 quads', async () => {
    async function getRectsInfo(page) {
        return await page.evaluate(() => {
            const results = {};
            for (const id of ['myRect1', 'myRect2']) {
                const el = document.getElementById(id);
                if (!el) { results[id] = { error: 'not found' }; continue; }
                const bcr = el.getBoundingClientRect();
                const quads = el.getBoxQuads({ relativeTo: document.body });
                const q = quads[0];
                results[id] = {
                    bcr: { x: bcr.x, y: bcr.y, w: bcr.width, h: bcr.height },
                    quad: q ? {
                        p1: { x: q.p1.x, y: q.p1.y },
                        p2: { x: q.p2.x, y: q.p2.y },
                        p3: { x: q.p3.x, y: q.p3.y },
                        p4: { x: q.p4.x, y: q.p4.y },
                    } : null,
                    offsetLeft: el.offsetLeft,
                    offsetTop: el.offsetTop,
                    offsetParentTag: el.offsetParent?.tagName,
                    offsetParentId: el.offsetParent?.id,
                };
            }
            return results;
        });
    }

    // Firefox native
    const ffBrowser = await firefox.launch({ firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true } });
    const ffPage = await (await ffBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await ffPage.goto(`${baseURL}/i10.html`);
    await ffPage.waitForTimeout(1000);
    const ffResult = await getRectsInfo(ffPage);
    await ffBrowser.close();

    // Chromium polyfill
    const crBrowser = await chromium.launch();
    const crPage = await (await crBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await crPage.goto(`${baseURL}/i10.html`);
    await crPage.waitForFunction(() => typeof Element.prototype.getBoxQuads === 'function', { timeout: 5000 });
    await crPage.waitForTimeout(500);
    const crResult = await getRectsInfo(crPage);
    await crBrowser.close();

    for (const id of ['myRect1', 'myRect2']) {
        console.log(`\n=== ${id} ===`);
        console.log('Firefox:');
        console.log(`  BCR: (${ffResult[id].bcr.x.toFixed(1)}, ${ffResult[id].bcr.y.toFixed(1)}, ${ffResult[id].bcr.w.toFixed(1)}, ${ffResult[id].bcr.h.toFixed(1)})`);
        if (ffResult[id].quad) {
            const q = ffResult[id].quad;
            console.log(`  quad: p1(${q.p1.x.toFixed(1)}, ${q.p1.y.toFixed(1)}) p2(${q.p2.x.toFixed(1)}, ${q.p2.y.toFixed(1)}) p3(${q.p3.x.toFixed(1)}, ${q.p3.y.toFixed(1)}) p4(${q.p4.x.toFixed(1)}, ${q.p4.y.toFixed(1)})`);
        }
        console.log(`  offset: (${ffResult[id].offsetLeft}, ${ffResult[id].offsetTop}) parent=${ffResult[id].offsetParentTag}#${ffResult[id].offsetParentId}`);

        console.log('Polyfill:');
        console.log(`  BCR: (${crResult[id].bcr.x.toFixed(1)}, ${crResult[id].bcr.y.toFixed(1)}, ${crResult[id].bcr.w.toFixed(1)}, ${crResult[id].bcr.h.toFixed(1)})`);
        if (crResult[id].quad) {
            const q = crResult[id].quad;
            console.log(`  quad: p1(${q.p1.x.toFixed(1)}, ${q.p1.y.toFixed(1)}) p2(${q.p2.x.toFixed(1)}, ${q.p2.y.toFixed(1)}) p3(${q.p3.x.toFixed(1)}, ${q.p3.y.toFixed(1)}) p4(${q.p4.x.toFixed(1)}, ${q.p4.y.toFixed(1)})`);
        }
        console.log(`  offset: (${crResult[id].offsetLeft}, ${crResult[id].offsetTop}) parent=${crResult[id].offsetParentTag}#${crResult[id].offsetParentId}`);

        if (ffResult[id].quad && crResult[id].quad) {
            const dx = Math.abs(ffResult[id].quad.p1.x - crResult[id].quad.p1.x);
            const dy = Math.abs(ffResult[id].quad.p1.y - crResult[id].quad.p1.y);
            console.log(`  Delta p1: (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
        }
    }
});
