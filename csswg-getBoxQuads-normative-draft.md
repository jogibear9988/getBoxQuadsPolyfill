# Proposed Normative Wording For `getBoxQuads()`

This file is a tighter, more spec-shaped companion to `csswg-getBoxQuads-calculation.md`.
It is written as draft replacement text for the placeholder issue block in the CSSOM View `GeometryUtils` section.

This draft assumes two concrete resolutions to open questions in the current editor's draft:

1. If `options["relativeTo"]` is omitted, the default target is the node's `Document`, that is, viewport coordinates.
2. If the object on which the method was invoked and `options["relativeTo"]` are not in the same `Document`, then the method throws `WrongDocumentError`.

If CSSWG chooses different resolutions for either point, only the target-resolution steps need to change; the fragment and coordinate-conversion model can stay the same.

## Suggested replacement text

The `{{GeometryUtils/getBoxQuads(options)}}` method must run the following steps:

1. Let `object` be [=this=].
2. Let `document` be `object` if `object` is a {{Document}}, and otherwise `object`'s [=node document=].
3. Let `target` be `options["relativeTo"]` if it is present; otherwise `document`.
4. Let `targetDocument` be `target` if `target` is a {{Document}}, and otherwise `target`'s [=node document=].
5. If `targetDocument` is not `document`, then throw a `"WrongDocumentError"` {{DOMException}}.
6. Let `box` be `options["box"]`.
7. Let `fragments` be the result of running the steps to determine the box quad fragments for `object`.
8. Let `quads` be an empty [=sequence=] of {{DOMQuad}} objects.
9. For each `fragment` of `fragments`, in order:
10. Let `corners` be the result of running the steps to determine the requested box corners for `fragment` and `box`.
11. Let `p1` be the result of converting `corners[0]` from `object`'s local coordinate space to `target`'s coordinate space for `fragment`.
12. Let `p2` be the result of converting `corners[1]` from `object`'s local coordinate space to `target`'s coordinate space for `fragment`.
13. Let `p3` be the result of converting `corners[2]` from `object`'s local coordinate space to `target`'s coordinate space for `fragment`.
14. Let `p4` be the result of converting `corners[3]` from `object`'s local coordinate space to `target`'s coordinate space for `fragment`.
15. Append a new {{DOMQuad}} whose points are `p1`, `p2`, `p3`, and `p4` to `quads`.
16. Return `quads`.

## Fragment determination

To determine the box quad fragments for a `GeometryNode` `object`, run these steps:

1. If `object` is a {{Document}}, return a [=sequence=] containing one viewport fragment for `object`.
2. If `object` is a {{Text}} node and is not being rendered, return an empty [=sequence=].
3. If `object` is a {{Text}} node, return the rendered text fragments that would contribute rectangles, in content order, to `{{Range/getClientRects()}}` for a {{Range}} whose boundary points select exactly the contents of `object`.
4. If `object` is a {{CSSPseudoElement}}, return the generated fragments of `object`, in tree order.
5. If `object` does not have an associated [=box=], return an empty [=sequence=].
6. If `object` has an associated SVG layout box, return a [=sequence=] containing one fragment describing that SVG layout box.
7. Otherwise, return the same list of [=box fragments=] that `{{Element/getClientRects()}}` conceptually enumerates for `object` before transforms are applied, preserving content order and the same handling of captions and anonymous block boxes.

## Requested box corners

To determine the requested box corners for a `fragment` and a `box` of type `CSSBoxType`, run these steps:

1. Let `borderRect` be `fragment`'s border box in its local coordinate space.
2. Let `x` be `borderRect`'s x-coordinate.
3. Let `y` be `borderRect`'s y-coordinate.
4. Let `width` be `borderRect`'s width.
5. Let `height` be `borderRect`'s height.
6. If `fragment` is a text fragment or a viewport fragment, then return the four corners of `borderRect` in physical top-left, top-right, bottom-right, bottom-left order.
7. Let `marginTop`, `marginRight`, `marginBottom`, and `marginLeft` be the used margin widths for `fragment`.
8. Let `borderTop`, `borderRight`, `borderBottom`, and `borderLeft` be the used border widths for `fragment`.
9. Let `paddingTop`, `paddingRight`, `paddingBottom`, and `paddingLeft` be the used padding widths for `fragment`.
10. If `box` is `"margin"`, then return the following points in order:
11. `x - marginLeft`, `y - marginTop`
12. `x + width + marginRight`, `y - marginTop`
13. `x + width + marginRight`, `y + height + marginBottom`
14. `x - marginLeft`, `y + height + marginBottom`
15. If `box` is `"border"`, then return the four corners of `borderRect` in physical top-left, top-right, bottom-right, bottom-left order.
16. If `box` is `"padding"`, then return the following points in order:
17. `x + borderLeft`, `y + borderTop`
18. `x + width - borderRight`, `y + borderTop`
19. `x + width - borderRight`, `y + height - borderBottom`
20. `x + borderLeft`, `y + height - borderBottom`
21. Return the following points in order:
22. `x + borderLeft + paddingLeft`, `y + borderTop + paddingTop`
23. `x + width - borderRight - paddingRight`, `y + borderTop + paddingTop`
24. `x + width - borderRight - paddingRight`, `y + height - borderBottom - paddingBottom`
25. `x + borderLeft + paddingLeft`, `y + height - borderBottom - paddingBottom`

The four returned points are always ordered by their physical sides: top-left, top-right, bottom-right, and bottom-left. This ordering does not vary with writing mode or bidi direction.

## Coordinate conversion

To convert a point `point` from a fragment of `object` into the coordinate space of `target`, run these steps:

1. Let `matrix` be the identity transform.
2. Let `current` be `object`.
3. While `current` is not `target`:
4. Let `next` be the result of determining the next ancestor space for `current` while converting toward `target`.
5. Prepend to `matrix` the local transform that applies to `current` and its descendants.
6. Prepend to `matrix` the layout translation that maps `current`'s local origin into `next`'s coordinate space.
7. If `current` contributes a scrolling offset that affects descendant geometry, prepend that scrolling translation to `matrix`.
8. Set `current` to `next`.
9. If `target` contributes a scrolling offset in its own coordinate space, prepend the inverse of that scrolling translation to `matrix`.
10. Let `result` be the result of transforming `point` by `matrix`.
11. If `result` is 2D, return a new {{DOMPoint}} with `result`'s x-coordinate and y-coordinate.
12. Otherwise, flatten `result` to the 2D plane in the same way that CSSOM View geometry is flattened for `{{Element/getClientRects()}}` and `{{Element/getBoundingClientRect()}}`, and return the resulting {{DOMPoint}}.

## Next ancestor space

To determine the next ancestor space for `current` while converting toward `target`, run these steps:

1. If `current` is a fixed-position box and no ancestor between `current` and `target` establishes a fixed-position containing block, return `current`'s `Document`.
2. If `current` is a fixed-position box and an ancestor between `current` and `target` establishes a fixed-position containing block, return the nearest such ancestor.
3. If `current` participates in the [=flat tree=] through slot assignment, return the appropriate [=flat tree=] parent.
4. If `current`'s parent is a shadow root, return that shadow root's host.
5. Otherwise, return `current`'s parent in the [=flat tree=].

## Local transforms and layout translations

For the purposes of the steps above:

1. The local transform that applies to `current` and its descendants includes any used transform from CSS Transforms, the individual transform properties, `transform-origin`, perspective that applies from the parent, effective CSS `zoom`, and any other transform-like effect that changes the coordinates of descendant geometry.
2. The layout translation that maps `current`'s local origin into `next`'s coordinate space is the translation contributed by layout, positioning, and SVG local origins, ignoring transforms.
3. Scrolling translations are measured in CSS pixels in the scrolling box's own coordinate space.
4. The target's own local transform is not applied, because the return value is expressed in the target's coordinate space rather than in the coordinate space of the target's parent.

## Document and text behavior

For `{{Document}}` objects, all four box keywords map to the same viewport rectangle.

For `{{Text}}` nodes, all four box keywords map to the same rendered text fragment rectangles.

## Notes for editors

The normative text above is intentionally limited to `{{GeometryUtils/getBoxQuads(options)}}`.
If adopted, `{{GeometryUtils/convertQuadFromNode()}}`, `{{GeometryUtils/convertRectFromNode()}}`, and `{{GeometryUtils/convertPointFromNode()}}` can reuse the same box-corner and coordinate-conversion helpers.

The only intentionally unresolved editorial choice in this file is how much of the helper text should remain inline versus being factored into separate named algorithms.