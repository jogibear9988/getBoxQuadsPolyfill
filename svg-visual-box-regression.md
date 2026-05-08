# SVG visual-box regression

This regression covers SVG graphics whose native Firefox `getBoxQuads()` result is based on a local SVG visual box, including stroke bounds, transformed into the requested coordinate space.

The important cases are:

- a plain stroked SVG line
- a stroked SVG line inside a CSS-transformed HTML ancestor
- the same line patterns nested inside a `visu-tag-root-canvas`/nested-SVG structure
- a stroked SVG path whose visual bounds extend beyond its raw `getBBox()`
- a split-view style iframe where an SVG line is measured relative to a canvas element in the parent document without passing a custom `iframes` option

The polyfill must not use a viewport `getBoundingClientRect()` as the source quad for SVG graphics. That rectangle is already post-transform and loses orientation under CSS transforms. It must also not use raw `getBBox()` alone, because native Firefox includes stroke bounds for these SVG visual boxes.

For same-origin iframes, the polyfill should infer the iframe bridge from `node.ownerDocument.defaultView.frameElement` when `relativeTo` lives in a parent document. Native Firefox handles that document boundary without extra caller-provided options, and consumers such as designer split view rely on that behavior.
