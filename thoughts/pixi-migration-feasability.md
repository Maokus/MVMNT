# PIXI Migration Feasibility

## Summary
- **Status:** Exploratory assessment
- Migrating the canvas-based renderer to WebGL via Pixi.js is viable but requires a multi-phase refactor to preserve the current scene element system, binding infrastructure, and tooling hooks.

## Current Rendering Architecture
- `MIDIVisualizerCore` owns the HTML canvas, animation loop, and delegates rendering to a `ModularRenderer` instance that iterates over render objects and issues imperative Canvas2D calls.【F:src/core/visualizer-core.ts†L12-L188】【F:src/core/render/modular-renderer.ts†L10-L30】
- Visual content is built by the `SceneRuntimeAdapter`, which mirrors scene store state, instantiates scene elements through the registry, and asks each element to emit render objects ordered by z-index.【F:src/state/scene/runtimeAdapter.ts†L29-L209】
- Scene elements wrap property bindings, macro integration, and cached bounds computations before packaging child render objects inside an `EmptyRenderObject` container that applies transforms, opacity, and anchor math uniformly.【F:src/core/scene/elements/base.ts†L19-L415】【F:src/core/render/render-objects/empty.ts†L11-L129】
- Interaction overlays (selection boxes, guides, handles) are drawn directly on the same 2D context after the scene render, relying on Canvas APIs such as `setLineDash`, `strokeRect`, and path drawing.【F:src/core/visualizer-core.ts†L360-L520】
- Export utilities reuse the canvas renderer to synthesize image data, data URLs, or blobs synchronously on the CPU.【F:src/core/render/modular-renderer.ts†L32-L80】

## Canvas Feature Surface Area
- Primitive render objects depend on Canvas-specific features: gradient-free fills, shadows, rounded path drawing, and alpha stacking for rectangles; text relies on `CanvasRenderingContext2D` font metrics, shadows, and stroke/fill layering; images are drawn via `drawImage` with clipping for cover mode and placeholders for loading states.【F:src/core/render/render-objects/rectangle.ts†L3-L153】【F:src/core/render/render-objects/text.ts†L1-L200】【F:src/core/render/render-objects/image.ts†L1-L142】
- The container object composes child transforms with rotation, skew, and scale around an arbitrary anchor, and caches world-space corners for hit-testing and overlays.【F:src/core/render/render-objects/empty.ts†L36-L176】
- Bounds caching in the scene element base class assumes cheap recomputation in JS and stores per-time buckets to minimize layout thrash, with invalidation tied to property bindings and macro events.【F:src/core/scene/elements/base.ts†L23-L510】
- Fonts trigger bounds invalidation through DOM `font-loaded` events so text layout stays accurate; any replacement renderer must continue to observe the same event stream.【F:src/state/scene/runtimeAdapter.ts†L76-L112】

## Upstream Timing & Scheduling Dependencies
- MIDI scheduling compiles note events per look-ahead window, applying offsets, solo/mute gating, and tempo maps, feeding both playback and visuals; the scheduler bridge mirrors timeline state into lightweight compile configs.【F:src/core/render/compile.ts†L6-L135】【F:src/core/render/scheduler-bridge.ts†L7-L105】
- Visual elements such as the piano roll query timeline stores and rely on synchronous availability of note windows to build render objects, so any renderer swap must keep per-frame data delivery timing unchanged.【F:src/core/visualizer-core.ts†L243-L333】

## Feasibility Assessment
### Potential Benefits
- Pixi.js would offload large fill/stroke workloads (dense note blocks, scrolling grids) to GPU pipelines while providing scene graph abstractions similar to existing render object hierarchies.
- Pixi’s texture batching and filter system could reduce CPU-bound export costs and enable richer effects (blur, color grading) that are currently cumbersome with Canvas2D.

### Major Challenges
- **Rendering API gap:** Current render objects call Canvas APIs directly; porting them requires mapping to Pixi display objects (e.g., `Graphics`, `Sprite`, `Text`) or building custom containers, while replicating features like per-object shadows, skew transforms, dashed strokes, and clipping semantics.【F:src/core/render/render-objects/rectangle.ts†L51-L105】【F:src/core/render/render-objects/text.ts†L55-L119】【F:src/core/render/render-objects/image.ts†L88-L140】
- **Bounds & interaction parity:** The editor depends on precise layout/visual bounds, world-corner caches, and overlay drawing for selection. Pixi’s bounds computations differ (especially with filters or cached bitmaps), so the existing caching logic may need to query Pixi’s transforms or maintain dual representations to keep hit-testing deterministic.【F:src/core/scene/elements/base.ts†L367-L510】【F:src/core/render/render-objects/empty.ts†L131-L176】【F:src/core/visualizer-core.ts†L369-L520】
- **Runtime adapter contract:** Scene elements expose Canvas-tailored render objects. We must either generate Pixi display trees directly from elements or introduce an abstraction layer that can target both Canvas and Pixi during transition, increasing complexity of the adapter cache and update pathways.【F:src/state/scene/runtimeAdapter.ts†L134-L292】
- **Export tooling:** Current frame extraction clones canvases synchronously. Pixi would require using `PIXI.Renderer.extract` APIs or WebGL readbacks, which behave asynchronously and may incur GPU read penalties, affecting export pipelines and tests.【F:src/core/render/modular-renderer.ts†L32-L80】
- **DOM integrations:** Image elements expect `HTMLImageElement` instances and emit placeholder text when assets are absent; fonts trigger DOM events; property bindings compute values on the CPU each frame. The migration must ensure Pixi’s texture loader honors existing preload paths and macro-driven value updates without introducing flicker.【F:src/core/render/render-objects/image.ts†L16-L118】【F:src/state/scene/runtimeAdapter.ts†L76-L208】

### Required Refactors
1. **Rendering abstraction:** Define a renderer-agnostic interface (e.g., `IRenderSurface`) that scene elements target, with Canvas and Pixi backends, to allow incremental rollout and regression fallback.【F:src/core/render/modular-renderer.ts†L10-L80】【F:src/state/scene/runtimeAdapter.ts†L134-L209】
2. **Render object rewrite:** Reimplement core primitives as Pixi display objects, paying attention to features not natively supported (e.g., dashed rectangles, text shadows), potentially leveraging Pixi Graphics, Meshes, or custom shaders.【F:src/core/render/render-objects/rectangle.ts†L51-L153】【F:src/core/render/render-objects/text.ts†L55-L200】
3. **Bounds synchronization:** Extend scene elements to optionally consume Pixi-computed bounds or continue maintaining analytic bounds in parallel, ensuring overlays and hit-testing remain accurate during and after migration.【F:src/core/scene/elements/base.ts†L367-L510】【F:src/core/visualizer-core.ts†L369-L520】
4. **Export pipeline update:** Replace `getFrameData` and sequence rendering with Pixi’s extraction utilities, and benchmark GPU readbacks to confirm export parity in automated tests.【F:src/core/render/modular-renderer.ts†L32-L80】
5. **Interaction overlay port:** Either redraw overlays with Pixi Graphics layers or keep a 2D canvas overlay synchronized above the Pixi view, which necessitates consistent coordinate conversions from Pixi’s stage to screen space.【F:src/core/visualizer-core.ts†L360-L520】

### Risk Mitigation
- Maintain a feature flag allowing runtime selection between Canvas and Pixi during rollout.
- Introduce snapshot tests comparing Canvas and Pixi outputs for deterministic scenes to detect rendering regressions early.
- Profile GPU memory usage for dense MIDI scenes to ensure Pixi does not regress performance on low-end hardware.

## Migration Strategy Options
1. **Adapter Layer First (Recommended):** Introduce renderer-agnostic interfaces and dual-render paths, migrate primitives incrementally, and keep Canvas as a reference implementation until parity tests pass.
2. **Direct Port:** Rewrite scene elements to emit Pixi objects immediately. Faster to code but risks breaking editor tooling and export features simultaneously.
3. **Hybrid Overlay:** Use Pixi for heavy background layers (piano rolls, spectrums) while retaining Canvas for text/overlays initially, reducing scope but complicating compositing and export logic.

## Open Questions
- How will macro-driven property updates propagate to Pixi display objects without incurring additional frame allocations?【F:src/core/scene/elements/base.ts†L152-L207】
- Can existing interaction overlays be reimplemented within Pixi (to leverage the same stage) without losing editor affordances such as dashed outlines and custom handle glyphs?【F:src/core/visualizer-core.ts†L369-L520】
- What is the acceptable export performance regression (if any) when relying on WebGL readbacks for high-resolution frame sequences?【F:src/core/render/modular-renderer.ts†L32-L80】
