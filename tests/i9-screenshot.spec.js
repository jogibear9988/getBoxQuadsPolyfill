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

test('i9 screenshot: Firefox vs Polyfill', async () => {
    // Firefox
    const ffBrowser = await firefox.launch({
        firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true }
    });
    const ffPage = await (await ffBrowser.newContext({ viewport: { width: 900, height: 200 } })).newPage();
    await ffPage.goto(`${baseURL}/i9.html`);
    await ffPage.waitForTimeout(500);
    await ffPage.screenshot({ path: 'tests/i9-ff-final.png' });
    await ffBrowser.close();

    // Chromium polyfill
    const crBrowser = await chromium.launch();
    const crPage = await (await crBrowser.newContext({ viewport: { width: 900, height: 200 } })).newPage();
    await crPage.goto(`${baseURL}/i9.html`);
    await crPage.waitForFunction(() => typeof Element.prototype.getBoxQuads === 'function', { timeout: 5000 });
    await crPage.waitForTimeout(500);
    await crPage.screenshot({ path: 'tests/i9-pf-final.png' });
    await crBrowser.close();
});
