import { addPolyfill, clearCache, useCache } from './getBoxQuads.js';

const nativeAvailableBeforePolyfill = typeof Node !== 'undefined'
    && typeof Node.prototype.getBoxQuads === 'function';

addPolyfill(window);

const overlay = document.getElementById('demo-overlay');
const demoStage = document.getElementById('demo-stage');
const target = document.getElementById('demo-target');
const rotationInput = document.getElementById('rotation');
const skewInput = document.getElementById('skew');
const boxSelect = document.getElementById('box-select');
const rotationValue = document.getElementById('rotation-value');
const skewValue = document.getElementById('skew-value');
const runtimeStatus = document.getElementById('runtime-status');
const polyfillMode = document.getElementById('polyfill-mode');
const quadCount = document.getElementById('quad-count');
const firstPoint = document.getElementById('first-point');
const quadOutput = document.getElementById('quad-output');
const toggleCacheButton = document.getElementById('toggle-cache');

let cacheEnabled = false;

runtimeStatus.textContent = 'Interactive demo ready';
polyfillMode.textContent = nativeAvailableBeforePolyfill ? 'Native API detected' : 'Polyfill active';

toggleCacheButton.addEventListener('click', () => {
    cacheEnabled = !cacheEnabled;
    if (cacheEnabled) {
        useCache();
        toggleCacheButton.textContent = 'Disable cache';
    } else {
        clearCache();
        toggleCacheButton.textContent = 'Enable cache';
    }
    renderQuad();
});

rotationInput.addEventListener('input', renderQuad);
skewInput.addEventListener('input', renderQuad);
boxSelect.addEventListener('change', renderQuad);
window.addEventListener('resize', renderQuad);

function updateTransform() {
    const rotation = Number(rotationInput.value);
    const skew = Number(skewInput.value);

    rotationValue.textContent = `${rotation}deg`;
    skewValue.textContent = `${skew}deg`;
    target.style.transform = `rotate(${rotation}deg) skewX(${skew}deg)`;
}

function renderQuad() {
    updateTransform();
    if (!overlay || !target || !demoStage) {
        return;
    }

    const quads = target.getBoxQuads({
        box: boxSelect.value,
        relativeTo: demoStage,
    });

    quadCount.textContent = String(quads.length);

    if (!quads.length) {
        overlay.innerHTML = '';
        quadOutput.textContent = '[]';
        firstPoint.textContent = '-';
        return;
    }

    const [quad] = quads;
    const points = [quad.p1, quad.p2, quad.p3, quad.p4];
    const pointText = points
        .map((point, index) => `p${index + 1}: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`)
        .join('\n');

    firstPoint.textContent = `${quad.p1.x.toFixed(1)}, ${quad.p1.y.toFixed(1)}`;
    quadOutput.textContent = pointText;

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));

    const circles = points.map((point) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(point.x));
        circle.setAttribute('cy', String(point.y));
        circle.setAttribute('r', '5');
        return circle;
    });

    overlay.setAttribute('viewBox', `0 0 ${demoStage.clientWidth} ${demoStage.clientHeight}`);
    overlay.replaceChildren(polygon, ...circles);
}

renderQuad();