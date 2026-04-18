import { test, chromium, firefox } from '@playwright/test';

const STATIC_BASE_URL = 'http://127.0.0.1:4173';

test('visu-tag-root-canvas: compare polyfill vs Firefox native', async () => {
    // Firefox with native getBoxQuads
    const ffBrowser = await firefox.launch({
        firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true }
    });
    const ffContext = await ffBrowser.newContext({ viewport: { width: 900, height: 600 } });
    const ffPage = await ffContext.newPage();
    await ffPage.goto(`${STATIC_BASE_URL}/visu-tag-test.html`);
    await ffPage.waitForTimeout(500);

    const ffResult = await ffPage.evaluate(() => {
        const el = document.getElementById('aaaaabb');
        const quads = el.getBoxQuads({ relativeTo: document.body });
        return {
            bcr: el.getBoundingClientRect(),
            p1: { x: quads[0].p1.x, y: quads[0].p1.y },
            p2: { x: quads[0].p2.x, y: quads[0].p2.y },
            p3: { x: quads[0].p3.x, y: quads[0].p3.y },
            p4: { x: quads[0].p4.x, y: quads[0].p4.y },
        };
    });
    await ffBrowser.close();

    // Chromium with polyfill
    const crBrowser = await chromium.launch();
    const crContext = await crBrowser.newContext({ viewport: { width: 900, height: 600 } });
    const crPage = await crContext.newPage();
    await crPage.goto(`${STATIC_BASE_URL}/visu-tag-test.html`);
    await crPage.waitForTimeout(1000);
    await crPage.waitForFunction(() => typeof Element.prototype.getBoxQuads === 'function', { timeout: 5000 }).catch(() => {});

    const crResult = await crPage.evaluate(() => {
        const el = document.getElementById('aaaaabb');
        const quads = el.getBoxQuads({ relativeTo: document.body });
        return {
            bcr: el.getBoundingClientRect(),
            p1: { x: quads[0].p1.x, y: quads[0].p1.y },
            p2: { x: quads[0].p2.x, y: quads[0].p2.y },
            p3: { x: quads[0].p3.x, y: quads[0].p3.y },
            p4: { x: quads[0].p4.x, y: quads[0].p4.y },
        };
    });
    await crBrowser.close();

    console.log('Firefox native:');
    console.log(`  BCR: (${ffResult.bcr.x}, ${ffResult.bcr.y}, ${ffResult.bcr.width}, ${ffResult.bcr.height})`);
    console.log(`  p1(${ffResult.p1.x.toFixed(1)}, ${ffResult.p1.y.toFixed(1)}) p2(${ffResult.p2.x.toFixed(1)}, ${ffResult.p2.y.toFixed(1)}) p3(${ffResult.p3.x.toFixed(1)}, ${ffResult.p3.y.toFixed(1)}) p4(${ffResult.p4.x.toFixed(1)}, ${ffResult.p4.y.toFixed(1)})`);

    console.log('Polyfill:');
    console.log(`  BCR: (${crResult.bcr.x}, ${crResult.bcr.y}, ${crResult.bcr.width}, ${crResult.bcr.height})`);
    console.log(`  p1(${crResult.p1.x.toFixed(1)}, ${crResult.p1.y.toFixed(1)}) p2(${crResult.p2.x.toFixed(1)}, ${crResult.p2.y.toFixed(1)}) p3(${crResult.p3.x.toFixed(1)}, ${crResult.p3.y.toFixed(1)}) p4(${crResult.p4.x.toFixed(1)}, ${crResult.p4.y.toFixed(1)})`);

    const dx = Math.abs(ffResult.p1.x - crResult.p1.x);
    const dy = Math.abs(ffResult.p1.y - crResult.p1.y);
    console.log(`  Delta: (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
});
