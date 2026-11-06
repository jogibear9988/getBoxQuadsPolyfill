import { test, expect, chromium, firefox } from '@playwright/test';

const TOLERANCE = 0.1;

const IFRAME_CONTENT = `<!doctype html>
<html>
  <body style="margin:0">
    <visu-tag-root-canvas id="root" style="display:block;position:absolute;width:100%;height:100%;top:0;left:0">
      <svg style="left:12.362px;top:139px;position:absolute;width:3045px;height:1261px;overflow:visible;stroke:#333;fill:none;stroke-width:7;">
        <line id="direct-line" x1="10" y1="10" x2="166.88671875" y2="252.12109375"></line>
      </svg>
    </visu-tag-root-canvas>
    <script>
      customElements.define('visu-tag-root-canvas', class extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: 'open' }).innerHTML = '<slot></slot>';
        }
      });
    </script>
  </body>
</html>`;

const SPLIT_VIEW_SAMPLE = `<!doctype html>
<html>
  <body style="margin:0">
    <div style="display:grid;grid-template-columns:420px 1fr;width:1400px;height:900px">
      <div></div>
      <div id="canvas" style="position:relative;overflow:hidden;width:980px;height:900px">
        <iframe id="frame" style="border:0;width:100%;height:100%"></iframe>
      </div>
    </div>
  </body>
</html>`;

async function openSplitViewPage(browserType, forcePolyfill) {
  const browser = await browserType.launch(browserType === firefox ? {
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  } : undefined);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.goto('/');
  await page.setContent(SPLIT_VIEW_SAMPLE);
  await page.locator('#frame').evaluate((iframe, source) => {
    iframe.contentDocument.open();
    iframe.contentDocument.write(source);
    iframe.contentDocument.close();
  }, IFRAME_CONTENT);

  if (forcePolyfill) {
    await page.evaluate(async () => {
      const module = await import('/getBoxQuads.js');
      module.addPolyfill(window, true);
    });
    await page.locator('#frame').evaluate(async iframe => {
      const module = await iframe.contentWindow.eval('import("/getBoxQuads.js")');
      module.addPolyfill(iframe.contentWindow, true);
    });
  }

  return { browser, page };
}

async function collectLineQuad(page) {
  return page.evaluate(() => {
    const iframe = document.getElementById('frame');
    const line = iframe.contentDocument.getElementById('direct-line');
    const canvas = document.getElementById('canvas');
    const quad = line.getBoxQuads({ relativeTo: canvas })[0];

    return ['p1', 'p2', 'p3', 'p4'].map(point => ({
      x: quad[point].x,
      y: quad[point].y,
    }));
  });
}

function getMaxDelta(expected, actual) {
  let maxDelta = 0;
  for (let index = 0; index < expected.length; index++) {
    maxDelta = Math.max(
      maxDelta,
      Math.abs(expected[index].x - actual[index].x),
      Math.abs(expected[index].y - actual[index].y),
    );
  }
  return maxDelta;
}

test('SVG getBoxQuads infers iframe bridge for relativeTo in the parent document', async () => {
  const native = await openSplitViewPage(firefox, false);
  const expected = await collectLineQuad(native.page);
  await native.page.close();
  await native.browser.close();

  const polyfilled = await openSplitViewPage(chromium, true);
  const actual = await collectLineQuad(polyfilled.page);
  await polyfilled.page.close();
  await polyfilled.browser.close();

  expect(
    getMaxDelta(expected, actual),
    `Chromium polyfill should match Firefox native without passing an explicit iframes option\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
  ).toBeLessThan(TOLERANCE);
});
