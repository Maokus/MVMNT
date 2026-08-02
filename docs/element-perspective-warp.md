# Element perspective warp

Element perspective warp is an opt-in, camera-based 3D tilt transform. It is enabled by the `elementPerspectiveWarp` feature flag, which defaults on and can still be overridden for a session or environment.

The Element inspector represents perspective through the standard schema-driven property controls: `perspectiveRotationX`, `perspectiveRotationY`, `perspectiveStrength`, pivot settings, and vanishing-point settings. Rotation accepts arbitrary finite degrees, allowing the element to tilt through multiple turns. An edge-on fallback is used only when the projected corners collapse, since an off-plane vanishing point can retain drawable area even at an odd quarter turn; the element's visibility is always preserved. Strength runs from 0 (orthographic foreshortening) to 100 (the strongest safe convergence).

By default, the host node pivot is also the 3D pivot. Disable `perspectivePivotLinked` to use `perspectivePivotX` and `perspectivePivotY` independently. `perspectiveVanishingPointX` and `perspectiveVanishingPointY` are normalized canvas coordinates rather than element coordinates, so multiple elements can be aligned to the same visual horizon. The inspector accepts off-canvas vanishing points from -2 through 3.

The projection operates on the element's real local width and height, normalized by its diagonal, rather than stretching a projected unit square. The local plane rotates around its pivot, projects toward the canvas vanishing point, and is then represented by the renderer's internal homography. All canonical properties can use constant, macro, or keyframe bindings.

The transform order is local child geometry around a fixed centered content origin, perspective homography, the remaining non-uniform scale/skew content transform, then the resolved host node and ancestor transforms. The perspective camera is recomputed after the host transform is resolved, so canvas-relative vanishing points and the linked node pivot remain correct under translation, rotation, scale, and grouping. Disabled and identity projections retain the ordinary Canvas 2D path. A non-identity projection is flattened into a pooled Canvas 2D source, projected by one renderer-owned WebGL compositor, and copied back into the final Canvas 2D frame in painter order. Numeric camera inputs are sanitized before projection; GPU failures retain the deterministic affine fallback.

The compositor exposes rolling diagnostics through `visualizer.getPerspectiveDiagnostics()` and the Perspective Warp section of the development overlay. CPU raster, GPU submission, GPU execution (when timer queries are supported), Canvas composite time, pixel/upload counts, allocation count, fallbacks, and context loss are reported separately.

Developer tooling can override the implementation for a session with:

```ts
enableFeatureForSession('elementPerspectiveWarp', false);
```

The inspector is the editing surface for perspective. Retired four-corner controls are no longer exposed.
