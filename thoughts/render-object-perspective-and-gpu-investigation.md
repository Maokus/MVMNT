# Render-Object Perspective and GPU Investigation

**Status:** Element-level planar warp implemented behind `elementPerspectiveWarp`; broader GPU work remains investigatory.

**Date:** 2026-07-20

## Executive Summary

Generalised perspective transforms are possible, but they cannot be added to the current render-object
transform in the same way as rotation, scale, or skew. The renderer is built directly on Canvas 2D, whose
context transform is a two-dimensional affine matrix. Perspective requires a projective transform or a 3D
camera projection, neither of which Canvas 2D can apply to an arbitrary path, image, text run, or subtree.

There are two credible implementation strategies:

1. Rasterise an object subtree into a texture and project that texture as a quadrilateral with WebGL.
2. Add a GPU-native renderer that projects and draws each primitive's geometry.

The first strategy is general across all current and plugin render objects. It is best exposed as an explicit
`ProjectiveLayer`, rather than as a property on every object, because every layer introduces an offscreen
render target and a compositing pass. The second strategy can be much faster for scenes with many simple
objects, but it is not a small transform feature: it requires a renderer-neutral display list, tessellation,
text and media texture management, Canvas-style stroke/filter/blend emulation, and a fallback path.

Element-level perspective is both possible and the best first product surface. `SceneElement` already wraps
all of its render objects in one `EmptyRenderObject`, records stable local `baseBounds`, and treats the
element as the unit of selection and interaction. The element subtree can therefore be rasterised once and
projected as a plane. This is simpler and cheaper than allowing arbitrary nested objects to create projective
surfaces, although bounds, hit testing, effects, resolution, and export parity still need explicit solutions.

The current system may be CPU-bound, but switching APIs does not automatically move its work to the GPU.
Canvas 2D implementations can already GPU-accelerate rasterisation and compositing. MVMNT still performs
element evaluation, object allocation, bounds traversal, note/audio data preparation, and thousands of
JavaScript-to-canvas calls on the CPU every frame. A GPU compositor helps projection and full-surface effects;
a GPU primitive backend helps high object counts. Neither helps expensive element-building logic.

The recommended path is:

1. Add frame-stage and per-element profiling, then optimise allocation, bounds, and offscreen reuse.
2. Introduce a renderer-neutral surface/compositor boundary and a WebGL projective compositor.
3. Ship opt-in element-level perspective using rasterised element surfaces.
4. Accelerate measured high-volume primitives with GPU batching while retaining Canvas fallback surfaces.

## Implemented element-level boundary

The element-level path now follows the raster-surface recommendation while leaving ordinary elements on Canvas 2D. Source and scratch allocations are bucketed in 64-pixel increments, source resolution is clamped to 0.5–2× from projected edge scale, texture dimensions are capped by both 4096 and `MAX_TEXTURE_SIZE`, and off-viewport warps skip rasterisation. Identity warps use the ordinary affine paint path for pixel equivalence.

The implementation records a 120-frame rolling median and p95 plus warped/fallback counts, source/projected pixels, upload bytes, stage CPU timings, optional GPU timer-query results, reallocations, and context-loss events. The development overlay and `visualizer.getPerspectiveDiagnostics()` expose these measurements.

### Practical limits

The upload estimates remain the useful upper bound: about 8 MB per full 1080p RGBA surface and 33 MB per full 4K surface per changing element. Resolution clamping limits supersampling, but 16 continuously changing full-frame warped elements can still exceed practical upload bandwidth, especially at 4K. Small elements, stable allocation buckets, and a small number of simultaneously animated warps are the intended initial workload. Static-surface dirty caching and GPU-native primitives remain the next optimisations.

The release does not impose a 4K frame-rate gate. Browser benchmark results should always be recorded with GPU/browser/OS details because Canvas upload and read-composite behavior varies substantially by implementation; the diagnostics distinguish CPU submission from GPU execution for that reason.

## Current Rendering Architecture

The live frame path is:

```text
MIDIVisualizerCore.renderAtTime()
  -> SceneRuntimeAdapter.buildScene()
    -> SceneElement.buildRenderObjects() for each visible element
      -> element-specific _buildRenderObjects()
      -> layout and visual bounds calculation
      -> one EmptyRenderObject containing the element's objects
  -> ModularRenderer.render()
    -> RenderObject.render() recursively
      -> CanvasRenderingContext2D calls
```

Relevant implementation points:

- `src/core/visualizer-core.ts` owns one `CanvasRenderingContext2D`, rebuilds the scene at the target time,
  and immediately paints it.
- `src/state/scene/runtimeAdapter.ts` sorts visible elements and calls `buildRenderObjects()` every frame.
- `src/core/scene/elements/base.ts` calls the element's render callback, calculates layout and visual bounds,
  creates a fresh `EmptyRenderObject`, and attaches the returned objects as children.
- `src/core/render/render-objects/base.ts` applies translate, rotate, scale, skew, and origin using Canvas 2D
  state, calls `_renderSelf()`, and recursively renders children.
- `src/core/render/modular-renderer.ts` clears the canvas and submits each root object in order. It does not
  compile objects into batches or retain a backend representation between frames.

Although the object API resembles a retained scene graph, the common execution model is immediate-mode.
Many `_buildRenderObjects()` implementations allocate new `Rectangle`, `Line`, `Text`, `Arc`, and `Poly`
instances on every frame. Some media-oriented elements retain expensive objects, and `PixelGrid` explicitly
supports instance reuse, but reuse is not enforced by the architecture.

### Existing transform and bounds assumptions

The current transform is a 2D affine matrix:

```text
T(position) * R(rotation) * S(scale) * K(skew) * T(-origin)
```

The six coefficients computed by `_getWorldTransformMatrix()` are also used for bounds. Rectangular bounds
are transformed by projecting four corners through that affine matrix. `EmptyRenderObject` uses the same
model to produce `_worldCorners` for selection handles. Interaction code then relies on the element's
axis-aligned bounds, four corners, and local `baseBounds` for selection, snapping, anchor movement, resize,
and rotation.

This coupling means perspective is not only a paint concern. Any implementation must update:

- visual and layout bounds;
- anchor/pivot resolution;
- selection outline and handles;
- hit testing and pointer-to-local-coordinate conversion;
- snapping behaviour;
- resize/rotate interaction mathematics;
- persistence, automation, property controls, and plugin SDK types.

## What “Perspective Transform” Could Mean

Two scopes should not be conflated.

### Planar projective transform

A planar projective transform maps a local rectangle to an arbitrary convex quadrilateral. It can represent
keystone distortion and the appearance of a flat card rotated in 3D. Mathematically it is a 3-by-3
homography, with the projected point divided by its homogeneous `w` coordinate.

This is the most useful and tractable first definition for MVMNT. An element remains a flat composited plane,
with either four-corner controls or camera-like `rotateX`, `rotateY`, depth, field-of-view, and camera-distance
controls that resolve to a homography.

### General 3D scene transform

A full 3D scene gives every object a 3D position and potentially 3D geometry, depth testing, intersecting
planes, cameras, near/far clipping, and lights. This is a different scene model and renderer. Rasterising each
element to a flat card does not provide correct intersections between elements or thickness within an
element. Nothing in the current z-index, bounds, interaction, or plugin model expresses that information.

The recommendations below target planar projective transforms, not a general 3D scene graph.

## Object-Level Perspective

### It cannot be an ordinary `RenderObject` matrix property

`ctx.transform()` and the Canvas 2D drawing model apply affine transforms. An affine transform preserves
parallel lines; perspective does not. Supplying a larger DOM matrix or adding `perspective`, `rotateX`, and
`rotateY` fields to `RenderObject` would not make Canvas 2D project `_renderSelf()` or its children.

CSS 3D transforms are not a general solution. They could transform the one preview canvas DOM element, but
cannot independently transform objects already painted into it. Splitting every object into a DOM canvas
would break normal scene compositing and be prohibitively expensive. It would also diverge from image and
video export, which consume the rendered canvas.

### Strategy A: rasterise a subtree and warp its texture

An explicit projective container could:

1. determine the subtree's local visual extent;
2. render the subtree into a reusable Canvas 2D surface;
3. upload or expose that surface as a GPU texture;
4. draw the texture on a projectively transformed quad;
5. composite the result into the final scene.

This is the only straightforward technique that handles all existing content uniformly, including text,
images, Bezier paths, shadows, plugins, and nested Canvas effects. A WebGL vertex/fragment shader naturally
does perspective-correct texture interpolation.

It should be an explicit `ProjectiveLayer`, not a transform available indiscriminately on every
`RenderObject`. If ten thousand rectangles each request perspective, raster-per-object would create ten
thousand surfaces, texture updates, and draw calls. A projective layer establishes a deliberate flattening
boundary around a useful group.

The main problems are:

- **Render-target cost:** surfaces require allocation or pooling, clearing, rasterisation, texture upload,
  and an additional composite. Full-canvas surfaces, like the current `CompositeLayer`, waste pixels;
  tight surfaces require careful coordinate translation and effect padding.
- **Resolution:** a surface crisp at its original size can blur when its near edge is enlarged. Dynamic
  resolution improves quality but causes allocation churn and can become unbounded. A resolution policy and
  maximum texture size are necessary.
- **Edge and effect padding:** strokes, shadows, blur, and children outside layout bounds must not be cropped.
  Visual bounds are a starting point, but filters can be difficult to bound from arbitrary CSS filter strings.
- **Flattening semantics:** filters and blends before projection do not always look like the same operations
  after projection. A shadow rendered into the plane is warped with the plane; a world-space shadow would
  need a later pass. `destination-*` operations depend on which content shares the isolation group.
- **Nested projective layers:** repeated rasterisation loses quality and increases passes. The system needs
  defined flattening rules and probably a nesting limit.
- **Animated media uploads:** videos, GIF frames, sprite frames, and changing canvases update textures.
  Upload bandwidth can dominate even if the final quad draw is cheap.
- **Ordering:** a projected object is still inserted at one point in the current painter's order. A subtree
  cannot correctly interleave its children with objects outside the flattened surface.
- **Transparency and colour:** premultiplied alpha, colour space, texture filtering, and antialiasing must
  match Canvas closely enough to avoid halos and preview/export differences.

A Canvas-only approximation can split the source into a mesh of triangles, clip each destination triangle,
and use an affine `drawImage()` per triangle. It avoids a WebGL compositor, but uses many CPU-side draw calls,
can show seams, and only approximates perspective between mesh vertices. It is useful as a prototype or
fallback, not as the preferred general implementation.

### Strategy B: project each primitive's geometry

Simple primitives could be converted to geometry, projected on the CPU, and drawn back through Canvas 2D.
Rectangles become quadrilaterals and polylines become projected points. This is not general:

- curves under perspective are rational curves, not the same ordinary quadratic/cubic curves accepted by
  Canvas, so they need adaptive subdivision;
- text and images need glyph/texture warping rather than point projection;
- stroke width, joins, caps, dashes, and shadows require a definition in local, screen, or world space;
- clipping, near-plane crossings, negative `w`, and geometry behind the camera must be handled;
- every primitive needs new projective bounds and hit-test code.

Doing this on a GPU rather than projecting back into Canvas can be valuable, but it is a GPU renderer project,
not a modest extension of the base class.

## Element-Level Perspective

Element-level perspective is feasible and is the recommended first scope.

`SceneElement.buildRenderObjects()` already creates a container for the element subtree and records its
untransformed aggregate `baseBounds`. The workspace treats that container as the selectable unit. This gives
an element surface a natural local rectangle, anchor, z-order position, and lifecycle.

An opt-in implementation could add element properties such as:

- `perspectiveEnabled`;
- either four local/destination corner controls;
- or `elementRotateX`, `elementRotateY`, `elementDepth`, `perspectiveDistance`, with the existing 2D rotation
  and scale remaining well-defined;
- a surface-resolution mode and quality cap.

The element's children would render into one tight, padded Canvas 2D surface. The final compositor would draw
that surface as a projected GPU quad. Elements without perspective could either continue through Canvas 2D
or also enter the compositor as ordinary surfaces/batches.

### Element-level problems that still need design

- **Bounds:** for a flat element surface, project its four padded corners and take their axis-aligned union.
  This is exact for the plane's extent. The current affine matrix and `_worldCorners` shape must be replaced
  or generalised to carry homogeneous/projected corners.
- **Hit testing:** pointer coordinates should be mapped through the inverse homography into local element
  space. A near-singular or back-facing transform must fail safely. Alpha-aware hit testing would require a
  mask/readback and should not be the default.
- **Handles:** four-corner editing maps naturally to a homography, while camera-style controls need separate
  pitch/yaw/depth interaction. Existing resize mathematics assumes an affine rectangle and cannot simply be
  reused.
- **Anchors:** the anchor should remain a point in the local plane, then be projected. Changing the anchor
  while visually fixing the element requires projective, rather than affine, compensation math.
- **Snapping:** the current snap system uses the projected axis-aligned bounding box. That can remain a simple
  first behaviour, but snapping actual projected corners/edges would be more intuitive and is more complex.
- **Depth/order:** preserve element `zIndex` painter order initially. Sorting by projected depth would create
  surprising changes and still would not solve intersecting planes. A true depth buffer should wait for a
  deliberately 3D scene model.
- **Offscreen effects:** define whether element opacity, blend mode, filter, and glow operate inside the plane
  or when the projected surface is composited. Both are useful and visually different.
- **Selection overlays:** overlays should be rendered after the GPU scene, using projected corners, so they
  remain sharp and screen-aligned.
- **Export:** the final projective compositor must render into the same canvas passed to `CanvasSource` and
  PNG `toBlob()`. Preview-only CSS transforms are unacceptable. WebGL output is canvas-compatible, but the
  application cannot attach both its current 2D context and a WebGL context to the same canvas; a source
  Canvas 2D surface plus a WebGL output canvas, or a unified compositor, is required.
- **Compatibility:** new properties and new render objects affect scene persistence, automation descriptors,
  built-ins, and the public `@mvmnt-app/plugin-sdk/render` contract. An element-only host feature can avoid
  changing plugin render callbacks initially.

## Where the CPU Work Comes From

No frame-stage profiler currently establishes which cost dominates a representative scene. The plugin safety
wrapper times an individual plugin's synchronous `_buildRenderObjects()` callback, but it does not measure
built-ins, bounds, Canvas painting, GPU completion, effects, or export encoding. Its timer callback also cannot
interrupt a synchronous callback; only the elapsed-time check after return reports slow work.

Likely CPU costs visible in the code are:

- evaluating bindings and invalidating time-dependent property caches for every element;
- querying and transforming MIDI/audio data inside element render callbacks;
- allocating arrays, point objects, render objects, and the per-element container every frame;
- calculating both layout and visual bounds after building each element, recursively walking object trees and
  measuring text/curve extrema;
- one `save()`/transform/style/draw/`restore()` sequence per render object;
- rebuilding paths and submitting many small Canvas 2D commands;
- rendering children more than once for glow;
- allocating a full-canvas `OffscreenCanvas` every time `CompositeLayer.render()` runs;
- main-thread PNG encoding/readback or video frame submission during export.

Some raster operations may already execute on the GPU behind Canvas 2D. JavaScript preparation and command
submission remain CPU work, and Canvas deliberately does not expose batching, shaders, instancing, or GPU
timing controls.

## GPU Acceleration Options

### 1. Optimise the current Canvas path first

These changes have lower architectural risk and benefit both a future Canvas fallback and a hybrid renderer:

- instrument `buildScene`, each element build, bounds, paint submission, projective/effect passes, and export;
- record object counts by type and allocation/reuse counts;
- retain static render-object graphs and mutate values that change, as `PixelGrid` already recommends;
- separate static layout geometry from dynamic visual geometry so bounds are not recomputed from a newly
  allocated tree each millisecond of playback;
- avoid separate full recursive layout and visual walks where one traversal can produce both;
- cache `Path2D`, text measurement, and other immutable geometry by content/style key;
- cull elements and objects whose conservative visual bounds miss the viewport;
- pool `CompositeLayer` surfaces and size offscreen effects to padded visual bounds rather than the full canvas;
- batch adjacent compatible Canvas shapes into a path only where doing so preserves painter order, opacity,
  blend, clipping, and filter semantics;
- use lower-resolution effect surfaces, following the existing `GlowLayer.glowResolution` pattern.

This may remove enough CPU cost that only projective compositing needs a GPU-specific implementation.

### 2. Move Canvas rendering to an `OffscreenCanvas` worker

This can free the UI thread but is not equivalent to GPU acceleration and may not reduce total frame time.
The current render objects are class instances whose `render()` methods directly consume a context. They are
not transferable. A worker design therefore needs one of:

- element execution and its data dependencies moved into the worker; or
- a serialisable render command buffer produced on the main thread and consumed by the worker.

Fonts, decoded media, plugin callbacks, stores, resource handles, interaction data, and export synchronisation
make the first option invasive. A command buffer is useful because it also creates the renderer-neutral
boundary needed by a GPU backend, but serialisation and copying must be measured. Worker rendering is best
treated as a responsiveness option after profiling, not as the first acceleration step.

### 3. Add a hybrid WebGL compositor

This is the highest-value route for perspective and expensive full-surface effects:

- keep Canvas 2D for current primitive fidelity;
- rasterise only explicit element/projective/effect surfaces;
- upload those surfaces as textures;
- use WebGL for perspective quads, surface transforms, opacity, and selected shader effects;
- composite to the final exportable canvas.

It provides general projective transforms without immediately reimplementing every primitive. Its performance
depends heavily on surface count, surface size, reuse, dirty tracking, and upload bandwidth. If every element
changes every frame at 4K, Canvas raster plus texture upload may be slower than the current renderer.

### 4. Add GPU-native primitive batches incrementally

Measured high-volume primitives can bypass Canvas surfaces:

- instanced rectangles and image quads;
- line/polyline meshes;
- arcs represented by meshes or signed-distance shaders;
- `PixelGrid` as a small data texture scaled with nearest-neighbour sampling;
- cached text glyph atlases once text volume justifies the complexity.

The renderer can batch only adjacent commands with compatible pipeline state unless it proves that reordering
does not affect output. Blend modes, transparency, filters, clipping, and painter order otherwise make broad
reordering incorrect.

Complex Bezier paths, unusual Canvas filters/compositing, or unsupported plugin content can remain Canvas
raster surfaces. A hybrid fallback avoids blocking GPU gains on perfect Canvas emulation.

### 5. Replace Canvas 2D with a full GPU renderer

This offers the highest eventual ceiling and the greatest cost. It needs:

- a backend-independent display list rather than objects calling `CanvasRenderingContext2D` directly;
- geometry tessellation and caches;
- stroke joins/caps/dashes and antialiasing;
- text shaping, fallback fonts, glyph atlases, and letter spacing;
- image, animation, and video texture lifecycle management;
- clip stacks, filters, shadows, isolation groups, and Canvas blend-mode parity;
- colour-space and premultiplied-alpha rules;
- device/context-loss recovery and resource-budget handling;
- deterministic preview/export behaviour;
- a migration/fallback story for the public plugin SDK.

WebGL is the pragmatic initial compositor API for broad deployment. A backend abstraction could permit a
WebGPU implementation later, but adopting WebGPU does not remove the display-list, tessellation, text, and
compatibility work.

## Recommended Architecture

### Establish a renderer-neutral frame description

Do not make a second renderer inspect private fields of every current class indefinitely. Introduce an
internal display list or render-command interface produced from the render-object tree, for example:

```typescript
type RenderCommand =
    | { kind: 'rect'; transform: Affine2D; geometry: RectGeometry; paint: Paint }
    | { kind: 'poly'; transform: Affine2D; geometry: PolyGeometry; paint: Paint }
    | { kind: 'text'; transform: Affine2D; run: TextRun; paint: Paint }
    | { kind: 'image'; transform: Affine2D; source: VisualSource; placement: Placement }
    | { kind: 'push-clip'; clip: ClipGeometry }
    | { kind: 'begin-surface'; options: SurfaceOptions }
    | { kind: 'end-surface' };
```

The exact representation needs design, but it should:

- preserve strict painter order;
- make save/restore, clips, filters, and isolation explicit;
- use packed numeric arrays for high-volume dynamic data where practical;
- allow a Canvas backend, a worker backend, and a GPU backend to consume the same frame;
- keep the public plugin constructors functional while the host translates known objects to commands;
- provide a raster fallback for commands the GPU backend cannot reproduce.

This “compile” step is different from `core/render/compile.ts`, which currently compiles timeline MIDI data
into schedule events rather than compiling visual render objects.

### Add an explicit surface/projective boundary

A `RenderSurface`/`ProjectiveLayer` concept should own:

- local content bounds and effect padding;
- dirty/version state;
- resolution policy and maximum dimensions;
- pooled Canvas and GPU resources;
- homography/camera parameters;
- inverse mapping for interaction;
- inside-surface versus composite-stage opacity/filter/blend semantics.

Element-level perspective can create this surface automatically around the existing element container.
Object-level perspective can later expose the same mechanism explicitly to built-ins and plugins, with safety
limits on surface count and total pixels.

## Suggested Delivery Sequence

### Stage 1: measurement and Canvas improvements

- Add a developer-overlay render profiler with build, bounds, paint, effect, and export timings.
- Track per-element object counts and top offenders.
- Pool `CompositeLayer` surfaces and test tight-bounds rendering.
- Prototype retained graphs/static-dynamic separation in one high-object-count MIDI element.
- Build representative benchmark scenes at preview and export resolutions.

Exit criterion: measurements identify whether frame time is dominated by element computation, allocation and
bounds, Canvas command submission, pixel effects, texture/media work, or export.

### Stage 2: element projective compositor prototype

- Render one opted-in element to a tight reusable Canvas surface.
- Composite it through a WebGL quad with a homography.
- Implement projected bounds, inverse-homography hit testing, selection outline, transparency, and resize.
- Verify PNG and video export use the same pixels as preview.
- Measure static and fully animated elements at 1080p and 4K.

Exit criterion: quality, upload cost, interaction, and export behaviour are understood before public scene
properties or SDK contracts are committed.

### Stage 3: productise element-level perspective

- Choose four-corner, camera-style, or both control models.
- Add persistence, validation, automation, undo commands, property UI, and migration defaults.
- Define z-index, back-face, near-plane, effect, nesting, and resolution semantics.
- Add context-loss fallback and GPU capability diagnostics.

### Stage 4: selective GPU primitive acceleration

- Translate the measured dominant simple primitives to GPU commands.
- Batch adjacent compatible commands and retain Canvas surface fallback.
- Compare visual parity and frame time before expanding primitive coverage.

Only consider a fully GPU-native renderer if benchmark scenes show that surface upload or Canvas command
submission remains the dominant limit after these stages.

## Decisions Recommended by This Investigation

- Define the first feature as **planar element perspective**, not general 3D.
- Do not add perspective fields to every `RenderObject` while rendering remains direct Canvas 2D.
- Use an explicit rasterised projective surface for general object-subtree support.
- Preserve `zIndex` painter order initially; do not imply depth-correct 3D intersections.
- Treat GPU work as a hybrid migration with Canvas fallback, not an all-at-once renderer rewrite.
- Profile before choosing between main-thread optimisation, worker rendering, GPU batching, and full-surface
  effects; they solve different bottlenecks.
- Require preview/export parity as an architectural constraint from the prototype onward.

## Open Questions

- Is the desired authoring model four-corner pinning, camera-like pitch/yaw/depth, or both?
- Should shadows/glow live in the projected plane or be screen-space effects after projection?
- What maximum surface dimensions and per-frame upload budget are acceptable at export resolution?
- Are perspective elements allowed to be back-facing or cross the camera/near plane?
- Is AABB snapping sufficient, or should projected edges and corners become snap targets?
- Which representative scenes currently demonstrate the reported CPU bottleneck, and at what resolution?
- How much pixel-level parity with the current Canvas renderer is required for GPU-native primitives?
- Should external plugins eventually create projective layers, or should perspective remain a host-owned
  element transform that works around any plugin's output?
