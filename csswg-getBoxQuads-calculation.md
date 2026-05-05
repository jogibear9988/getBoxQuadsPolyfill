# Draft notes for specifying `getBoxQuads()`

This document is intended as input for the CSSOM View `GeometryUtils` section in `csswg-drafts`.
It describes a concrete calculation model for `getBoxQuads()` and separates that model from polyfill-specific behavior in this repository.

The current draft at https://drafts.csswg.org/cssom-view/#dom-geometryutils-getboxquads still contains an issue placeholder instead of an algorithm. The goal here is to turn the behavior into a step-by-step description that can be lifted into spec text.

## Summary

`getBoxQuads()` can be defined as a two-stage operation:

1. Determine one or more rectangular fragments for the requested node in the node's own local coordinate space.
2. Convert each fragment corner from that local space into the coordinate space of `relativeTo`, then flatten the result to 2D.

In other words, each returned `DOMQuad` is the requested local box for one fragment after applying layout offsets, scroll offsets, transforms, perspective, and zoom between the node and `relativeTo`.

## Proposed calculation model

### 1. Choose the coordinate spaces

Let `source space` be the local coordinate system of the node whose quads are being requested.

Let `target space` be the coordinate system of `options.relativeTo`.

The returned points are expressed in CSS pixels in `target space`.

The ancestor's own transform is not applied when the ancestor is `relativeTo`; the result is expressed in that ancestor's coordinate system, not in the coordinate system of its parent. However, the ancestor's current scroll position still affects the conversion because the result is relative to the ancestor's current scrolling area origin.

### 2. Enumerate fragments

The method should return one quad for each box fragment, in content order.

Suggested fragment sources:

1. If the node has no associated box, return an empty sequence.
2. If the node is an `Element` with CSS box fragments, use one fragment per box fragment of the element's principal box, as `getClientRects()` does.
3. If the node is a `Text` node, use one fragment per text fragment in the same order as `Range.getClientRects()` for a range covering the text node.
4. If the node has an SVG layout box, use the SVG bounding box for that layout box as the fragment rectangle before the CSSOM View coordinate conversion.
5. `Document` and `CSSPseudoElement` can reuse the same model once their fragment sources are defined.

For specification purposes, this is the important abstraction: `getBoxQuads()` operates on pre-transform fragments, not on already-axis-aligned viewport rectangles.

### 3. Build the requested local box for each fragment

For each fragment, first construct a rectangle in local coordinates.

Let the fragment's local border box rectangle have origin `(0, 0)` and size `(w, h)`.

Define points in physical corner order:

- `p1` = top-left
- `p2` = top-right
- `p3` = bottom-right
- `p4` = bottom-left

That physical ordering should stay fixed regardless of writing mode or bidi direction. This matches the long-standing issue note in the draft that `p1` should still be top-left even in RTL.

For the four CSS box types, the local rectangle is:

| box | local top-left | local top-right | local bottom-right | local bottom-left |
| --- | --- | --- | --- | --- |
| `border` | `(0, 0)` | `(w, 0)` | `(w, h)` | `(0, h)` |
| `padding` | `(bl, bt)` | `(w - br, bt)` | `(w - br, h - bb)` | `(bl, h - bb)` |
| `content` | `(bl + pl, bt + pt)` | `(w - br - pr, bt + pt)` | `(w - br - pr, h - bb - pb)` | `(bl + pl, h - bb - pb)` |
| `margin` | `(-ml, -mt)` | `(w + mr, -mt)` | `(w + mr, h + mb)` | `(-ml, h + mb)` |

Where:

- `bl`, `br`, `bt`, `bb` are the used border widths.
- `pl`, `pr`, `pt`, `pb` are the used padding widths.
- `ml`, `mr`, `mt`, `mb` are the used margin widths.

This is the simplest spec model because every box type is just an inset or outset of the fragment's border box before coordinate conversion.

### 4. Compute the accumulated conversion from the node to `relativeTo`

For each fragment point, compute an accumulated transform $M(node, relativeTo)$ from `source space` to `target space`.

Conceptually:

$$
q_i = \mathrm{flatten}\left(M(node, relativeTo) \cdot p_i\right)
$$

where `p_i` is one local corner point of the fragment and `q_i` is the returned point.

The accumulated transform should be built by walking the flat tree from the node toward `relativeTo` and prepending the operations that affect the node's descendants.

At each step, include the following in order:

1. The current node's own local transform.
2. The layout translation from the current node's local origin into its containing block or offset parent coordinate space.
3. The effect of the current node's scroll position when descendant coordinates are measured relative to its padding edge.
4. Any ancestor transform, perspective, or effective zoom that applies to descendants.

The flat-tree walk matters here, not just `parentElement`, because slot assignment and shadow hosts affect how descendant coordinates are exposed by other CSSOM View APIs such as `offsetParent`.

### 5. What belongs in the node's own local transform

The node's own local transform should include the transforms that apply to its descendants in normal rendering:

1. CSS `transform`.
2. The individual transform properties `translate`, `rotate`, and `scale`.
3. `transform-origin`.
4. Motion-path positioning such as `offset-path`, `offset-distance`, and `offset-rotate`, if the specification wants `getBoxQuads()` to match painted geometry.
5. Perspective supplied by the parent, because that affects how the node's local plane maps into ancestor space.
6. Effective CSS `zoom`, for the same reason that `getClientRects()` and `getBoundingClientRect()` are defined in scaled coordinates.

The important invariant is that `getBoxQuads()` should agree with the transformed geometry that authors already observe through `getClientRects()` and `getBoundingClientRect()`.

### 6. What belongs in the layout translation walk

The walk from the node to `relativeTo` needs to account for layout positioning that is not represented by CSS transform matrices.

That includes:

1. Offsets introduced by normal flow, relative positioning, absolute positioning, and table/caption offset behavior as reflected by CSSOM View offset metrics.
2. Scroll offsets of intermediate scroll containers.
3. Shadow DOM slotting and shadow-host boundaries, using flat-tree ancestry rather than light-DOM ancestry.
4. Fixed-position containing blocks.
5. SVG local origins when the SVG box origin is not `(0, 0)`.

The polyfill in this repository implements this with an ancestor walk that closely mirrors how `offsetParent`, `offsetLeft`, and `offsetTop` behave, then multiplies ancestor transforms on top.

### 7. Fixed and sticky positioning

`position: fixed` needs an explicit rule.

Suggested rule:

1. If a fixed-position box has no ancestor that establishes a fixed-position containing block, measure its layout translation relative to the viewport.
2. Otherwise, stop the layout walk at the nearest fixed-position containing block and continue from there.

This matches current CSS positioning behavior and avoids incorrectly inheriting layout offsets from unrelated ancestors.

`position: sticky` does not need a separate quad algorithm if the fragment geometry is taken after layout. Once the used fragment position is known, the regular layout-offset walk and transform accumulation already produce the correct result.

### 8. 3D transforms and flattening

The returned API surface is 2D, so the algorithm needs an explicit flattening rule.

The repository's polyfill uses the same overall model as `getClientRects()` and `getBoundingClientRect()`: the full 3D transform chain is accumulated, then the final points are flattened to the 2D plane.

One concrete way to specify this is:

1. If the accumulated transform is 2D, apply it directly.
2. Otherwise, for each local corner `(x, y)`, solve for a local `z` that lands on the output plane:

$$
z = -\frac{x m_{13} + y m_{23} + m_{43}}{m_{33}}
$$

3. Transform `(x, y, z, 1)` by the accumulated matrix.
4. Divide the transformed `x` and `y` by `w`.
5. Return the resulting 2D point and discard `z`.

This makes the spec explicit about a current open issue in the draft: returned points are flattened, and the exposed `DOMPoint`s are effectively 2D results.

### 9. Return value

Return a sequence of `DOMQuad`s, one for each fragment, in content order.

Each `DOMQuad` is built from the four transformed points of the requested local box for that fragment.

## Text nodes

For specification purposes, text should be defined in terms already used by the `Range` geometry algorithms.

Suggested model:

1. Let the fragment list for a text node be the same fragment list that `Range.getClientRects()` would expose for a range covering exactly that text node.
2. For each such fragment, define a local rectangle using the text metrics already used by the range geometry algorithms.
3. Convert each local rectangle through the same `M(node, relativeTo)` conversion used for element fragments.

That keeps the normative text simple and avoids defining `getBoxQuads()` in terms of post-transform viewport rectangles.

## Relation to `convertQuadFromNode()`, `convertRectFromNode()`, and `convertPointFromNode()`

Once the matrix model above exists, the coordinate-conversion methods become much simpler to specify.

1. Convert the input geometry from `from` node local space into the common ancestor space.
2. Convert from the common ancestor space into the destination node's local space.
3. Apply `fromBox` and `toBox` by adding or subtracting the same local box offsets used for `getBoxQuads()`.

In other words, the box-edge adjustment rules should be defined once and reused across all `GeometryUtils` methods.

## Polyfill-specific notes from this repository

The current implementation in this repository adds a few details that are useful for drafting but should not automatically become normative text.

1. It accepts a non-standard `iframes` option so same-origin iframe chains can be stitched together by script. Native behavior should instead be defined directly in the specification, or rejected with a clear same-document rule.
2. It handles Shadow DOM through flat-tree ancestry, assigned slots, and shadow hosts.
3. It includes effective CSS `zoom` in the matrix pipeline.
4. It includes perspective and preserves 3D until flattening is required.
5. It includes motion-path transforms.
6. It uses SVG `getCTM()` and `getBBox()` for SVG graphics elements.
7. It uses `offsetWidth` and `offsetHeight` for HTML element border-box size, `getBBox()` for SVG graphics elements, and range geometry for text.

Those choices are useful evidence about what an interoperable algorithm likely needs, but they should be separated from the normative core unless the CSSWG explicitly wants to standardize them here.

## Likely spec deltas still needed

The current CSSOM View draft still needs explicit resolutions for the following points.

1. Define the default value of `relativeTo`. The draft still has a placeholder comment saying `default document (i.e. viewport)`.
2. Define the corner ordering explicitly. A fixed physical order is easier to test than a logical-writing-mode order.
3. State whether cross-document conversion is forbidden, same-origin only, or fully defined across nested browsing contexts.
4. State what happens for degenerate transforms such as `scale(0)`.
5. State that results are flattened to 2D and that `z` is not meaningfully exposed.
6. Define the fragment source for `Document` and `CSSPseudoElement`.
7. Decide whether motion-path transforms belong in this API or whether the specification can simply say "all transforms that apply to the box".

## Short spec-shaped algorithm text

If CSSWG wants a shorter algorithm skeleton, the core could be phrased like this:

1. Let `fragments` be the list of fragments generated for the object on which the method was invoked, in content order.
2. If `fragments` is empty, return an empty sequence.
3. Let `target` be `options["relativeTo"]` if given; otherwise the default target defined by this specification.
4. Let `quads` be an empty sequence.
5. For each `fragment` in `fragments`:
6. Let `(w, h)` be the fragment's border-box size in the object's local coordinate space.
7. Let `(p1, p2, p3, p4)` be the four corners of the requested box type in physical top-left, top-right, bottom-right, bottom-left order.
8. Let `M` be the accumulated transform from the object's local coordinate space to `target`'s coordinate space, including layout translations, scroll offsets, transforms, perspective, and effective zoom that apply between the object and `target`, but excluding `target`'s own transform.
9. Transform each of `p1`, `p2`, `p3`, and `p4` by `M` and flatten the result to 2D.
10. Append a new `DOMQuad` built from those four transformed points to `quads`.
11. Return `quads`.

That skeleton is intentionally short. The real interoperability work is in defining `fragments`, the box-edge offsets, and the accumulated transform `M` precisely.