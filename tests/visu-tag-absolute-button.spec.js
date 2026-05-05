import { test, chromium, firefox, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const POLYFILL_SOURCE = readFileSync(resolve(ROOT, 'getBoxQuads.js'), 'utf8').replace(/^export\s+/gm, '');

async function createScenario(page, usePolyfill) {
    await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0;">
            <div id="outer-canvas" style="width:1000px;height:700px;position:relative;overflow:hidden;">
                <div id="canvas-container" style="width:100%;height:100%;position:absolute;top:0;left:0;transform-origin:0 0;transform:scale(1.35) translate(37px, 21px);">
                    <div id="canvas-host" style="width:700px;height:500px;display:block;position:absolute;top:90px;left:140px;"></div>
                </div>
                <svg id="overlay" style="width:100%;height:100%;position:absolute;top:0;left:0;transform-origin:0 0;transform:scale(1.35) translate(37px, 21px);"></svg>
            </div>
        </body>
        </html>
    `);

    await page.evaluate(() => {
        const canvasHost = document.getElementById('canvas-host');
        const canvasRoot = canvasHost.attachShadow({ mode: 'open' });

        const host = document.createElement('visu-tag-root-canvas');
        host.setAttribute('bind-prop:tag-root', '__tagRoot;__0');
        host.style.cssText = 'width:100%;height:100%;position:static;';
        canvasRoot.appendChild(host);

        const innerShadow = host.attachShadow({ mode: 'open' });
        const rootObj = document.createElement('div');
        rootObj.id = 'rootObj';
        rootObj.style.cssText = 'height:100%;width:100%;';
        rootObj.appendChild(document.createElement('slot'));
        innerShadow.appendChild(rootObj);

        const content = document.createElement('div');
        content.setAttribute('bind-content:html', '__test');
        content.style.cssText = 'width:200px;height:200px;position:absolute;left:112px;top:94px;';
        host.appendChild(content);

        const button = document.createElement('button');
        button.id = 'test';
        button.setAttribute('onclick', 'aaa');
        button.textContent = 'dsdsds';
        button.style.cssText = 'width:200px;height:32px;position:absolute;left:345px;top:140px;';
        host.appendChild(button);
    });

    if (usePolyfill) {
        await page.addScriptTag({
            content: `${POLYFILL_SOURCE}\n;addPolyfill(window, true);`,
        });
        await page.waitForFunction(() => typeof Node.prototype.getBoxQuads === 'function');
    }

    await page.waitForTimeout(50);
}

async function getButtonQuad(page) {
    return page.evaluate(() => {
        const canvasHost = document.getElementById('canvas-host');
        const componentHost = canvasHost.shadowRoot.querySelector('visu-tag-root-canvas');
        const button = componentHost.querySelector('#test');
        const rect = button.getBoundingClientRect();
        const quad = button.getBoxQuads({ relativeTo: canvasHost })[0];
        return {
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            quad: {
                p1: { x: quad.p1.x, y: quad.p1.y },
                p2: { x: quad.p2.x, y: quad.p2.y },
                p3: { x: quad.p3.x, y: quad.p3.y },
                p4: { x: quad.p4.x, y: quad.p4.y },
            },
        };
    });
}

test('visu-tag absolute slotted button matches Firefox native quads', async () => {
    const firefoxBrowser = await firefox.launch({
        firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
    });
    const firefoxPage = await (await firefoxBrowser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await createScenario(firefoxPage, false);
    const firefoxInfo = await getButtonQuad(firefoxPage);
    await firefoxBrowser.close();

    const chromiumBrowser = await chromium.launch();
    const chromiumPage = await (await chromiumBrowser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await createScenario(chromiumPage, true);
    const chromiumInfo = await getButtonQuad(chromiumPage);
    await chromiumBrowser.close();

    expect(Math.abs(chromiumInfo.quad.p1.x - firefoxInfo.quad.p1.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(chromiumInfo.quad.p1.y - firefoxInfo.quad.p1.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(chromiumInfo.quad.p2.x - firefoxInfo.quad.p2.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(chromiumInfo.quad.p2.y - firefoxInfo.quad.p2.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(chromiumInfo.quad.p3.x - firefoxInfo.quad.p3.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(chromiumInfo.quad.p3.y - firefoxInfo.quad.p3.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(chromiumInfo.quad.p4.x - firefoxInfo.quad.p4.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(chromiumInfo.quad.p4.y - firefoxInfo.quad.p4.y)).toBeLessThanOrEqual(1);
});