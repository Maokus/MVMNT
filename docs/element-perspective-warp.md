# Element perspective warp

Element perspective warp is an internal, opt-in planar corner-pin transform. It is guarded by the `elementPerspectiveWarp` session feature flag and currently has no product-facing property controls.

The hidden bindings are `warpEnabled` plus X/Y coordinates for `warpTopLeft`, `warpTopRight`, `warpBottomRight`, and `warpBottomLeft`. Coordinates are normalized to the element's local layout bounds and can use constant, macro, or keyframe bindings. Missing bindings resolve to the identity corners, so older scene files need no schema migration.

The transform order is local child geometry, perspective homography, then the existing anchor/scale/skew/rotation/position transform. Disabled and identity warps retain the ordinary Canvas 2D path. A non-identity valid warp is flattened into a pooled Canvas 2D source, projected by one renderer-owned WebGL compositor, and copied back into the final Canvas 2D frame in painter order. Invalid values and GPU failures retain the element by rendering its ordinary affine form.

The compositor exposes rolling diagnostics through `visualizer.getPerspectiveDiagnostics()` and the Perspective Warp section of the development overlay. CPU raster, GPU submission, GPU execution (when timer queries are supported), Canvas composite time, pixel/upload counts, allocation count, fallbacks, and context loss are reported separately.

Developer tooling can enable the implementation with:

```ts
enableFeatureForSession('elementPerspectiveWarp', true)
```

Programmatic editors enter or leave corner manipulation with `setWarpEditElement(elementId | null)` from the visualizer context/core. This produces four corner handles, uses projected polygon hit testing, preserves interior movement, applies point snapping, rejects invalid samples, and merges a drag into one undo entry.

