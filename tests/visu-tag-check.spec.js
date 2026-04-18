import { test, chromium } from '@playwright/test';

const STATIC_BASE_URL = 'http://127.0.0.1:4173';

test('visu-tag: check polyfill loads', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await context.newPage();

    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.goto(`${STATIC_BASE_URL}/visu-tag-test.html`);
    await page.waitForTimeout(2000);

    const hasPolyfill = await page.evaluate(() => typeof Element.prototype.getBoxQuads === 'function');
    console.log('Polyfill loaded:', hasPolyfill);

    const shadowExists = await page.evaluate(() => {
        const host = document.querySelector('visu-tag-root-canvas');
        return host?.shadowRoot != null;
    });
    console.log('Shadow root exists:', shadowExists);

    await browser.close();
});
