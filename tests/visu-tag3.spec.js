import { test, chromium, firefox } from '@playwright/test';

test('visu-tag: static slotted element inside position:absolute shadow div', async () => {
    // Firefox with native getBoxQuads
    const ffBrowser = await firefox.launch({
        firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true }
    });
    const ffContext = await ffBrowser.newContext({ viewport: { width: 900, height: 600 } });
    const ffPage = await ffContext.newPage();
    await ffPage.goto('file:///Users/jkuehner/Documents/Repos/getBoxQuadsPolyfill/visu-tag-test.html');
    await ffPage.waitForTimeout(500);

    const ffResult = await ffPage.evaluate(() => {
        const el = document.getElementById('aaaaabb');
        const quads = el.getBoxQuads({ relativeTo: document.body });
        const bcr = el.getBoundingClientRect();
        return {
            bcr: { x: bcr.x, y: bcr.y, w: bcr.width, h: bcr.height },
            quad: quads[0] ? {
                p1: { x: quads[0].p1.x, y: quads[0].p1.y },
                p2: { x: quads[0].p2.x, y: quads[0].p2.y },
            } : null,
        };
    });
    await ffBrowser.close();

    // Chromium with polyfill
    const crBrowser = await chromium.launch();
    const crContext = await crBrowser.newContext({ viewport: { width: 900, height: 600 } });
    const crPage = await crContext.newPage();
    await crPage.goto('file:///Users/jkuehner/Documents/Repos/getBoxQuadsPolyfill/visu-tag-test.html');
    await crPage.waitForFunction(() => typeof Element.prototype.getBoxQuads === 'function', { timeout: 5000 });

    const crResult = await crPage.evaluate(() => {
        const el = document.getElementById('aaaaabb');
        const quads = el.getBoxQuads({ relativeTo: document.body });
        const bcr = el.getBoundingClientRect();
        return {
            bcr: { x: bcr.x, y: bcr.y, w: bcr.width, h: bcr.height },
            quad: quads[0] ? {
                p1: { x: quads[0].p1.x, y: quads[0].p1.y },
                p2: { x: quads[0].p2.x, y: quads[0].p2.y },
            } : null,
        };
    });
    await crBrowser.close();

    console.log('Firefox:', JSON.stringify(ffResult));
    console.log('Polyfill:', JSON.stringify(crResult));
    if (ffResult.quad && crResult.quad) {
        const dx = Math.abs(ffResult.quad.p1.x - crResult.quad.p1.x);
        const dy = Math.abs(ffResult.quad.p1.y - crResult.quad.p1.y);
        console.log(`Delta: (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
    }
});
