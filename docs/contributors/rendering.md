# Rendering

## Frame resolution

`SceneRuntimeAdapter.resolveFrame()` is the shared source for preview rendering and editor geometry.
It indexes the scene graph by revision, evaluates visible elements once per frame, resolves host
node bindings parent-first, and returns ordered paint records with world transforms, opacity,
bounds, hulls, and render payloads.

The transform relationship is:

```text
parent world × parent compensation × host node transform × element content transform
```

Host nodes own element translation, rotation, independent scale, pivot, visibility, and opacity.
Element render objects describe content around a centered local origin. Opacity multiplies through
ancestry without isolated group compositing.

## Render objects

The public render module exposes `RenderObject`, `BoxRenderObject`, `EmptyRenderObject`, `Rectangle`,
`Text`, `Line`, `Arc`, `Poly`, `BezierPath`, `GlowLayer`, `CompositeLayer`, `ClipLayer`, `VisualMedia`,
and `PixelGrid`. The exact runtime export list is recorded in
[`sdk-manifest.json`](../../packages/plugin-sdk/sdk-manifest.json).

Objects form a parent/child hierarchy with inherited transforms, opacity, blend mode, and filter.
They expose visual bounds and optional layout bounds. Container layers provide clipping, isolated
compositing, and glow passes. `VisualMedia` draws resolved image or animation resources; it does not
load or own assets.

Built-in and plugin render callbacks should derive output deterministically from properties, time,
and callback-scoped snapshots. Do not retain canvas contexts or host snapshots between frames.

## Perspective warp

Perspective is a host-owned camera transform controlled by the schema-driven perspective
properties. The resolver combines the authored node and ancestor affine matrix with the element
pivot and canvas-relative vanishing point.

Identity projections use Canvas 2D directly. Non-identity projections flatten content into a pooled
Canvas source, submit it through the renderer-owned WebGL compositor, and copy it back in painter
order. Invalid inputs and GPU failures use a deterministic affine fallback. Rolling diagnostics are
available through `visualizer.getPerspectiveDiagnostics()` and the development overlay.

## Editor geometry

Canvas hit testing selects the deepest interactive element node. Single-node handles use oriented
bounds; multi-selection uses aggregate world bounds and a transient pivot. World-space gesture
deltas are solved back into authored local transforms. Parent compensation is changed only by
structural operations that preserve world appearance.

Selected subtrees are excluded from snapping. Locked inherited state removes descendants from
interaction without altering their local flags.
