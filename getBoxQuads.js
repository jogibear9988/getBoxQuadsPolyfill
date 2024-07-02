export function addPolyfill() {
    if (!Element.prototype.getBoxQuads) {
        //@ts-ignore
        Element.prototype.getBoxQuads = function (options) {
            return getBoxQuads(this, options)
        }
    }
}

/**
* @param {Element} element
* @param {DOMQuadInit} quad
* @param {Element} from
* @param {{fromBox: 'margin'|'border'|'padding'|'content',toBox: 'margin'|'border'|'padding'|'content'}=} options
* @returns {DOMQuad}
*/
export function convertQuadFromNode(element, quad, from, options) {
    throw Error("not implemented");
}

/**
* @param {Element} element
* @param {DOMRectReadOnly} rect
* @param {Element} from
* @param {{fromBox: 'margin'|'border'|'padding'|'content',toBox: 'margin'|'border'|'padding'|'content'}=} options
* @returns {DOMQuad}
*/
export function convertRectFromNode(element, rect, from, options) {
    throw Error("not implemented");
}

/**
* @param {Element} element
* @param {DOMPointInit} point
* @param {Element} from
* @param {{fromBox: 'margin'|'border'|'padding'|'content',toBox: 'margin'|'border'|'padding'|'content'}=} options
* @returns {DOMPoint}
*/
export function convertPointFromNode(element, point, from, options) {
    throw Error("not implemented");
}

/**
* @param {Element} element
* @param {{box: 'margin'|'border'|'padding'|'content', relativeTo: Element}=} options
* @returns {DOMQuad[]}
*/
export function getBoxQuads(element, options) {

    let { width, height } = getElementSize(element);
    /** @type {DOMMatrix} */
    let originalElementAndAllParentsMultipliedMatrix = getResultingTransformationBetweenElementAndAllAncestors(element, options?.relativeTo ?? document.body);

    let arr = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }, { x: width, y: height }];
    /** @type { [DOMPoint, DOMPoint, DOMPoint, DOMPoint] } */
    //@ts-ignore
    const points = Array(4);

    /** @type {{x: number, y:number}[] } */
    let offset = null;
    if (options?.box === 'margin') {
        const cs = getComputedStyle(element);
        offset = [{ x: parseFloat(cs.marginLeft), y: parseFloat(cs.marginTop) }, { x: -parseFloat(cs.marginRight), y: parseFloat(cs.marginTop) }, { x: parseFloat(cs.marginLeft), y: -parseFloat(cs.marginBottom) }, { x: -parseFloat(cs.marginRight), y: -parseFloat(cs.marginBottom) }];
    } else if (options?.box === 'padding') {
        const cs = getComputedStyle(element);
        offset = [{ x: -parseFloat(cs.borderLeftWidth), y: -parseFloat(cs.borderTopWidth) }, { x: parseFloat(cs.borderRightWidth), y: -parseFloat(cs.borderTopWidth) }, { x: -parseFloat(cs.borderLeftWidth), y: parseFloat(cs.borderBottomWidth) }, { x: parseFloat(cs.borderRightWidth), y: parseFloat(cs.borderBottomWidth) }];
    } else if (options?.box === 'content') {
        const cs = getComputedStyle(element);
        offset = [{ x: -parseFloat(cs.borderLeftWidth) - parseFloat(cs.paddingLeft), y: -parseFloat(cs.borderTopWidth) - parseFloat(cs.paddingTop) }, { x: parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight), y: -parseFloat(cs.borderTopWidth) - parseFloat(cs.paddingTop) }, { x: -parseFloat(cs.borderLeftWidth) - parseFloat(cs.paddingLeft), y: parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom) }, { x: parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight), y: parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom) }];
    }
    for (let i = 0; i < 4; i++) {
        let p;
        if (!offset)
            p = new DOMPoint(arr[i].x, arr[i].y);
        else
            p = new DOMPoint(arr[i].x - offset[i].x, arr[i].y - offset[i].y);

        let pTransformed = p.matrixTransform(originalElementAndAllParentsMultipliedMatrix);
        points[i] = new DOMPoint(pTransformed.x, pTransformed.y);
    }
    return [new DOMQuad(points[0], points[1], points[3], points[2])];
}

/**
* @param {Element} element
*/
function getElementSize(element) {
    let width = 0;
    let height = 0;
    if (element instanceof HTMLElement) {
        width = element.offsetWidth;
        height = element.offsetHeight;
    } else if (element instanceof SVGSVGElement) {
        width = element.width.baseVal.value
        height = element.height.baseVal.value
    } else if (element instanceof SVGGraphicsElement) {
        let bbox = element.getBBox()
        width = bbox.width;
        height = bbox.height;
    } else if (element instanceof MathMLElement) {
        let bbox = element.getBoundingClientRect()
        width = bbox.width;
        height = bbox.height;
    }
    return { width, height }
}

/**
* @param {Element} element
*/
function getElementOffsetsInContainer(element) {
    if (element instanceof HTMLElement) {
        return new DOMPoint(element.offsetLeft, element.offsetTop);
    } else {
        if (element instanceof SVGGraphicsElement && !(element instanceof SVGSVGElement)) {
            const bb = element.getBBox();
            return new DOMPoint(bb.x, bb.y);
        }

        const cs = getComputedStyle(element);
        if (cs.position === 'absolute') {
            return new DOMPoint(parseFloat(cs.left), parseFloat(cs.top));
        }

        const r1 = element.getBoundingClientRect();
        const r2 = element.parentElement.getBoundingClientRect();
        return new DOMPoint(r1.x - r2.x, r1.y - r2.y);
    }
}

/**
* @param {Element} element
* @param {Element} ancestor
*/
function getResultingTransformationBetweenElementAndAllAncestors(element, ancestor) {
    let actualElement = element;
    /** @type {DOMMatrix } */
    let parentElementMatrix;
    /** @type {DOMMatrix } */
    let originalElementAndAllParentsMultipliedMatrix = getElementCombinedTransform(actualElement);

    while (actualElement != ancestor && actualElement != null) {
        const offsets = getElementOffsetsInContainer(actualElement);
        const mvMat = new DOMMatrix().translate(offsets.x, offsets.y);
        originalElementAndAllParentsMultipliedMatrix = mvMat.multiply(originalElementAndAllParentsMultipliedMatrix);

        const parentElement = getParentElementIncludingSlots(actualElement);
        if (parentElement) {
            parentElementMatrix = getElementCombinedTransform(parentElement);
            if (parentElement != ancestor) {
                originalElementAndAllParentsMultipliedMatrix = parentElementMatrix.multiply(originalElementAndAllParentsMultipliedMatrix);
            } else
                return originalElementAndAllParentsMultipliedMatrix;
        }
        actualElement = parentElement;
    }

    return originalElementAndAllParentsMultipliedMatrix;
}

/**
* @param {Element} element
* @returns {Element}
*/
function getParentElementIncludingSlots(element) {
    if (element.assignedSlot)
        return element.assignedSlot;
    if (element.parentElement == null) {
        if (element.parentNode instanceof ShadowRoot) {
            return element.parentNode.host;
        }
    }
    return element.parentElement;
}

/**
* @param {Element} element
*/
function getElementCombinedTransform(element) {
    //https://www.w3.org/TR/css-transforms-2/#ctm
    let s = getComputedStyle(element);

    let m = new DOMMatrix();
    const origin = s.transformOrigin.split(' ');
    const originX = parseFloat(origin[0]);
    const originY = parseFloat(origin[1]);

    //TODO: 3d?
    const mOri = new DOMMatrix().translate(originX, originY);
    const mOriInv = new DOMMatrix().translate(-originX, -originY);

    if (s.translate != 'none' && s.translate) {
        m = m.multiply(new DOMMatrix('translate(' + s.translate.replace(' ', ',') + ')'));
    }
    if (s.rotate != 'none' && s.rotate) {
        m = m.multiply(new DOMMatrix('rotate(' + s.rotate.replace(' ', ',') + ')'));
    }
    if (s.scale != 'none' && s.scale) {
        m = m.multiply(new DOMMatrix('scale(' + s.scale.replace(' ', ',') + ')'));
    }
    if (s.transform != 'none' && s.transform) {
        m = m.multiply(new DOMMatrix(s.transform));
    }
    return mOri.multiply(m.multiply(mOriInv));
}