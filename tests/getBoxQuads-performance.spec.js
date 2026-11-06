import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { chromium, expect, firefox, test } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const POLYFILL_SOURCE = readFileSync(resolve(ROOT, process.env.POLYFILL_SOURCE_PATH ?? 'getBoxQuads.js'), 'utf8').replace(/^export\s+/gm, '');

async function injectPolyfill(page) {
    await page.addScriptTag({
        content: `${POLYFILL_SOURCE}\n;globalThis.__getBoxQuadsPolyfillInjected = true;\naddPolyfill(window, true);`,
    });
    await page.waitForFunction(() => typeof Node.prototype.getBoxQuads === 'function');
}

async function collectSampleQuads(page, indices) {
    return page.evaluate((sampleIndices) => {
        const relativeTo = document.getElementById('benchmark-anchor');
        const targets = Array.from(document.querySelectorAll('[data-bench-target]'));

        return sampleIndices.map((index) => {
            const element = targets[index];
            const quad = element.getBoxQuads({ relativeTo })[0];
            return {
                index,
                p1: { x: quad.p1.x, y: quad.p1.y },
                p2: { x: quad.p2.x, y: quad.p2.y },
                p3: { x: quad.p3.x, y: quad.p3.y },
                p4: { x: quad.p4.x, y: quad.p4.y },
            };
        });
    }, indices);
}

test.describe('getBoxQuads performance', () => {
    test.use({ viewport: { width: 1680, height: 1200 } });

    test('compares uncached ancestor-relative calls with a baseline in alternating passes', async ({ browser }, testInfo) => {
        test.skip(!process.env.POLYFILL_BASELINE_PATH, 'Set POLYFILL_BASELINE_PATH to a saved polyfill source file.');
        const baselineSource = readFileSync(resolve(ROOT, process.env.POLYFILL_BASELINE_PATH), 'utf8').replace(/^export\s+/gm, '');
        const fixture = readFileSync(resolve(ROOT, 'perf.html'), 'utf8')
            .replace("getNumber('groups', 28", "getNumber('groups', 8")
            .replace("getNumber('items', 30", "getNumber('items', 10");
        const context = await browser.newContext({ viewport: { width: 1680, height: 1200 } });
        try {
            const baseline = await context.newPage();
            const candidate = await context.newPage();
            for (const { page, source } of [{ page: baseline, source: baselineSource }, { page: candidate, source: POLYFILL_SOURCE }]) {
                await page.setContent(fixture);
                await page.addScriptTag({ content: `${source}\naddPolyfill(window, true);` });
            }
            async function run(page, measureQuads = false) {
                return page.evaluate((measureQuads) => {
                    const relativeTo = document.getElementById('benchmark-anchor');
                    /** @type {Node[]} */
                    const targets = [...document.querySelectorAll('[data-bench-target]')];
                    const walk = document.createTreeWalker(document.getElementById('scene'), NodeFilter.SHOW_TEXT);
                    let node;
                    while ((node = walk.nextNode())) if (node.textContent.trim()) targets.push(node);
                    const points = [];
                    let quads = 0;
                    const start = performance.now();
                    for (const target of targets) {
                        const result = target.getBoxQuads({ relativeTo });
                        quads += result.length;
                        if (measureQuads) {
                            for (const quad of result) for (const point of [quad.p1, quad.p2, quad.p3, quad.p4]) points.push(point.x, point.y);
                        }
                    }
                    return { ms: performance.now() - start, calls: targets.length, quads, points };
                }, measureQuads);
            }
            const expected = await run(baseline, true);
            const actual = await run(candidate, true);
            expect(actual.points.length).toBe(expected.points.length);
            const maxDelta = Math.max(...actual.points.map((value, index) => Math.abs(value - expected.points[index])));
            expect(maxDelta).toBeLessThan(1e-5);

            const samples = { baseline: [], candidate: [] };
            for (let pass = 0; pass < 9; pass++) {
                const order = pass % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
                for (const name of order) {
                    const sample = await run(name === 'baseline' ? baseline : candidate);
                    expect(sample.quads).toBe(expected.quads);
                    if (pass >= 2) samples[name].push(sample.ms);
                }
            }
            const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
            const result = {
                callsPerPass: expected.calls,
                quadsPerPass: expected.quads,
                maxCoordinateDelta: maxDelta,
                baselineMedianMs: median(samples.baseline),
                candidateMedianMs: median(samples.candidate),
                speedup: median(samples.baseline) / median(samples.candidate),
                samplesMs: samples,
            };
            await testInfo.attach('ancestor-relative-comparison', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
            console.log(JSON.stringify(result, null, 2));
        } finally {
            await context.close();
        }
    });

    test('matches Firefox native quads relative to a transformed ancestor', async () => {
        test.slow();

        const fixtureUrl = '/perf.html?groups=8&items=8&depth=3';
        const sampleIndices = [0, 7, 19, 31];

        const firefoxBrowser = await firefox.launch({
            firefoxUserPrefs: { 'layout.css.getBoxQuads.enabled': true },
        });
        const firefoxPage = await firefoxBrowser.newPage({ viewport: { width: 1400, height: 1000 } });
        await firefoxPage.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
        await firefoxPage.waitForFunction(() => document.body.dataset.benchReady === 'true');
        const firefoxQuads = await collectSampleQuads(firefoxPage, sampleIndices);
        await firefoxBrowser.close();

        const chromiumBrowser = await chromium.launch();
        const chromiumPage = await chromiumBrowser.newPage({ viewport: { width: 1400, height: 1000 } });
        await chromiumPage.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
        await chromiumPage.waitForFunction(() => document.body.dataset.benchReady === 'true');
        await injectPolyfill(chromiumPage);
        const chromiumQuads = await collectSampleQuads(chromiumPage, sampleIndices);
        await chromiumBrowser.close();

        for (let index = 0; index < sampleIndices.length; index += 1) {
            for (const point of ['p1', 'p2', 'p3', 'p4']) {
                expect(Math.abs(chromiumQuads[index][point].x - firefoxQuads[index][point].x)).toBeLessThanOrEqual(1);
                expect(Math.abs(chromiumQuads[index][point].y - firefoxQuads[index][point].y)).toBeLessThanOrEqual(1);
            }
        }
    });

    test('measures polyfill cost on a rendered nested transformed scene', async ({ page, browserName }, testInfo) => {
        test.slow();

        await page.goto('/perf.html?groups=28&items=30&depth=4', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.dataset.benchReady === 'true');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await injectPolyfill(page);

        const metrics = await page.evaluate(() => {
            function summarize(samples, callsPerPass, quadsPerPass) {
                const ordered = [...samples].sort((left, right) => left - right);
                const totalMs = samples.reduce((sum, value) => sum + value, 0);
                const meanMs = totalMs / samples.length;
                const middle = Math.floor(ordered.length / 2);
                const medianMs = ordered.length % 2 === 0
                    ? (ordered[middle - 1] + ordered[middle]) / 2
                    : ordered[middle];
                const p90Index = Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.9) - 1);

                return {
                    samplesMs: samples,
                    sampleCount: samples.length,
                    minMs: ordered[0],
                    medianMs,
                    meanMs,
                    p90Ms: ordered[p90Index],
                    maxMs: ordered[ordered.length - 1],
                    totalMs,
                    callsPerPass,
                    quadsPerPass,
                    meanUsPerCall: (meanMs * 1000) / callsPerPass,
                    meanUsPerQuad: (meanMs * 1000) / quadsPerPass,
                };
            }

            const relativeTo = document.getElementById('benchmark-anchor');
            const scene = document.getElementById('scene');
            const targets = Array.from(scene.querySelectorAll('[data-bench-target]'));
            const textNodes = [];
            const iterator = document.createNodeIterator(scene, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                },
            });

            let textNode;
            while ((textNode = iterator.nextNode())) {
                textNodes.push(textNode);
            }

            const warmupPasses = 2;
            const measuredPasses = 7;

            function runElementPass() {
                const start = performance.now();
                let quadCount = 0;
                for (const target of targets) {
                    quadCount += target.getBoxQuads({ box: 'border', relativeTo }).length;
                }
                return { durationMs: performance.now() - start, quadCount };
            }

            /** @param {{box?: 'border', relativeTo?: Element}} options */
            function runMixedPass(options = { box: 'border', relativeTo }) {
                const start = performance.now();
                let quadCount = 0;
                for (const target of targets) {
                    quadCount += target.getBoxQuads(options).length;
                }
                for (const currentTextNode of textNodes) {
                    quadCount += currentTextNode.getBoxQuads(options).length;
                }
                return { durationMs: performance.now() - start, quadCount };
            }

            for (let index = 0; index < warmupPasses; index += 1) {
                runElementPass();
                runMixedPass();
            }

            const elementSamples = [];
            let elementQuadsPerPass = 0;
            for (let index = 0; index < measuredPasses; index += 1) {
                const result = runElementPass();
                elementSamples.push(result.durationMs);
                elementQuadsPerPass = result.quadCount;
            }

            const mixedSamples = [];
            let mixedQuadsPerPass = 0;
            for (let index = 0; index < measuredPasses; index += 1) {
                const result = runMixedPass();
                mixedSamples.push(result.durationMs);
                mixedQuadsPerPass = result.quadCount;
            }

            function measureMixed(runPass, prepare = () => {}) {
                for (let index = 0; index < warmupPasses; index += 1) {
                    prepare();
                    runPass();
                }
                const samples = [];
                let quadCount;
                for (let index = 0; index < measuredPasses; index += 1) {
                    prepare();
                    const result = runPass();
                    samples.push(result.durationMs);
                    quadCount = result.quadCount;
                }
                return summarize(samples, targets.length + textNodes.length, quadCount);
            }

            // layout2vector measures both elements and text in viewport space.
            const viewportMixed = measureMixed(() => runMixedPass({ box: 'border' }));
            // The designer explicitly caches, invalidating before each refresh.
            // @ts-ignore Injected polyfill API.
            useCache();
            // @ts-ignore Injected polyfill API.
            const cachedColdMixed = measureMixed(() => runMixedPass(), () => clearCache());
            const cachedWarmMixed = measureMixed(() => runMixedPass());

            return {
                browserNowOrigin: performance.timeOrigin,
                fixture: {
                    groups: Number(document.body.dataset.groups),
                    itemsPerGroup: Number(document.body.dataset.itemsPerGroup),
                    depth: Number(document.body.dataset.depth),
                    targetCount: targets.length,
                    textNodeCount: textNodes.length,
                },
                measurements: {
                    warmupPasses,
                    measuredPasses,
                    elementOnly: summarize(elementSamples, targets.length, elementQuadsPerPass),
                    mixedNodes: summarize(mixedSamples, targets.length + textNodes.length, mixedQuadsPerPass),
                    viewportMixed,
                    cachedColdMixed,
                    cachedWarmMixed,
                },
            };
        });

        expect(metrics.fixture.targetCount).toBeGreaterThan(800);
        expect(metrics.fixture.textNodeCount).toBeGreaterThan(metrics.fixture.targetCount);
        expect(metrics.measurements.elementOnly.meanMs).toBeGreaterThan(0);
        expect(metrics.measurements.mixedNodes.meanMs).toBeGreaterThan(metrics.measurements.elementOnly.meanMs);

        const artifact = {
            browserName,
            generatedAt: new Date().toISOString(),
            relativeFixtureUrl: '/perf.html?groups=28&items=30&depth=4',
            ...metrics,
        };

        const outputPath = testInfo.outputPath(`getBoxQuads-performance-${browserName}.json`);
        writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
        await testInfo.attach('getBoxQuads-performance', {
            body: JSON.stringify(artifact, null, 2),
            contentType: 'application/json',
        });

        console.log(`getBoxQuads benchmark (${browserName})`);
        console.log(JSON.stringify({
            fixture: artifact.fixture,
            elementOnly: {
                medianMs: artifact.measurements.elementOnly.medianMs,
                meanUsPerCall: artifact.measurements.elementOnly.meanUsPerCall,
            },
            mixedNodes: {
                medianMs: artifact.measurements.mixedNodes.medianMs,
                meanUsPerCall: artifact.measurements.mixedNodes.meanUsPerCall,
            },
            viewportMixedMedianMs: artifact.measurements.viewportMixed.medianMs,
            cachedColdMixedMedianMs: artifact.measurements.cachedColdMixed.medianMs,
            cachedWarmMixedMedianMs: artifact.measurements.cachedWarmMixed.medianMs,
            outputPath,
        }, null, 2));
    });
});
