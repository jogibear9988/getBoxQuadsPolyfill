import { addPolyfill } from './getBoxQuads.js';

addPolyfill(window);

const heroFigure = document.getElementById('hero-geometry');
const heroElement = document.getElementById('hero-element');
const heroOverlay = document.getElementById('hero-quad-overlay');
const heroBoundingRect = document.getElementById('hero-bounding-rect');
const heroRotation = document.getElementById('hero-rotation');
const heroSkew = document.getElementById('hero-skew');
const heroTransformOutput = document.getElementById('hero-transform-output');

const selectionStage = document.getElementById('selection-demo-stage');
const canvas = document.getElementById('design-canvas');
const artboard = document.getElementById('artboard');
const card = document.getElementById('sample-card');
const selectionOverlay = document.getElementById('selection-overlay');
const coordinateOutput = document.getElementById('selection-coordinates');
const poseButtons = [...document.querySelectorAll('[data-pose]')];

const conversionFigure = document.getElementById('point-conversion');
const conversionWorkbench = document.getElementById('conversion-workbench');
const sourcePad = document.getElementById('source-pad');
const targetPad = document.getElementById('target-pad');
const sourceMarker = document.getElementById('source-marker');
const targetMarker = document.getElementById('target-marker');
const sourceReadout = document.getElementById('source-readout');
const targetReadout = document.getElementById('target-readout');
const conversionEquation = document.getElementById('conversion-equation');

let animationFrame = 0;
let selectedPoint = { x: 140, y: 110 };

function pointList(quad) {
    return [quad.p1, quad.p2, quad.p3, quad.p4];
}

function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function renderHeroQuad() {
    if (!heroFigure || !heroElement || !heroOverlay || !heroBoundingRect) {
        return;
    }

    const [quad] = heroElement.getBoxQuads({ box: 'border', relativeTo: heroFigure });
    if (!quad) {
        return;
    }

    const points = pointList(quad);
    const polygon = heroOverlay.querySelector('polygon');
    const labels = [...heroOverlay.querySelectorAll('.point')];
    const labelOffsets = [
        { x: -27, y: -10 },
        { x: 12, y: -7 },
        { x: 12, y: 6 },
        { x: -27, y: 25 },
    ];

    heroOverlay.setAttribute('viewBox', `0 0 ${heroFigure.clientWidth} ${heroFigure.clientHeight}`);
    polygon.setAttribute('points', points.map(({ x, y }) => `${x},${y}`).join(' '));

    points.forEach((point, index) => {
        const circle = labels[index].querySelector('circle');
        const text = labels[index].querySelector('text');
        circle.setAttribute('cx', String(point.x));
        circle.setAttribute('cy', String(point.y));
        text.setAttribute('x', String(point.x + labelOffsets[index].x));
        text.setAttribute('y', String(point.y + labelOffsets[index].y));
    });

    const figureRect = heroFigure.getBoundingClientRect();
    const elementRect = heroElement.getBoundingClientRect();
    heroBoundingRect.style.left = `${elementRect.left - figureRect.left}px`;
    heroBoundingRect.style.top = `${elementRect.top - figureRect.top}px`;
    heroBoundingRect.style.width = `${elementRect.width}px`;
    heroBoundingRect.style.height = `${elementRect.height}px`;
}

function updateHeroTransform() {
    const rotation = Number(/** @type {HTMLInputElement} */ (heroRotation).value);
    const skew = Number(/** @type {HTMLInputElement} */ (heroSkew).value);
    heroElement.style.setProperty('--hero-rotation', `${rotation}deg`);
    heroElement.style.setProperty('--hero-skew', `${skew}deg`);
    heroTransformOutput.textContent = `rotate ${rotation}° · skew ${skew}°`;
    renderHeroQuad();
}

function renderSelection() {
    if (!canvas || !card || !selectionOverlay) {
        return;
    }

    const [quad] = card.getBoxQuads({ box: 'border', relativeTo: canvas });
    if (!quad) {
        return;
    }

    const points = pointList(quad);
    const polygon = selectionOverlay.querySelector('polygon');
    const cornerHandles = [...selectionOverlay.querySelectorAll('.corner-handles circle')];
    const stem = selectionOverlay.querySelector('.rotation-stem');
    const rotationHandle = selectionOverlay.querySelector('.rotation-handle');
    const topCenter = midpoint(quad.p1, quad.p2);
    const center = midpoint(quad.p1, quad.p3);
    const direction = { x: topCenter.x - center.x, y: topCenter.y - center.y };
    const length = Math.hypot(direction.x, direction.y) || 1;
    const handle = {
        x: topCenter.x + direction.x / length * 34,
        y: topCenter.y + direction.y / length * 34,
    };

    selectionOverlay.setAttribute('viewBox', `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
    polygon.setAttribute('points', points.map(({ x, y }) => `${x},${y}`).join(' '));
    stem.setAttribute('x1', String(topCenter.x));
    stem.setAttribute('y1', String(topCenter.y));
    stem.setAttribute('x2', String(handle.x));
    stem.setAttribute('y2', String(handle.y));
    rotationHandle.setAttribute('cx', String(handle.x));
    rotationHandle.setAttribute('cy', String(handle.y));

    points.forEach((point, index) => {
        cornerHandles[index].setAttribute('cx', point.x);
        cornerHandles[index].setAttribute('cy', point.y);
    });

    coordinateOutput.textContent = `p1 ${quad.p1.x.toFixed(1)}, ${quad.p1.y.toFixed(1)}`;
}

function renderConvertedPoint() {
    if (!conversionWorkbench || !sourcePad || !targetPad || !sourceMarker || !targetMarker) {
        return;
    }

    const localPoint = new DOMPoint(selectedPoint.x, selectedPoint.y);
    const pointOnWorkbench = conversionWorkbench.convertPointFromNode(
        localPoint,
        targetPad,
    );

    sourceMarker.style.translate = `${localPoint.x}px ${localPoint.y}px`;
    targetMarker.style.translate = `${pointOnWorkbench.x}px ${pointOnWorkbench.y}px`;
    sourceReadout.textContent = `local x ${localPoint.x.toFixed(1)} · y ${localPoint.y.toFixed(1)}`;
    targetReadout.textContent = `workbench x ${pointOnWorkbench.x.toFixed(1)} · y ${pointOnWorkbench.y.toFixed(1)}`;
    conversionEquation.textContent = `local (${localPoint.x.toFixed(0)}, ${localPoint.y.toFixed(0)}) → workbench (${pointOnWorkbench.x.toFixed(0)}, ${pointOnWorkbench.y.toFixed(0)})`;
}

function renderDuringTransition(startTime = performance.now()) {
    renderSelection();
    if (performance.now() - startTime < 500) {
        animationFrame = requestAnimationFrame(() => renderDuringTransition(startTime));
    }
}

poseButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const pose = button.getAttribute('data-pose');
        poseButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        card.className = `sample-card pose-${pose}`;
        artboard.classList.toggle('pose-nested', pose === 'nested');
        cancelAnimationFrame(animationFrame);
        renderDuringTransition();
    });
});

heroRotation.addEventListener('input', updateHeroTransform);
heroSkew.addEventListener('input', updateHeroTransform);

sourcePad.addEventListener('click', (event) => {
    const rect = sourcePad.getBoundingClientRect();
    selectedPoint = event.detail === 0
        ? { x: sourcePad.clientWidth / 2, y: sourcePad.clientHeight / 2 }
        : {
            x: Math.max(0, Math.min(sourcePad.clientWidth, event.clientX - rect.left)),
            y: Math.max(0, Math.min(sourcePad.clientHeight, event.clientY - rect.top)),
        };
    renderConvertedPoint();
});

targetPad.addEventListener('click', (event) => {
    if (event.detail === 0) {
        selectedPoint = { x: targetPad.clientWidth / 2, y: targetPad.clientHeight / 2 };
    } else {
        const workbenchRect = conversionWorkbench.getBoundingClientRect();
        const clickOnWorkbench = new DOMPoint(
            event.clientX - workbenchRect.left,
            event.clientY - workbenchRect.top,
        );
        const localPoint = targetPad.convertPointFromNode(
            clickOnWorkbench,
            conversionWorkbench,
        );
        selectedPoint = {
            x: Math.max(0, Math.min(targetPad.clientWidth, localPoint.x)),
            y: Math.max(0, Math.min(targetPad.clientHeight, localPoint.y)),
        };
    }
    renderConvertedPoint();
});

const resizeObserver = new ResizeObserver(() => {
    renderHeroQuad();
    renderSelection();
    renderConvertedPoint();
});

if (selectionStage) {
    resizeObserver.observe(selectionStage);
}
if (heroFigure) {
    resizeObserver.observe(heroFigure);
}
if (conversionFigure) {
    resizeObserver.observe(conversionFigure);
}

window.addEventListener('load', () => {
    updateHeroTransform();
    renderSelection();
    renderConvertedPoint();
});
