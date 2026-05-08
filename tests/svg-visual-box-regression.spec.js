import { test, expect, chromium, firefox } from '@playwright/test';

const FIREFOX_POLYFILL_TOLERANCE = 0.35;
const CHROMIUM_TO_FIREFOX_TOLERANCE = 2;

const SVG_VISUAL_BOX_SAMPLE = `<!doctype html>
<html>
  <body style="margin:0;position:relative;min-height:1800px;">
    <svg style="left:292.238px;top:169.68px;position:absolute;width:177px;height:262px;overflow:visible;stroke:black;stroke-width:3;">
      <line data-name="plain-line" x1="10" y1="10" x2="166.88671875" y2="252.12109375"></line>
    </svg>

    <div style="position:absolute;left:565px;top:177px;width:443px;height:235px;rotate:30deg;transform:matrix3d(1.13029, -0.069113, 0, 0.0005882, 0.270919, 0.856284, 0, -0.0012231, 0, 0, 1, 0, 60.6912, -32.1951, 0, 0.98657);">
      <svg style="left:90px;top:26px;position:absolute;width:177px;height:262px;overflow:visible;stroke:black;stroke-width:3;">
        <line data-name="transformed-line" x1="10" y1="10" x2="70.52363586425781" y2="179.97647094726562"></line>
      </svg>
    </div>

    <svg style="left:1040px;top:160px;position:absolute;width:420px;height:260px;overflow:visible;stroke:#333;fill:none;stroke-width:7;">
      <path data-name="plain-path" d="M 20 230 L 20 120 L 110 120 L 110 60 L 190 60 L 190 20 L 390 20 L 390 230" fill="none"></path>
    </svg>

    <visu-tag-root-canvas tag-root="CS.FM_L" node-projects-lock-at-design-time style="display:block;position:relative;width:100%;height:100%;top:0px;left:0px;">
      <template shadowrootmode="open"><slot></slot></template>
      <svg node-projects-lock-at-design-time style="left:12.362px;top:139px;position:absolute;width:3045px;height:1261px;overflow:visible;stroke:#333;fill:none;stroke-width:7;">
        <svg style="left:101px;top:121px;position:absolute;width:177px;height:262px;overflow:visible;stroke:black;stroke-width:3;">
          <line data-name="nested-line" x1="10" y1="10" x2="166.88671875" y2="252.12109375"></line>
        </svg>
        <div style="position:absolute;left:565px;top:177px;width:443px;height:235px;rotate:30deg;transform:matrix3d(1.13029, -0.069113, 0, 0.0005882, 0.270919, 0.856284, 0, -0.0012231, 0, 0, 1, 0, 60.6912, -32.1951, 0, 0.98657);">
          <svg style="left:90px;top:26px;position:absolute;width:177px;height:262px;overflow:visible;stroke:black;stroke-width:3;">
            <line data-name="nested-transformed-line" x1="10" y1="10" x2="70.52363586425781" y2="179.97647094726562"></line>
          </svg>
        </div>
      </svg>
    </visu-tag-root-canvas>
  </body>
</html>`;

async function openPage(browserType, forcePolyfill = false) {
  const browser = await browserType.launch(browserType === firefox ? {
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  } : undefined);
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1400 } })).newPage();
  await page.goto('/');
  await page.setContent(SVG_VISUAL_BOX_SAMPLE);
  if (forcePolyfill) {
    await page.evaluate(async () => {
      const module = await import('/getBoxQuads.js');
      module.addPolyfill(window, true);
    });
  }
  return { browser, page };
}

async function collectSvgVisualBoxData(page) {
  return page.evaluate(() => {
    const serializeQuad = quad => ({
      p1: { x: quad.p1.x, y: quad.p1.y },
      p2: { x: quad.p2.x, y: quad.p2.y },
      p3: { x: quad.p3.x, y: quad.p3.y },
      p4: { x: quad.p4.x, y: quad.p4.y },
    });
    const serializeRect = rect => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });

    return Array.from(document.querySelectorAll('[data-name]'))
      .filter(element => element instanceof SVGGraphicsElement)
      .map(element => {
        const bbox = element.getBBox();
        return {
          name: element.dataset.name,
          tagName: element.tagName,
          rect: serializeRect(element.getBoundingClientRect()),
          bbox: serializeRect(bbox),
          document: serializeQuad(element.getBoxQuads()[0]),
          body: serializeQuad(element.getBoxQuads({ relativeTo: document.body })[0]),
          ownerSvg: serializeQuad(element.getBoxQuads({ relativeTo: element.ownerSVGElement })[0]),
        };
      });
  });
}

function getMaxQuadDelta(expected, actual) {
  let maxDelta = 0;
  for (const point of ['p1', 'p2', 'p3', 'p4']) {
    maxDelta = Math.max(
      maxDelta,
      Math.abs(expected[point].x - actual[point].x),
      Math.abs(expected[point].y - actual[point].y),
    );
  }
  return maxDelta;
}

function expectSvgVisualBoxMatch(expected, actual, tolerance, label) {
  expect(actual.map(item => item.name)).toEqual(expected.map(item => item.name));

  for (let index = 0; index < expected.length; index++) {
    const expectedItem = expected[index];
    const actualItem = actual[index];
    expect(actualItem.tagName).toBe(expectedItem.tagName);

    for (const key of ['document', 'body', 'ownerSvg']) {
      const delta = getMaxQuadDelta(expectedItem[key], actualItem[key]);
      expect(
        delta,
        `${label}: ${expectedItem.name}.${key} should match Firefox native\nExpected: ${JSON.stringify(expectedItem)}\nActual: ${JSON.stringify(actualItem)}`,
      ).toBeLessThan(tolerance);
    }
  }
}

test('SVG visual boxes match Firefox native when the polyfill is forced in Firefox', async () => {
  const native = await openPage(firefox, false);
  const expected = await collectSvgVisualBoxData(native.page);
  await native.page.close();
  await native.browser.close();

  const polyfilled = await openPage(firefox, true);
  const actual = await collectSvgVisualBoxData(polyfilled.page);
  await polyfilled.page.close();
  await polyfilled.browser.close();

  expectSvgVisualBoxMatch(expected, actual, FIREFOX_POLYFILL_TOLERANCE, 'Firefox forced polyfill');
});

test('SVG visual boxes match Firefox native in Chromium with the polyfill', async () => {
  const native = await openPage(firefox, false);
  const expected = await collectSvgVisualBoxData(native.page);
  await native.page.close();
  await native.browser.close();

  const polyfilled = await openPage(chromium, true);
  const actual = await collectSvgVisualBoxData(polyfilled.page);
  await polyfilled.page.close();
  await polyfilled.browser.close();

  expectSvgVisualBoxMatch(expected, actual, CHROMIUM_TO_FIREFOX_TOLERANCE, 'Chromium polyfill');
});
