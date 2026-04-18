import { test, chromium, firefox } from '@playwright/test';

// Test the visu-tag-root-canvas case: static slotted element inside position:absolute shadow DOM div
// The wrapper div should appear at top:400px (from the shadow DOM rootObj div)
test('visu-tag: slotted static element at top:400px', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await context.newPage();

    // Load i9.html but inject the visu-tag test case
    await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body style="padding:0;margin:0;">
            <div>
                <visu-tag-root-canvas style="display:block;">
                    <div class="wrapper" id="aaaaabb" style="height:50px;width:50px;background:lime;">WRAPPER</div>
                </visu-tag-root-canvas>
            </div>
            <script type="module">
                // Manually create shadow DOM (since declarative needs parsing support)
                const host = document.querySelector('visu-tag-root-canvas');
                const shadow = host.attachShadow({ mode: 'open' });
                const rootObj = document.createElement('div');
                rootObj.style.cssText = 'height:100%;width:100%;position:absolute;top:400px;';
                const slot = document.createElement('slot');
                rootObj.appendChild(slot);
                shadow.appendChild(rootObj);
            </script>
        </body>
        </html>
    `, { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(200);

    // Now inject the polyfill
    const polyfillCode = await require('fs').promises.readFile(
        '/Users/jkuehner/Documents/Repos/getBoxQuadsPolyfill/getBoxQuads.js', 'utf8'
    );
    // Wrap in a function to avoid module scope issues
    await page.addScriptTag({
        path: '/Users/jkuehner/Documents/Repos/getBoxQuadsPolyfill/getBoxQuads.js',
        type: 'module'
    });

    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
        // The polyfill should be loaded via module, but let's check
        const el = document.getElementById('aaaaabb');
        if (!el.getBoxQuads) return { error: 'getBoxQuads not available' };

        const quads = el.getBoxQuads({ relativeTo: document.body });
        const bcr = el.getBoundingClientRect();
        return {
            bcr: { x: bcr.x, y: bcr.y, w: bcr.width, h: bcr.height },
            p1: { x: quads[0].p1.x, y: quads[0].p1.y },
            p2: { x: quads[0].p2.x, y: quads[0].p2.y },
            p3: { x: quads[0].p3.x, y: quads[0].p3.y },
            p4: { x: quads[0].p4.x, y: quads[0].p4.y },
        };
    });

    console.log('visu-tag result:', JSON.stringify(result, null, 2));
    console.log('Expected: wrapper at approximately (0, 400) since rootObj has top:400px');

    await browser.close();
});
