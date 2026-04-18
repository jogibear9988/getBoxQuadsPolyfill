import { test, chromium } from '@playwright/test';
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

test('i10: walk ancestors of myRect1', async () => {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`${baseURL}/i10.html`);
    await page.waitForFunction(() => typeof Element.prototype.getBoxQuads === 'function', { timeout: 5000 });
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
        const el = document.getElementById('myRect1');
        const chain = [];
        let cur = el;
        while (cur && cur !== document.documentElement) {
            const entry = {
                tag: cur.tagName,
                id: cur.id || undefined,
                className: (cur.className && typeof cur.className === 'string') ? cur.className.substring(0, 40) : undefined,
            };
            if (cur instanceof HTMLElement) {
                const st = getComputedStyle(cur);
                entry.position = st.position;
                entry.offsetLeft = cur.offsetLeft;
                entry.offsetTop = cur.offsetTop;
                entry.offsetParentTag = cur.offsetParent?.tagName;
                entry.offsetParentId = cur.offsetParent?.id;
                if (st.display !== 'block' && st.display !== 'inline') entry.display = st.display;
                if (st.transform !== 'none') entry.transform = st.transform;
                if (st.rotate !== 'none') entry.rotate = st.rotate;
                // Check if this could be a containing block
                const hasCB = st.transform !== 'none' || st.filter !== 'none' || st.willChange.includes('transform') || st.contain !== 'none' || st.containerType !== 'normal';
                if (hasCB) entry.containingBlock = true;
            }
            chain.push(entry);
            cur = cur.parentElement;
        }
        return chain;
    });

    for (const entry of result) {
        let line = `${entry.tag}`;
        if (entry.id) line += `#${entry.id}`;
        if (entry.className) line += `.${entry.className.replace(/\s+/g, '.')}`;
        line += ` pos=${entry.position}`;
        line += ` off(${entry.offsetLeft},${entry.offsetTop})→${entry.offsetParentTag}`;
        if (entry.offsetParentId) line += `#${entry.offsetParentId}`;
        if (entry.display) line += ` disp=${entry.display}`;
        if (entry.transform) line += ` transform=${entry.transform}`;
        if (entry.containingBlock) line += ' [CB]';
        console.log(line);
    }

    await browser.close();
});
