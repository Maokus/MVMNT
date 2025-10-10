# Ideal renderer architecture proposal

_Last reviewed: 2025-05-18_

## Goals
- Preserve the current authoring UI and element mental model while modernising the rendering core.
- Give element developers deterministic, testable hooks to build scene graphs without renderer coupling.
- Support flexible transformation pipelines that guarantee stable layout math across CPU and GPU paths.
- Enable incremental, resource-aware updates so complex visuals remain performant and debuggable.

## High-level topology
- **Scene store and runtime adapter.** The zustand scene store continues to notify `SceneRuntimeAdapter`,
  but adapter responsibilities shift to assembling declarative `SceneGraph` descriptors from element
  definitions instead of instantiating imperative classes.
- **Scene compiler.** A new `SceneCompiler` receives the `SceneGraph` descriptor tree, validates schemas,
  resolves transforms, and produces immutable `RenderPacket`s (create/update/remove/change-order
  instructions) keyed by deterministic node IDs.
- **Renderer boundary.** Render backends (WebGL, Canvas fallback, tests) implement a shared
  `RenderBackend` interface that consumes `RenderPacket`s and manages GPU/CPU resources accordingly.
- **Interaction services.** Selection, hit testing, and overlays subscribe to the canonical
  `SceneGraph` so tooling sees the same transforms and bounds the renderer applies.

## Scene element authoring
- **Declarative node factory.** Each `SceneElement` exposes `describeScene(context)` returning a tree of
  `SceneNode` descriptors. Nodes declare type, props, local transforms, material references, and child
  order; they do not perform drawing.
- **Deterministic IDs.** Elements provide stable node IDs derived from element ID + child keys so diffs
  and persistence remain deterministic across sessions and machines.
- **Capability contracts.** Element authors opt into renderer features (e.g., instancing, SDF text) via
  capability flags on `SceneNode` types, allowing progressive enhancement without breaking fallback
  renderers.
- **Asset intents.** Nodes reference shared asset descriptors (textures, audio-driven curves, glyph
  atlases) by hashed keys. The compiler resolves these through the asset manager so uploads occur only
  when hashes change.

## Transformation system overhaul
- **Hierarchical transform descriptors.** Each `SceneNode` carries a `TransformDescriptor` capturing
  position, rotation, scale, skew, anchor, and optional deformation curves using explicit units (scene
  units, pixels, beats). Values support time sampling via deterministic evaluators tied to the global
  timeline.
- **Deterministic evaluation.** The compiler flattens transforms into world matrices using a
  deterministic math kernel (double precision accumulation, canonical rounding), ensuring parity across
  backends and replay sessions.
- **Constraint & layout solver.** Optional constraint blocks let elements declare relationships (align
  to sibling edges, distribute spacing). The compiler solves constraints before transform resolution so
  layout-dependent visuals remain stable when inputs change.
- **Interaction sync.** The same evaluated transforms populate the interaction system’s spatial index,
  guaranteeing hit areas match rendered geometry and that bounds are cached alongside frame packets.

## Scene compiler responsibilities
- **Schema validation.** Enforce that node props match registered schemas, logging developer-friendly
  diagnostics when required fields or asset references are missing.
- **Diff engine.** Compare incoming node trees against the previous canonical tree to emit `RenderPacket`
  operations (create/update/delete/reorder) with fine-grained prop and transform deltas.
- **Resource lifecycle.** Track reference counts for buffers, textures, and glyph atlases. When nodes
  release assets, issue disposal commands; when props change, trigger targeted updates rather than full
  rebuilds.
- **Timeline sampling.** Evaluate time-varying properties (audio reactive curves, keyframes) once per
  frame and cache results for both renderer and interaction subsystems.
- **Diagnostics hooks.** Produce introspection data (node counts, asset usage, transform bounds) for
  debugging overlays and automated regression checks.

## Renderer backends
- **WebGL 2+.** Implements handlers for each registered node type, managing VAOs, instanced draws,
  material pipelines, and batched uniform uploads. Consumes `RenderPacket`s to create/update GPU state
  without re-parsing entire scenes.
- **Canvas fallback.** A lightweight interpreter maps node types to Canvas calls, primarily for
  low-powered devices and visual diffs. Shares transform evaluation results to maintain parity.
- **Headless test renderer.** Provides deterministic snapshots by rasterising nodes via software or
  validating structural `RenderPacket`s, enabling regression suites without GPU requirements.

## Extensibility and tooling
- **Node registry.** A typed registry declares node schemas, default materials, and backend handlers.
  Adding a new primitive becomes a schema + handler registration rather than bespoke adapter plumbing.
- **Developer tooling.** Ship inspectors that visualise `SceneGraph` diffs, asset lifecycles, and
  transform hierarchies, helping element authors reason about performance.
- **Persistence format.** Store `SceneGraph` snapshots (node IDs, props, assets) alongside project data
  so reopening a project deterministically reconstructs the same graph.
- **Migration path.** Introduce compatibility shims that let existing render objects emit `SceneNode`
  descriptors while gradually retiring Canvas-specific classes. Maintain dual-render support until
  major elements complete the migration.

## Expected outcomes
- Reduced CPU overhead from avoiding double traversal and redundant transform math.
- Faster iteration for new visual primitives thanks to the declarative node registry.
- Consistent interaction bounds and renderer output due to unified transform evaluation.
- Clear diagnostics and asset lifecycle management that support high-fidelity visuals.
