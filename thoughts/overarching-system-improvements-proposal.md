# Overarching system improvements proposal

_Last reviewed: 2025-05-13_

## Status
- **Status:** Draft — synthesises current renderer/scene integration issues and sketches a forward-looking architecture for review.
- **Owner:** Rendering guild working with Visualizer Platform.

## Current rendering pipeline
- **Scene store → runtime adapter.** The zustand scene store notifies `SceneRuntimeAdapter`, which instantiates element classes from the registry, keeps them cached, and orders them before every frame build.【F:src/state/scene/runtimeAdapter.ts†L64-L169】
- **Scene element abstraction.** Each `SceneElement` materialises classic Canvas `RenderObject` trees, wrapping child geometry in an `EmptyRenderObject` that applies anchor, transform, and opacity logic inherited from the Canvas renderer.【F:src/core/scene/elements/base.ts†L301-L364】
- **Canvas-first render objects.** `RenderObject` instances own Canvas2D-style transform stacks and recursive `render` methods, assuming a 2D drawing context even when we target GPU backends.【F:src/core/render/render-objects/base.ts†L16-L138】
- **Renderer selection.** `MIDIVisualizerCore` still bootstraps both the legacy `ModularRenderer` and the WebGL renderer, swapping between them per preference and keeping Canvas contexts around for fallback paths.【F:src/core/visualizer-core.ts†L41-L338】
- **WebGL adaptation shim.** When WebGL is active, `WebGLRenderAdapter` walks the `RenderObject` tree, recalculates transforms, and pattern-matches classes (rectangle, text, image, etc.) to emit GPU primitives each frame, re-uploading textures and glyph atlases as needed.【F:src/core/render/webgl/adapter.ts†L62-L200】

## Structural pain points
- **Double scene graph traversal.** Elements emit Canvas-oriented objects that the WebGL adapter immediately re-traverses to reconstruct transforms and batches, duplicating CPU work each frame and obscuring when geometry actually changes.【F:src/core/render/webgl/adapter.ts†L87-L168】【F:src/core/render/render-objects/base.ts†L57-L85】
- **Canvas contract leakage.** WebGL still depends on Canvas-era features such as anchor visualization metadata and layout-bound calculations embedded in `EmptyRenderObject`, even though the GPU path redefines layout independently. This increases coupling between runtime interaction code and renderer internals.【F:src/core/scene/elements/base.ts†L315-L360】
- **Type probing bottlenecks.** The adapter’s `instanceof` checks hard-code support for a handful of render-object classes, so introducing a new visual primitive requires Canvas scaffolding first and then bespoke adapter logic, slowing experimentation.【F:src/core/render/webgl/adapter.ts†L172-L185】
- **Inefficient resource churn.** Because element instances rebuild `RenderObject`s opportunistically, the adapter cannot tell which assets (geometry buffers, textures, glyphs) are stable versus newly required, leading to conservative re-uploads and extra garbage each frame.【F:src/core/render/webgl/adapter.ts†L87-L123】
- **Limited editing feedback.** Selection and interaction tools depend on bounds derived from Canvas objects; when WebGL diverges (e.g., GPU-only effects), these bounds drift, hampering precise layout workflows the app promises to make fast and flexible.【F:src/core/scene/elements/base.ts†L315-L420】

## Proposed architectural direction
- **Adopt declarative render descriptions.** Have `SceneElement` implementations emit immutable `RenderNode` descriptions (e.g., `RectangleNode`, `TextNode`, `ParticleNode`) that capture geometry, materials, and transform props as plain data keyed by element + child identifiers instead of live Canvas classes.
- **Centralize transform & layout.** Introduce a renderer-agnostic scene graph (`SceneGraphNode` with transforms, clipping, z-index) that the runtime adapter maintains. Interaction overlays and selection tools would query this graph directly, removing the need for Canvas-specific metadata.
- **Incremental diffing engine.** Replace per-frame regeneration with a `SceneCompiler` that diffs current vs. previous `RenderNode` trees, producing change sets (create/update/destroy) for the active renderer. WebGL can then maintain persistent GPU buffers keyed by node IDs, dramatically reducing rebuild work.
- **Renderer plug-in boundary.** Define a shared interface (e.g., `RenderBackend`) that consumes the change set: WebGL would translate nodes into materials/geometries, while an optional Canvas fallback could implement a simpler interpreter without constraining the primary architecture.
- **Resource lifecycle ownership.** Move texture, glyph, and buffer caching to the compiler layer so assets are reference-counted per node and invalidated only when dependent node props change, enabling predictable performance and diagnostics.
- **Extensible primitive registry.** Replace `instanceof` guards with a registry that maps node types to backend-specific handlers. Adding a new primitive becomes a matter of registering its schema and providing a WebGL translator, aligning with the product goal of rapid visualization iteration.

## Migration strategy (sketch)
1. **Bridge layer:** Teach `SceneElement` to optionally emit the new `RenderNode` format while keeping current `RenderObject` output for compatibility.
2. **Hybrid adapter:** Implement a bridge in `WebGLRenderer` that consumes `RenderNode` snapshots when available, falling back to the existing adapter otherwise.
3. **Interaction sync:** Port selection/bounds tools to read from the shared scene graph, validating parity with current behaviour.
4. **Cut-over:** Once major element types produce nodes and tooling speaks the new graph, retire the Canvas-only `RenderObject` pathway and delete the double adaptation layer.

## Open questions
- How should procedural effects (e.g., audio-driven particle emitters) express time-varying geometry without re-emitting entire node payloads each frame?
- What serialization format best suits persistence/export so saved projects capture `RenderNode` data without leaking renderer internals?
- Which diagnostics are required to prove the new diffing pipeline improves frame times and reduces resource churn for representative scenes?
