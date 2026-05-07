import { test, expect, chromium, firefox } from '@playwright/test';

const FIREFOX_POLYFILL_TOLERANCE = 0.25;
const CHROMIUM_TO_FIREFOX_TOLERANCE = 2;

async function collectPathData(page) {
  return page.evaluate(() => {
    const host = document.querySelector('visu-tag-root-canvas');
    const path = host?.shadowRoot?.querySelector('path')
      ?? host?.querySelector('path')
      ?? document.querySelector('path');

    if (!path) {
      return null;
    }

    const quad = path.getBoxQuads({ box: 'border', relativeTo: document.body })[0];
    const bbox = path.getBBox();
    const rect = path.getBoundingClientRect();
    const ctm = path.getCTM();
    const ownerSvgRect = path.ownerSVGElement?.getBoundingClientRect();

    return {
      quad: quad ? {
        p1: { x: quad.p1.x, y: quad.p1.y },
        p2: { x: quad.p2.x, y: quad.p2.y },
        p3: { x: quad.p3.x, y: quad.p3.y },
        p4: { x: quad.p4.x, y: quad.p4.y },
      } : null,
      bbox: {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      },
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      ctm: ctm ? {
        a: ctm.a,
        b: ctm.b,
        c: ctm.c,
        d: ctm.d,
        e: ctm.e,
        f: ctm.f,
      } : null,
      ownerSvgRect: ownerSvgRect ? {
        x: ownerSvgRect.x,
        y: ownerSvgRect.y,
        width: ownerSvgRect.width,
        height: ownerSvgRect.height,
      } : null,
    };
  });
}

async function openFirefoxPage(forcePolyfill = false) {
  const browser = await firefox.launch({
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
  await page.goto('/i14.html');
  await page.waitForLoadState('networkidle');
  if (forcePolyfill) {
    await page.evaluate(async () => {
      const module = await import('/getBoxQuads.js');
      module.addPolyfill(window, true);
    });
  }
  return { browser, page };
}

async function openChromiumPage() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
  await page.goto('/i14.html');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const module = await import('/getBoxQuads.js');
    module.addPolyfill(window, true);
  });
  return { browser, page };
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

test('i14 path matches Firefox native when polyfill is forced in Firefox', async () => {
  const native = await openFirefoxPage(false);
  const expected = await collectPathData(native.page);
  await native.page.close();
  await native.browser.close();

  const polyfill = await openFirefoxPage(true);
  const actual = await collectPathData(polyfill.page);
  await polyfill.page.close();
  await polyfill.browser.close();

  expect(expected, 'path should exist in Firefox native run').toBeTruthy();
  expect(actual, 'path should exist in Firefox polyfill run').toBeTruthy();
  expect(actual.quad, 'polyfill should return a quad').toBeTruthy();

  const delta = getMaxQuadDelta(expected.quad, actual.quad);
  expect(
    delta,
    `Firefox polyfill quad should match Firefox native\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
  ).toBeLessThan(FIREFOX_POLYFILL_TOLERANCE);
});

test('i14 path matches Firefox native in Chromium with the polyfill', async () => {
  const native = await openFirefoxPage(false);
  const expected = await collectPathData(native.page);
  await native.page.close();
  await native.browser.close();

  const polyfill = await openChromiumPage();
  const actual = await collectPathData(polyfill.page);
  await polyfill.page.close();
  await polyfill.browser.close();

  expect(expected, 'path should exist in Firefox native run').toBeTruthy();
  expect(actual, 'path should exist in Chromium polyfill run').toBeTruthy();
  expect(actual.quad, 'polyfill should return a quad').toBeTruthy();

  const delta = getMaxQuadDelta(expected.quad, actual.quad);
  expect(
    delta,
    `Chromium polyfill quad should match Firefox native\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
  ).toBeLessThan(CHROMIUM_TO_FIREFOX_TOLERANCE);
});