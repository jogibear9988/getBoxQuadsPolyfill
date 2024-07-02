export { };

declare global {
    interface Element {
        convertQuadFromNode(quad: DOMQuadInit, from: Element, options?: { fromBox: 'margin' | 'border' | 'padding' | 'content', toBox: 'margin' | 'border' | 'padding' | 'content' })
        convertRectFromNode(rect: DOMRectReadOnly, from: Element, options?: { fromBox: 'margin' | 'border' | 'padding' | 'content', toBox: 'margin' | 'border' | 'padding' | 'content' })
        convertPointFromNode(point: DOMPoint, from: Element, options?: { fromBox: 'margin' | 'border' | 'padding' | 'content', toBox: 'margin' | 'border' | 'padding' | 'content' })
        getBoxQuads(element: Element, options?: { box: 'margin' | 'border' | 'padding' | 'content', relativeTo: Element })
    }
}