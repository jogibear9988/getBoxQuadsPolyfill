import { test, expect, chromium, firefox } from '@playwright/test';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, extname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

let server;
let baseURL;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const fp = resolve(ROOT, req.url.slice(1) || 'index.html');
    try {
      const data = readFileSync(fp);
      res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => server?.close());

function getMaxQuadDelta(expected, actual) {
  let maxDelta = 0;
  for (let i = 0; i < expected.length; i++) {
    for (const point of ['p1', 'p2', 'p3', 'p4']) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs(expected[i][point].x - actual[i][point].x),
        Math.abs(expected[i][point].y - actual[i][point].y),
      );
    }
  }
  return maxDelta;
}

async function collectQuads(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const button = document.querySelector('button');
    const aaaaButtons = [...document.querySelectorAll('button')].filter(candidate => candidate.textContent.trim() === 'aaaa');

    const serializeQuads = quads => quads.map(quad => ({
      p1: { x: quad.p1.x, y: quad.p1.y },
      p2: { x: quad.p2.x, y: quad.p2.y },
      p3: { x: quad.p3.x, y: quad.p3.y },
      p4: { x: quad.p4.x, y: quad.p4.y },
    }));
    const serializeButton = candidate => ({
      offsets: {
        left: candidate.offsetLeft,
        top: candidate.offsetTop,
        width: candidate.offsetWidth,
        height: candidate.offsetHeight,
      },
      rect: (() => {
        const rect = candidate.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })(),
      root: serializeQuads(candidate.getBoxQuads({ box: 'border', relativeTo: root })),
      body: serializeQuads(candidate.getBoxQuads({ box: 'border', relativeTo: document.body })),
    });

    return {
      buttonRoot: serializeQuads(button.getBoxQuads({ box: 'border', relativeTo: root })),
      buttonBody: serializeQuads(button.getBoxQuads({ box: 'border', relativeTo: document.body })),
      zoomButtons: aaaaButtons.map(serializeButton),
    };
  });
}

async function openFirefoxPage(browser, forcePolyfill = false) {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 500 } })).newPage();
  await page.goto(`${baseURL}/i8.html`);
  await page.waitForLoadState('networkidle');
  if (forcePolyfill) {
    await page.evaluate(async () => {
      const module = await import('/getBoxQuads.js');
      module.addPolyfill(window, true);
    });
  }
  return page;
}

test('i8 zoom matches Firefox native element quads', async () => {
  const ffBrowser = await firefox.launch({
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  });
  const ffPage = await (await ffBrowser.newContext({ viewport: { width: 900, height: 500 } })).newPage();
  await ffPage.goto(`${baseURL}/i8.html`);
  await ffPage.waitForLoadState('networkidle');
  const expected = await collectQuads(ffPage);
  await ffBrowser.close();

  const crBrowser = await chromium.launch();
  const crPage = await (await crBrowser.newContext({ viewport: { width: 900, height: 500 } })).newPage();
  await crPage.goto(`${baseURL}/i8.html`);
  await crPage.waitForLoadState('networkidle');
  const actual = await collectQuads(crPage);
  await crBrowser.close();

  // Default button text layout differs across engines under zoom, so this
  // regression checks the stable border-box geometry only.
  for (const key of ['buttonRoot', 'buttonBody']) {
    expect(actual[key], `${key} should exist in Chromium`).toBeTruthy();
    expect(
      actual[key].length,
      `${key} quad count should match Firefox\nFirefox: ${JSON.stringify(expected[key])}\nChromium: ${JSON.stringify(actual[key])}`,
    ).toBe(expected[key].length);
    expect(
      getMaxQuadDelta(expected[key], actual[key]),
      `${key} should match Firefox native under CSS zoom\nFirefox: ${JSON.stringify(expected[key])}\nChromium: ${JSON.stringify(actual[key])}`,
    ).toBeLessThan(0.75);
  }
});

test('i8 zoom matches Firefox native when the polyfill is forced in Firefox', async () => {
  const ffBrowser = await firefox.launch({
    firefoxUserPrefs: {
      'layout.css.getBoxQuads.enabled': true,
    },
  });

  const nativePage = await openFirefoxPage(ffBrowser, false);
  const expected = await collectQuads(nativePage);
  await nativePage.close();

  const polyfillPage = await openFirefoxPage(ffBrowser, true);
  const actual = await collectQuads(polyfillPage);
  await polyfillPage.close();
  await ffBrowser.close();

  for (const key of ['buttonRoot', 'buttonBody']) {
    expect(getMaxQuadDelta(expected[key], actual[key]), `${key} should match native in Firefox`).toBeLessThan(0.75);
  }

  for (let index = 0; index < expected.zoomButtons.length; index++) {
    const nativeButton = expected.zoomButtons[index];
    const polyfilledButton = actual.zoomButtons[index];
    for (const key of ['root', 'body']) {
      expect(
        getMaxQuadDelta(nativeButton[key], polyfilledButton[key]),
        `Firefox forced polyfill zoomButtons[${index}].${key} should match native\nFirefox native button: ${JSON.stringify(nativeButton)}\nFirefox polyfilled button: ${JSON.stringify(polyfilledButton)}`,
      ).toBeLessThan(0.75);
    }
  }
});
