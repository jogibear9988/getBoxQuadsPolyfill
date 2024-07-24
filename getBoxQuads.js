//todo:

//transform-box  https://developer.mozilla.org/en-US/docs/Web/CSS/transform-box
//transform-style https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style
//perspective
//perspective-origin

export function addPolyfill() {
    if (!Element.prototype.getBoxQuads) {
        //@ts-ignore
        Element.prototype.getBoxQuads = function (options) {
            return getBoxQuads(this, options)
        }
    }

    if (!Element.prototype.convertQuadFromNode) {
        //@ts-ignore
        Element.prototype.convertQuadFromNode = function (quad, from, options) {
            return convertQuadFromNode(this, quad, from, options)
        }
    }

    if (!Element.prototype.convertRectFromNode) {
        //@ts-ignore
        Element.prototype.convertRectFromNode = function (rect, from, options) {
            return convertRectFromNode(this, rect, from, options)
        }
    }

    if (!Element.prototype.convertPointFromNode) {
        //@ts-ignore
        Element.prototype.convertPointFromNode = function (point, from, options) {
            return convertPointFromNode(this, point, from, options)
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
    const m1 = getResultingTransformationBetweenElementAndAllAncestors(from, document.body);
    const m2 = getResultingTransformationBetweenElementAndAllAncestors(element, document.body).inverse();
    if (options?.fromBox && options?.fromBox !== 'border') {
        quad = new DOMQuad(transformPointBox(quad.p1, options.fromBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(quad.p2, options.fromBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(quad.p3, options.fromBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(quad.p4, options.fromBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1))
    }
    let res = new DOMQuad(m2.transformPoint(m1.transformPoint(quad.p1)), m2.transformPoint(m1.transformPoint(quad.p2)), m2.transformPoint(m1.transformPoint(quad.p3)), m2.transformPoint(m1.transformPoint(quad.p4)));
    if (options?.toBox && options?.toBox !== 'border') {
        res = new DOMQuad(transformPointBox(res.p1, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(res.p2, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(res.p3, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(res.p4, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1))
    }
    return res;

}

/**
* @param {Element} element
* @param {DOMRectReadOnly} rect
* @param {Element} from
* @param {{fromBox: 'margin'|'border'|'padding'|'content',toBox: 'margin'|'border'|'padding'|'content'}=} options
* @returns {DOMQuad}
*/
export function convertRectFromNode(element, rect, from, options) {
    const m1 = getResultingTransformationBetweenElementAndAllAncestors(from, document.body);
    const m2 = getResultingTransformationBetweenElementAndAllAncestors(element, document.body).inverse();
    if (options?.fromBox && options?.fromBox !== 'border') {
        const p = transformPointBox(new DOMPoint(rect.x, rect.y), options.fromBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(from), 1);
        rect = new DOMRect(p.x, p.y, rect.width, rect.height);
    }
    let res = new DOMQuad(m2.transformPoint(m1.transformPoint(new DOMPoint(rect.x, rect.y))), m2.transformPoint(m1.transformPoint(new DOMPoint(rect.x + rect.width, rect.y))), m2.transformPoint(m1.transformPoint(new DOMPoint(rect.x + rect.width, rect.y + rect.height))), m2.transformPoint(m1.transformPoint(new DOMPoint(rect.x, rect.y + rect.height))));
    if (options?.toBox && options?.toBox !== 'border') {
        res = new DOMQuad(transformPointBox(res.p1, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(res.p2, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(res.p3, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1), transformPointBox(res.p4, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1))
    }
    return res;
}

/**
* @param {Element} element
* @param {DOMPointInit} point
* @param {Element} from
* @param {{fromBox: 'margin'|'border'|'padding'|'content',toBox: 'margin'|'border'|'padding'|'content'}=} options
* @returns {DOMPoint}
*/
export function convertPointFromNode(element, point, from, options) {
    const m1 = getResultingTransformationBetweenElementAndAllAncestors(from, document.body);
    const m2 = getResultingTransformationBetweenElementAndAllAncestors(element, document.body).inverse();
    if (options?.fromBox && options?.fromBox !== 'border') {
        point = transformPointBox(point, options.fromBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(from), 1);
    }
    let res = m2.transformPoint(m1.transformPoint(point));
    if (options?.toBox && options?.toBox !== 'border') {
        res = transformPointBox(res, options.toBox, (element.ownerDocument.defaultView ?? window).getComputedStyle(element), -1);
    }
    return res;
}

/**
* @param {DOMPointInit} point
* @param {'margin'|'border'|'padding'|'content'} box
* @param {CSSStyleDeclaration} style
* @param {number} operator
* @returns {DOMPoint}
*/
function transformPointBox(point, box, style, operator) {
    if (box === 'margin') {
        return new DOMPoint(point.x - operator * parseFloat(style.marginLeft), point.y - operator * parseFloat(style.marginTop));
    } else if (box === 'padding') {
        return new DOMPoint(point.x + operator * parseFloat(style.borderLeftWidth), point.y + operator * parseFloat(style.borderTopWidth));
    } else if (box === 'content') {
        return new DOMPoint(point.x + operator * (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)), point.y + operator * (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)));
    }
    //@ts-ignore
    return point;
}

/**
* @param {Element} element
* @param {{box: 'margin'|'border'|'padding'|'content', relativeTo: Element, offset: DOMQuad}=} options
* @returns {DOMQuad[]}
*/
export function getBoxQuads(element, options) {

    let { width, height } = getElementSize(element);
    /** @type {DOMMatrix} */
    let originalElementAndAllParentsMultipliedMatrix = getResultingTransformationBetweenElementAndAllAncestors(element, options?.relativeTo ?? document.body);

    let arr = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    /** @type { [DOMPoint, DOMPoint, DOMPoint, DOMPoint] } */
    //@ts-ignore
    const points = Array(4);

    /** @type {{x: number, y:number}[] } */
    let o = null;
    if (options?.box === 'margin') {
        const cs = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
        o = [{ x: parseFloat(cs.marginLeft), y: parseFloat(cs.marginTop) }, { x: -parseFloat(cs.marginRight), y: parseFloat(cs.marginTop) }, { x: -parseFloat(cs.marginRight), y: -parseFloat(cs.marginBottom) }, { x: parseFloat(cs.marginLeft), y: -parseFloat(cs.marginBottom) }];
    } else if (options?.box === 'padding') {
        const cs = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
        o = [{ x: -parseFloat(cs.borderLeftWidth), y: -parseFloat(cs.borderTopWidth) }, { x: parseFloat(cs.borderRightWidth), y: -parseFloat(cs.borderTopWidth) }, { x: parseFloat(cs.borderRightWidth), y: parseFloat(cs.borderBottomWidth) }, { x: -parseFloat(cs.borderLeftWidth), y: parseFloat(cs.borderBottomWidth) }];
    } else if (options?.box === 'content') {
        const cs = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
        o = [{ x: -parseFloat(cs.borderLeftWidth) - parseFloat(cs.paddingLeft), y: -parseFloat(cs.borderTopWidth) - parseFloat(cs.paddingTop) }, { x: parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight), y: -parseFloat(cs.borderTopWidth) - parseFloat(cs.paddingTop) }, { x: parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight), y: parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom) }, { x: -parseFloat(cs.borderLeftWidth) - parseFloat(cs.paddingLeft), y: parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom) }];
    }
    if (options?.offset) {
        if (!o)
            o = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
        o[0].x = o[0].x + options.offset.p1.x;
        o[0].y = o[0].y + options.offset.p1.y;
        o[1].x = o[1].x + options.offset.p2.x;
        o[1].y = o[1].y + options.offset.p2.y;
        o[2].x = o[2].x + options.offset.p3.x;
        o[2].y = o[2].y + options.offset.p3.y;
        o[3].x = o[3].x + options.offset.p4.x;
        o[3].y = o[3].y + options.offset.p4.y;
    }

    for (let i = 0; i < 4; i++) {
        /** @type { DOMPoint } */
        let p;
        if (!o)
            p = new DOMPoint(arr[i].x, arr[i].y);
        else
            p = new DOMPoint(arr[i].x - o[i].x, arr[i].y - o[i].y);

        points[i] = projectPoint(p, originalElementAndAllParentsMultipliedMatrix).matrixTransform(originalElementAndAllParentsMultipliedMatrix);
        points[i] = as2DPoint(points[i]);
    }

    return [new DOMQuad(points[0], points[1], points[2], points[3])];
}


//todo: https://drafts.csswg.org/css-transforms-2/#accumulated-3d-transformation-matrix-computation
// also good for writing a spec

// Find a value for z that will transform to 0. (from firefox matrix.h)
// or chromium https://github.com/chromium/chromium/blob/main/ui/gfx/geometry/transform.cc#L849
/**
* @param {DOMPoint} point
*/
function projectPoint(point, m) {
    const z = -(point.x * m.m13 + point.y * m.m23 + m.m43) / m.m33;
    return new DOMPoint(point.x, point.y, z, 1);
}

/**
* convert a DOM-Point to 2D 
* @param {DOMPoint} point
*/
function as2DPoint(point) {
    return new DOMPoint(
        point.x / point.w,
        point.y / point.w
    );
}

/**
* @param {Element} element
*/
function getElementSize(element) {
    let width = 0;
    let height = 0;
    if (element instanceof (element.ownerDocument.defaultView ?? window).HTMLElement) {
        width = element.offsetWidth;
        height = element.offsetHeight;
    } else if (element instanceof (element.ownerDocument.defaultView ?? window).SVGSVGElement) {
        width = element.width.baseVal.value
        height = element.height.baseVal.value
    } else if (element instanceof (element.ownerDocument.defaultView ?? window).SVGGraphicsElement) {
        let bbox = element.getBBox()
        width = bbox.width;
        height = bbox.height;
    } else if (element instanceof (element.ownerDocument.defaultView ?? window).MathMLElement) {
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
    if (element instanceof (element.ownerDocument.defaultView ?? window).HTMLElement) {
        return new DOMPoint(element.offsetLeft, element.offsetTop);
    } else {
        if (element instanceof (element.ownerDocument.defaultView ?? window).SVGGraphicsElement && !(element instanceof (element.ownerDocument.defaultView ?? window).SVGSVGElement)) {
            const bb = element.getBBox();
            return new DOMPoint(bb.x, bb.y);
        }

        const cs = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
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
    let perspectiveParentElement = getParentElementIncludingSlots(actualElement);
    if (perspectiveParentElement) {
        let s = (actualElement.ownerDocument.defaultView ?? window).getComputedStyle(perspectiveParentElement);
        if (s.transformStyle !== 'preserve-3d') {
            projectTo2D(originalElementAndAllParentsMultipliedMatrix);
        }
    }

    while (actualElement != ancestor && actualElement != null) {
        const offsets = getElementOffsetsInContainer(actualElement);
        const mvMat = new DOMMatrix().translate(offsets.x, offsets.y);
        originalElementAndAllParentsMultipliedMatrix = mvMat.multiply(originalElementAndAllParentsMultipliedMatrix);

        const parentElement = getParentElementIncludingSlots(actualElement);
        if (parentElement) {
            parentElementMatrix = getElementCombinedTransform(parentElement);

            if (parentElement != ancestor)
                originalElementAndAllParentsMultipliedMatrix = parentElementMatrix.multiply(originalElementAndAllParentsMultipliedMatrix);

            perspectiveParentElement = getParentElementIncludingSlots(parentElement);
            if (perspectiveParentElement) {
                const s = (perspectiveParentElement.ownerDocument.defaultView ?? window).getComputedStyle(perspectiveParentElement);
                if (s.transformStyle !== 'preserve-3d') {
                    projectTo2D(originalElementAndAllParentsMultipliedMatrix);
                }
            }

            if (parentElement === ancestor)
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
        if (element.parentNode instanceof (element.ownerDocument.defaultView ?? window).ShadowRoot) {
            return element.parentNode.host;
        }
    }
    return element.parentElement;
}

/**
* @param {Element} element
*/
export function getElementCombinedTransform(element) {
    //https://www.w3.org/TR/css-transforms-2/#ctm
    let s = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);

    let m = new DOMMatrix();
    const origin = s.transformOrigin.split(' ');
    const originX = parseFloat(origin[0]);
    const originY = parseFloat(origin[1]);
    const originZ = origin[2] ? parseFloat(origin[2]) : 0;

    const mOri = new DOMMatrix().translate(originX, originY, originZ);
    const mOriInv = new DOMMatrix().translate(-originX, -originY, -originZ);

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

    let res = mOri.multiply(m.multiply(mOriInv));

    //@ts-ignore
    const pt = getElementPerspectiveTransform(element);
    if (pt != null) {
        res = pt.multiply(res);
    }
    return res;
}

/**
* project a DOM-Matrix to 2D (from firefox matrix.h)
* @param {DOMMatrix} m
*/
function projectTo2D(m) {
    m.m31 = 0.0;
    m.m32 = 0.0;
    m.m13 = 0.0;
    m.m23 = 0.0;
    m.m33 = 1.0;
    m.m43 = 0.0;
    m.m34 = 0.0;
    // Some matrices, such as those derived from perspective transforms,
    // can modify _44 from 1, while leaving the rest of the fourth column
    // (_14, _24) at 0. In this case, after resetting the third row and
    // third column above, the value of _44 functions only to scale the
    // coordinate transform divide by W. The matrix can be converted to
    // a true 2D matrix by normalizing out the scaling effect of _44 on
    // the remaining components ahead of time.
    if (m.m14 == 0.0 && m.m24 == 0.0 && m.m44 != 1.0 && m.m44 != 0.0) {
        const scale = 1.0 / m.m44;
        m.m11 *= scale;
        m.m12 *= scale;
        m.m21 *= scale;
        m.m22 *= scale;
        m.m41 *= scale;
        m.m42 *= scale;
        m.m44 = 1.0;
    }
}

/**
* @param {HTMLElement} element
*/
function getElementPerspectiveTransform(element) {
    /** @type { Element } */
    //@ts-ignore
    const perspectiveNode = getParentElementIncludingSlots(element);
    //https://drafts.csswg.org/css-transforms-2/#perspective-matrix-computation
    let s = (element.ownerDocument.defaultView ?? window).getComputedStyle(perspectiveNode);
    if (s.perspective !== 'none') {
        let m = new DOMMatrix();
        let p = parseFloat(s.perspective);
        m.m34 = -1.0 / p;
        //https://drafts.csswg.org/css-transforms-2/#PerspectiveDefined
        const origin = s.perspectiveOrigin.split(' ');
        const originX = parseFloat(origin[0]) - element.offsetLeft;
        const originY = parseFloat(origin[1]) - element.offsetTop;

        const mOri = new DOMMatrix().translate(originX, originY);
        const mOriInv = new DOMMatrix().translate(-originX, -originY);

        return mOri.multiply(m.multiply(mOriInv));
    }
    return null;
}