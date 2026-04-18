import { readFileSync } from 'fs';
import { resolve } from 'path';
import { test, chromium, firefox, expect } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const POLYFILL_SOURCE = readFileSync(resolve(ROOT, 'getBoxQuads.js'), 'utf8').replace(/^export\s+/gm, '');
const TARGET_URL = 'https://node-projects.github.io/web-component-designer-demo/index.html';
const TARGET_CASES = [
    {
        name: 'dialog outer div',
        path: '/html/body/node-projects-app-shell//div/dock-spawn-ts/node-projects-document-container//div/node-projects-designer-tab-control//div',
    },
    {
        name: 'designer view host',
        path: '/html/body/node-projects-app-shell//div/dock-spawn-ts/node-projects-document-container//div/node-projects-designer-tab-control/div[1]/node-projects-designer-view',
    },
];

async function injectPolyfill(page) {
    await page.addScriptTag({
        content: `${POLYFILL_SOURCE}\n;globalThis.__getBoxQuadsPolyfillInjected = true;\naddPolyfill(window, true);`,
    });
    await page.waitForFunction(() => typeof Node.prototype.getBoxQuads === 'function');
}

async function waitForTarget(page, fullXPath) {
    await page.waitForFunction((fullXPath) => {
        function parseXPathStep(step) {
            const match = step.match(/^([a-zA-Z*][a-zA-Z0-9:_-]*)(?:\[(\d+)\])?$/);
            if (!match) {
                return null;
            }
            return {
                tagName: match[1].toLowerCase(),
                index: match[2] ? Number(match[2]) : 1,
            };
        }

        function getChildElements(node) {
            return Array.from(node.children ?? []);
        }

        try {
            const shadowParts = fullXPath.split('//');
            let currentRoot = document;
            let currentElement = null;

            for (let partIndex = 0; partIndex < shadowParts.length; partIndex++) {
                const steps = shadowParts[partIndex].split('/').filter(Boolean);
                if (!steps.length) {
                    continue;
                }

                if (partIndex > 0) {
                    if (!currentElement?.shadowRoot) {
                        return false;
                    }
                    currentRoot = currentElement.shadowRoot;
                }

                for (const step of steps) {
                    const parsed = parseXPathStep(step);
                    if (!parsed) {
                        return false;
                    }
                    const matches = getChildElements(currentRoot).filter((element) => parsed.tagName === '*' || element.localName === parsed.tagName);
                    currentElement = matches[parsed.index - 1] ?? null;
                    if (!currentElement) {
                        return false;
                    }
                    currentRoot = currentElement;
                }
            }

            return !!currentElement;
        } catch {
            return false;
        }
    }, fullXPath, { timeout: 30000 });
}

async function getTargetInfo(page, fullXPath) {
    return page.evaluate((fullXPath) => {
        function parseXPathStep(step) {
            const match = step.match(/^([a-zA-Z*][a-zA-Z0-9:_-]*)(?:\[(\d+)\])?$/);
            if (!match) {
                throw new Error(`Unsupported full XPath step: ${step}`);
            }
            return {
                tagName: match[1].toLowerCase(),
                index: match[2] ? Number(match[2]) : 1,
            };
        }

        function getChildElements(node) {
            return Array.from(node.children ?? []);
        }

        function resolveFullXPath(path) {
            const shadowParts = path.split('//');
            let currentRoot = document;
            let currentElement = null;

            for (let partIndex = 0; partIndex < shadowParts.length; partIndex++) {
                const steps = shadowParts[partIndex].split('/').filter(Boolean);
                if (!steps.length) {
                    continue;
                }

                if (partIndex > 0) {
                    if (!currentElement?.shadowRoot) {
                        throw new Error(`Missing open shadow root while resolving ${path}`);
                    }
                    currentRoot = currentElement.shadowRoot;
                }

                for (const step of steps) {
                    const { tagName, index } = parseXPathStep(step);
                    const matches = getChildElements(currentRoot).filter((element) => tagName === '*' || element.localName === tagName);
                    currentElement = matches[index - 1] ?? null;
                    if (!currentElement) {
                        throw new Error(`Full XPath step not found: ${step}`);
                    }
                    currentRoot = currentElement;
                }
            }

            return currentElement;
        }

        const element = resolveFullXPath(fullXPath);
        const rect = element.getBoundingClientRect();
        const quad = element.getBoxQuads({ relativeTo: document.body })[0];
        return {
            tagName: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            quad: {
                p1: { x: quad.p1.x, y: quad.p1.y },
                p2: { x: quad.p2.x, y: quad.p2.y },
                p3: { x: quad.p3.x, y: quad.p3.y },
                p4: { x: quad.p4.x, y: quad.p4.y },
            },
        };
    }, fullXPath);
}

for (const targetCase of TARGET_CASES) {
    test(`external shadow-dom target matches Firefox native quads: ${targetCase.name}`, async () => {
        const firefoxBrowser = await firefox.launch({
            firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
        });
        const firefoxPage = await (await firefoxBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        await firefoxPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
        await firefoxPage.waitForTimeout(5000);
        await waitForTarget(firefoxPage, targetCase.path);
        const firefoxInfo = await getTargetInfo(firefoxPage, targetCase.path);
        await firefoxBrowser.close();

        const chromiumBrowser = await chromium.launch();
        const chromiumPage = await (await chromiumBrowser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true, ignoreHTTPSErrors: true })).newPage();
        await chromiumPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
        await chromiumPage.waitForTimeout(5000);
        await waitForTarget(chromiumPage, targetCase.path);
        await injectPolyfill(chromiumPage);
        const chromiumInfo = await getTargetInfo(chromiumPage, targetCase.path);
        await chromiumBrowser.close();

        expect(chromiumInfo.tagName).toBe(firefoxInfo.tagName);
        expect(chromiumInfo.className).toBe(firefoxInfo.className);
        expect(Math.abs(chromiumInfo.quad.p1.x - firefoxInfo.quad.p1.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(chromiumInfo.quad.p1.y - firefoxInfo.quad.p1.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(chromiumInfo.quad.p2.x - firefoxInfo.quad.p2.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(chromiumInfo.quad.p2.y - firefoxInfo.quad.p2.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(chromiumInfo.quad.p3.x - firefoxInfo.quad.p3.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(chromiumInfo.quad.p3.y - firefoxInfo.quad.p3.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(chromiumInfo.quad.p4.x - firefoxInfo.quad.p4.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(chromiumInfo.quad.p4.y - firefoxInfo.quad.p4.y)).toBeLessThanOrEqual(1);
    });
}