import { test, expect, chromium, firefox } from '@playwright/test';

const TARGET_XPATH = '/html/body/div[3]/div/div[3]/main/div[3]/div[3]/div[2]/section[2]/p[1]/i[3]';
const FIREFOX_POLYFILL_TOLERANCE = 0.25;
const CHROMIUM_TO_FIREFOX_TOLERANCE = 2;

async function collectTargetData(page) {
  return page.evaluate((xpath) => {
    const target = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!target) {
      return null;
    }

    const childNodes = Array.from(target.childNodes).map((node) => ({
      type: node.nodeType,
      text: node.textContent,
      name: node.nodeName,
    }));

    const textNodes = Array.from(target.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
      .map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects()).map((rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }));
        const boundingRect = range.getBoundingClientRect();
        const quads = node.getBoxQuads().map((quad) => ({
          p1: { x: quad.p1.x, y: quad.p1.y },
          p2: { x: quad.p2.x, y: quad.p2.y },
          p3: { x: quad.p3.x, y: quad.p3.y },
          p4: { x: quad.p4.x, y: quad.p4.y },
        }));
        return {
          text: node.textContent,
          rects,
          boundingRect: {
            x: boundingRect.x,
            y: boundingRect.y,
            width: boundingRect.width,
            height: boundingRect.height,
          },
          quads,
        };
      });

    return {
      outerHTML: target.outerHTML,
      childNodes,
      textNodes,
    };
  }, TARGET_XPATH);
}

async function openFirefoxPage(browser, forcePolyfill = false) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 2000 } })).newPage();
  await page.goto('/i12.html');
  await page.waitForLoadState('networkidle');
  if (forcePolyfill) {
    await page.evaluate(async () => {
      const module = await import('/getBoxQuads.js');
      module.addPolyfill(window, true);
    });
  }
  return page;
}

async function openChromiumPage(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 2000 } })).newPage();
  await page.goto('/i12.html');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const module = await import('/getBoxQuads.js');
    module.addPolyfill(window, true);
  });
  return page;
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

test('i12 target text nodes match Firefox native when polyfill is forced', async () => {
  const browser = await firefox.launch({
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  });

  const nativePage = await openFirefoxPage(browser, false);
  const expected = await collectTargetData(nativePage);
  await nativePage.close();

  const polyfillPage = await openFirefoxPage(browser, true);
  const actual = await collectTargetData(polyfillPage);
  await polyfillPage.close();
  await browser.close();

  expect(expected, 'target element should exist in Firefox native run').toBeTruthy();
  expect(actual, 'target element should exist in Firefox polyfill run').toBeTruthy();

  expect(actual.outerHTML).toBe(expected.outerHTML);
  expect(actual.childNodes).toEqual(expected.childNodes);
  expect(actual.textNodes.length).toBe(expected.textNodes.length);

  for (let index = 0; index < expected.textNodes.length; index++) {
    const expectedNode = expected.textNodes[index];
    const actualNode = actual.textNodes[index];

    expect(actualNode.text).toBe(expectedNode.text);
    expect(actualNode.quads.length).toBe(expectedNode.quads.length);

    for (let quadIndex = 0; quadIndex < expectedNode.quads.length; quadIndex++) {
      const delta = getMaxQuadDelta(expectedNode.quads[quadIndex], actualNode.quads[quadIndex]);
      expect(
        delta,
        `text node ${index} quad ${quadIndex} should match Firefox native\nExpected: ${JSON.stringify(expectedNode)}\nActual: ${JSON.stringify(actualNode)}`,
      ).toBeLessThan(FIREFOX_POLYFILL_TOLERANCE);
    }
  }
});

test('i12 target text nodes match Firefox native in Chromium with the polyfill', async () => {
  const firefoxBrowser = await firefox.launch({
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  });
  const nativePage = await openFirefoxPage(firefoxBrowser, false);
  const expected = await collectTargetData(nativePage);
  await nativePage.close();
  await firefoxBrowser.close();

  const chromiumBrowser = await chromium.launch();
  const polyfillPage = await openChromiumPage(chromiumBrowser);
  const actual = await collectTargetData(polyfillPage);
  await polyfillPage.close();
  await chromiumBrowser.close();

  expect(expected, 'target element should exist in Firefox native run').toBeTruthy();
  expect(actual, 'target element should exist in Chromium polyfill run').toBeTruthy();

  expect(actual.outerHTML).toBe(expected.outerHTML);
  expect(actual.childNodes).toEqual(expected.childNodes);
  expect(actual.textNodes.length).toBe(expected.textNodes.length);

  for (let index = 0; index < expected.textNodes.length; index++) {
    const expectedNode = expected.textNodes[index];
    const actualNode = actual.textNodes[index];

    expect(actualNode.text).toBe(expectedNode.text);
    expect(actualNode.quads.length).toBe(expectedNode.quads.length);

    for (let quadIndex = 0; quadIndex < expectedNode.quads.length; quadIndex++) {
      const delta = getMaxQuadDelta(expectedNode.quads[quadIndex], actualNode.quads[quadIndex]);
      expect(
        delta,
        `text node ${index} quad ${quadIndex} should match Firefox native in Chromium\nExpected: ${JSON.stringify(expectedNode)}\nActual: ${JSON.stringify(actualNode)}`,
      ).toBeLessThan(CHROMIUM_TO_FIREFOX_TOLERANCE);
    }
  }
});