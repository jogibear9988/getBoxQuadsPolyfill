import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { expect, test } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const POLYFILL_SOURCE = readFileSync(resolve(ROOT, 'getBoxQuads.js'), 'utf8').replace(/^export\s+/gm, '');

async function injectPolyfill(page) {
    await page.addScriptTag({
        content: `${POLYFILL_SOURCE}\n;globalThis.__getBoxQuadsPolyfillInjected = true;\naddPolyfill(window, true);`,
    });
    await page.waitForFunction(() => typeof Node.prototype.getBoxQuads === 'function');
}

test.describe('getBoxQuads performance', () => {
    test.use({ viewport: { width: 1680, height: 1200 } });

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

            function runMixedPass() {
                const start = performance.now();
                let quadCount = 0;
                for (const target of targets) {
                    quadCount += target.getBoxQuads({ box: 'border', relativeTo }).length;
                }
                for (const currentTextNode of textNodes) {
                    quadCount += currentTextNode.getBoxQuads({ relativeTo }).length;
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
            outputPath,
        }, null, 2));
    });
});