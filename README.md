# getBoxQuadsPolyfill
a polyfill for the getBoxQuads API

# install

    npm i get-box-quads-polyfill

# usage

## add polyfill

    import { addPolyfill } from "get-box-quads-polyfill";
    addPolyfill(window);

now you can use the Api on objects derived from "Node" :

    document.body.getBoxQuads(...)

# api

following API's are supported:

    convertQuadFromNode(quad: DOMQuadInit, from: Element, options?: { fromBox: 'margin' | 'border' | 'padding' | 'content', toBox: 'margin' | 'border' | 'padding' | 'content', iframes?: HTMLIFrameElement[] })
    convertRectFromNode(rect: DOMRectReadOnly, from: Element, options?: { fromBox: 'margin' | 'border' | 'padding' | 'content', toBox: 'margin' | 'border' | 'padding' | 'content', iframes?: HTMLIFrameElement[] })
    convertPointFromNode(point: DOMPoint, from: Element, options?: { fromBox: 'margin' | 'border' | 'padding' | 'content', toBox: 'margin' | 'border' | 'padding' | 'content', iframes?: HTMLIFrameElement[] })
    getBoxQuads(element: Element, options?: { box: 'margin' | 'border' | 'padding' | 'content', relativeTo: Element, iframes?: HTMLIFrameElement[] })


    getElementSize(node: Node) -> cause of missing offsetWidth in other node types

the API do have a non standard parameter "iframes", in wich you can hand over iframe objects in wich your elments are embeded in. This is not needed in the browser native API, but in the polyfill, the element inside of an iframe could not access it's container.

additionaly there are:

    useCache();
    clearCache();

wich are not needed with native boxQuadsApi, but in JS the calculations could take time, so we maybe need to cache them. But you need to manually clear the cache if you need refreshed values.

# info
gets the 4 transformed corner points of an Elment in DOM. Works only for HTMLElements. 
Limited support for SVG and MathML, cause of missing offsetLeft & offsetTop-Properties on SVGElement and MathMLElement
(see issue: https://github.com/w3c/csswg-drafts/issues/10514)

spec:
https://www.w3.org/TR/cssom-view-1/#the-geometryutils-interface
https://drafts.csswg.org/cssom-view/#dom-geometryutils-getboxquads


FF has a native implementation impl:
https://bugzilla.mozilla.org/show_bug.cgi?id=918189
https://bugzilla.mozilla.org/show_bug.cgi?id=1107559

more info about api:
https://lists.w3.org/Archives/Public/www-style/2013Aug/0609.html

# TODO's: getBoxQuads API spec

- getElementCombinedTransform (or a similar named API) should also be included. this could be needed for example to draw a transformed rect.
- the getBoxQuads API should have the offset Property of this polyfill also (cause for example you may want to use getBoxQuads to get a point to draw a overlay wich is offset a little bit)
- extend the spec with the 3D part of the polyfill
