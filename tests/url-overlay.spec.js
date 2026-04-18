import { mkdirSync, readFileSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { test, chromium, firefox } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const POLYFILL_SOURCE = readFileSync(resolve(ROOT, 'getBoxQuads.js'), 'utf8').replace(/^export\s+/gm, '');

function parseNumber(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a finite number, got: ${raw}`);
    }
    return parsed;
}

function parseBoolean(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    return /^(1|true|yes|on)$/i.test(raw);
}

function sanitizeFilePart(value) {
    return value
        .replace(/^https?:\/\//i, '')
        .replace(/^file:\/\//i, 'file-')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'target';
}

function getConfig() {
    const targetUrl = process.env.TARGET_URL ?? '';
    const mode = process.env.TARGET_MODE ?? 'elements';
    const rawQuery = process.env.TARGET_QUERY ?? 'div';
    const fullXPath = process.env.TARGET_FULL_X_PATH ?? (rawQuery.startsWith('/') ? rawQuery : '');
    if (mode !== 'elements' && mode !== 'text') {
        throw new Error(`TARGET_MODE must be "elements" or "text", got: ${mode}`);
    }

    const outputPath = process.env.OUTPUT_PATH
        ? resolve(ROOT, process.env.OUTPUT_PATH)
        : resolve(ROOT, 'test-results', `url-overlay-${sanitizeFilePart(targetUrl || 'missing-url')}-${mode}.png`);

    return {
        targetUrl,
        mode,
        query: fullXPath ? '' : rawQuery,
        fullXPath,
        rootSelector: process.env.TARGET_ROOT_SELECTOR ?? 'body',
        relativeToSelector: process.env.RELATIVE_TO_SELECTOR ?? 'body',
        includeSvg: parseBoolean('TARGET_INCLUDE_SVG', false),
        includeShadowRoots: parseBoolean('TARGET_INCLUDE_SHADOW_ROOTS', true),
        waitForSelector: process.env.WAIT_FOR_SELECTOR ?? '',
        waitMs: parseNumber('WAIT_MS', 1000),
        viewportWidth: parseNumber('VIEWPORT_WIDTH', 1440),
        viewportHeight: parseNumber('VIEWPORT_HEIGHT', 900),
        fullPage: parseBoolean('FULL_PAGE', true),
        box: process.env.TARGET_BOX ?? 'border',
        stroke: process.env.OVERLAY_STROKE ?? 'red',
        fill: process.env.OVERLAY_FILL ?? 'transparent',
        strokeWidth: parseNumber('OVERLAY_STROKE_WIDTH', 1),
        outputPath,
    };
}

async function injectPolyfill(page) {
    await page.addScriptTag({
        content: `${POLYFILL_SOURCE}\n;globalThis.__getBoxQuadsPolyfillInjected = true;\naddPolyfill(window, true);`,
    });
    await page.waitForFunction(() => typeof Node.prototype.getBoxQuads === 'function');
}

function getBrowserOutputPath(outputPath, browserName) {
    const extension = extname(outputPath);
    if (!extension) {
        return `${outputPath}-${browserName}`;
    }

    return `${outputPath.slice(0, -extension.length)}-${browserName}${extension}`;
}

async function drawOverlay(page, config) {
    return page.evaluate((cfg) => {
        const svgNs = 'http://www.w3.org/2000/svg';
        const overlayId = '__getBoxQuadsOverlay';
        document.getElementById(overlayId)?.remove();

        const root = document.querySelector(cfg.rootSelector);
        if (!root) {
            throw new Error(`TARGET_ROOT_SELECTOR not found: ${cfg.rootSelector}`);
        }

        const relativeTo = document.querySelector(cfg.relativeToSelector);
        if (!relativeTo) {
            throw new Error(`RELATIVE_TO_SELECTOR not found: ${cfg.relativeToSelector}`);
        }

        const overlay = document.createElementNS(svgNs, 'svg');
        overlay.setAttribute('id', overlayId);
        overlay.style.position = 'absolute';
        overlay.style.left = '0px';
        overlay.style.top = '0px';
        overlay.style.overflow = 'visible';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '2147483647';
        overlay.setAttribute('width', String(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)));
        overlay.setAttribute('height', String(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)));
        document.body.appendChild(overlay);

        let targetCount = 0;
        let quadCount = 0;

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
                    if (!currentElement) {
                        throw new Error(`Cannot enter shadow root before resolving a host in full XPath: ${path}`);
                    }
                    if (!currentElement.shadowRoot) {
                        throw new Error(`Open shadow root not found while resolving full XPath at <${currentElement.tagName.toLowerCase()}>`);
                    }
                    currentRoot = currentElement.shadowRoot;
                }

                for (const step of steps) {
                    const { tagName, index } = parseXPathStep(step);
                    const matches = getChildElements(currentRoot).filter(element => tagName === '*' || element.localName === tagName);
                    currentElement = matches[index - 1] ?? null;
                    if (!currentElement) {
                        throw new Error(`Full XPath step not found: ${step} in ${path}`);
                    }
                    currentRoot = currentElement;
                }
            }

            if (!currentElement) {
                throw new Error(`Full XPath did not resolve to an element: ${path}`);
            }

            return currentElement;
        }

        function getTraversalRoots(startRoot) {
            const roots = [startRoot];
            if (!cfg.includeShadowRoots) {
                return roots;
            }

            if (startRoot instanceof Element && startRoot.shadowRoot) {
                roots.push(...getTraversalRoots(startRoot.shadowRoot));
            }

            for (const element of startRoot.querySelectorAll('*')) {
                if (element.shadowRoot) {
                    roots.push(...getTraversalRoots(element.shadowRoot));
                }
            }

            return roots;
        }

        function getTextNodes(startRoot) {
            const nodes = [];

            for (const currentRoot of getTraversalRoots(startRoot)) {
                const iter = document.createNodeIterator(currentRoot, NodeFilter.SHOW_TEXT, {
                    acceptNode(node) {
                        //@ts-ignore
                        return node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    },
                });
                let node;
                while ((node = iter.nextNode())) {
                    nodes.push(node);
                }
            }

            return nodes;
        }

        function getElements(startRoot) {
            const elements = [];

            for (const currentRoot of getTraversalRoots(startRoot)) {
                elements.push(...currentRoot.querySelectorAll(cfg.query));
            }

            return elements;
        }

        function addQuad(quad, label) {
            const path = document.createElementNS(svgNs, 'path');
            const d = 'M' + [quad.p1, quad.p2, quad.p3, quad.p4].map(point => `${point.x},${point.y}`).join(' ') + 'Z';
            path.setAttribute('d', d);
            path.setAttribute('stroke', cfg.stroke);
            path.setAttribute('fill', cfg.fill);
            path.setAttribute('stroke-width', String(cfg.strokeWidth));
            if (label) path.setAttribute('data-target', label);
            overlay.appendChild(path);
            quadCount++;
        }

        if (cfg.mode === 'text') {
            const selectionRoot = cfg.fullXPath ? resolveFullXPath(cfg.fullXPath) : root;
            for (const node of getTextNodes(selectionRoot)) {
                const quads = node.getBoxQuads({ box: cfg.box, relativeTo });
                if (!quads.length) continue;
                targetCount++;
                for (const quad of quads) {
                    addQuad(quad, node.parentElement?.tagName ?? '#text');
                }
            }
        } else {
            const elements = (cfg.fullXPath ? [resolveFullXPath(cfg.fullXPath)] : getElements(root))
                .filter(element => cfg.includeSvg || element.namespaceURI !== svgNs);
            for (const element of elements) {
                const quads = element.getBoxQuads({ box: cfg.box, relativeTo });
                if (!quads.length) continue;
                targetCount++;
                const label = element.id ? `#${element.id}` : element.tagName;
                for (const quad of quads) {
                    addQuad(quad, label);
                }
            }
        }

        return {
            targetCount,
            quadCount,
            rootTag: root.tagName,
            relativeToTag: relativeTo.tagName,
        };
    }, config);
}

test('inject polyfill and render quads for an arbitrary URL', async () => {
    const config = process.env.TARGET_URL
        ? getConfig()
        : {
            targetUrl: 'https://node-projects.github.io/web-component-designer-demo/index.html',
            mode: 'elements',
            query: '*',
            fullXPath: '/html/body/node-projects-app-shell//div/dock-spawn-ts/node-projects-document-container//div/node-projects-designer-tab-control/div[1]/node-projects-designer-view//div/node-projects-designer-canvas//div/div[1]/div[2]/node-projects-overlay-layer-view//svg',
            rootSelector: 'body',
            relativeToSelector: 'body',
            includeSvg: true,
            includeShadowRoots: true,
            waitForSelector: '',
            waitMs: 5000,
            viewportWidth: 1440,
            viewportHeight: 900,
            fullPage: true,
            box: 'border',
            stroke: 'red',
            fill: 'transparent',
            strokeWidth: 1,
            outputPath: './test-results/output.png',
        };
    test.skip(!config.targetUrl, 'Set TARGET_URL plus optional TARGET_MODE / TARGET_QUERY env vars before running this harness.');
    mkdirSync(dirname(config.outputPath), { recursive: true });

    for (const browserSpec of [
        { name: 'chrome', browserType: chromium },
        {
            name: 'firefox',
            browserType: firefox,
            launchOptions: {
                firefoxUserPrefs: {
                    'layout.css.getBoxQuads.enabled': true,
                },
            },
        },
    ]) {
        const browser = await browserSpec.browserType.launch(browserSpec.launchOptions);
        try {
            const context = await browser.newContext({
                viewport: { width: config.viewportWidth, height: config.viewportHeight },
                bypassCSP: true,
                ignoreHTTPSErrors: true,
            });
            const page = await context.newPage();

            await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });
            if (config.waitForSelector) {
                await page.waitForSelector(config.waitForSelector);
            }
            if (config.waitMs > 0) {
                await page.waitForTimeout(config.waitMs);
            }

            if (browserSpec.name === 'chrome') {
                await injectPolyfill(page);
            } else {
                await page.waitForFunction(() => typeof Node.prototype.getBoxQuads === 'function');
            }

            const summary = await drawOverlay(page, config);
            const outputPath = getBrowserOutputPath(config.outputPath, browserSpec.name);
            await page.screenshot({ path: outputPath, fullPage: config.fullPage });

            console.log(`[${browserSpec.name}] Rendered ${summary.quadCount} quads across ${summary.targetCount} targets.`);
            console.log(`[${browserSpec.name}] Mode=${config.mode} root=${config.rootSelector} relativeTo=${config.relativeToSelector} shadowRoots=${config.includeShadowRoots}`);
            if (config.fullXPath) {
                console.log(`[${browserSpec.name}] FullXPath=${config.fullXPath}`);
            } else if (config.mode === 'elements') {
                console.log(`[${browserSpec.name}] Query=${config.query}`);
            }
            console.log(`[${browserSpec.name}] Screenshot written to ${outputPath}`);
        } finally {
            await browser.close();
        }
    }
});