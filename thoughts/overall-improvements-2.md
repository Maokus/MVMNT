# Overall improvements v2 — Idealized architecture for WebGL2-first runtime

_Last reviewed: 2025-05-13_

## Status
- **Status:** Draft — aspirational end-state vision for a WebGL2-native runtime with maximal flexibility for users and maintainability for developers.
- **Owner:** Rendering guild working with Visualizer Platform.

## Vision pillars
- **Single source of truth scene graph.** Authoring tools, runtime playback, and persistence all operate on an immutable, versioned scene graph with structural sharing. Transforms, spatial hierarchies, and behavioural modifiers live in this graph so that both GPU and tooling share semantics.
- **Declarative material + behaviour system.** Every visual primitive combines a geometry node, a material node, and optional behaviour stacks (animations, interactions, audio reactivity) expressed as data-driven pipelines that the compiler resolves to shader permutations or CPU evaluators.
- **Deterministic incremental compilation.** Scene edits and timeline changes run through a compiler that produces deterministic change sets and artifacts (buffers, textures, shader programs) stored in a content-addressed cache, ensuring repeatability and trivial undo/redo.
- **Renderer as plug-in modules.** WebGL2 backend, offscreen thumbnail renderer, and any future GPU/CPU targets implement the same `RenderBackend` protocol driven by the compiler. Tooling can hot-swap backends without mutating scene state.
- **User-extensible primitives.** Power users register new node schemas (geometry/material/behaviour) through configuration files or plugins, and the system scaffolds default shader templates and inspector controls automatically.

## Core architecture
### Scene graph & state management
- **Immutable scene document.** Store the scene as a persistent data structure (`SceneDocument`) backed by a CRDT-friendly format (e.g., JSON-CRDT) to unlock collaborative editing. Each node carries stable UUIDs, type tags, and metadata for authoring UIs.
- **Layered node taxonomy.** Split nodes into: spatial containers, drawable geometries, materials, behaviours (procedural modifiers, scripts), and data sources (MIDI tracks, audio analyzers). Nodes reference each other by IDs, enabling reuse (e.g., one geometry + multiple material instances).
- **Derived views.** Provide memoized selectors that project the document into views for timeline editing, inspector panes, and runtime compilation. These selectors replace bespoke Zustand stores and keep UI consistent with render runtime.

### Compilation pipeline
- **Change journals.** Edits append to a journal that the compiler consumes. The compiler operates incrementally, diffing only affected subtrees and emitting actions: `CreateBuffer`, `UpdateMaterialUniforms`, `DestroyPass`, etc.
- **Asset baking stage.** A `ResourceOrchestrator` handles textures, fonts, audio FFT kernels, and compute buffers. It uses dependency graphs to propagate invalidations so materials update only when inputs change.
- **Behaviour evaluation.** Time-varying behaviours compile into either GPU compute passes (for particle systems) or CPU evaluators that feed uniforms into render passes. The system supports declarative envelopes, curves, and scripting with sandboxed WASM modules.
- **Shader generation.** Materials declare parameter schemas and effect stacks (e.g., gradient → blur → color correction). The compiler fuses stacks into GLSL snippets, performing static analysis to share common subexpressions and insert required varyings/UBOs. WebGL2 backend caches compiled programs keyed by material fingerprints.

### Runtime execution
- **Frame scheduler.** A deterministic scheduler reads the latest compiled change set, applies it to backend state, and then executes frame phases: input sampling, behaviour evaluation, render pass execution, post-processing. Each phase is extensible via plugins.
- **Reactive debugging hooks.** Developers can subscribe to compiler events, GPU resource allocations, and frame timings via a diagnostics bus. Tooling surfaces these feeds in the IDE and in-app profiler overlays.
- **Interaction alignment.** Hit-testing and gizmo overlays run against the shared scene graph with GPU-assisted picking buffers generated per frame from the same node IDs, ensuring editing accuracy even for complex effects.

## Scene element authoring model
- **Element kits.** Provide high-level element templates (e.g., Piano Roll, Particle Field) composed of reusable graph fragments. Users tweak parameters; the system emits the underlying nodes. Kits can be versioned and shared.
- **Node inspectors.** Inspector panels auto-generate controls from node schemas (number ranges, color pickers, curve editors), supporting custom validation logic and real-time preview of shader/material changes.
- **Scripting surface.** Advanced users attach behaviour nodes powered by WASM/TypeScript DSL scripts. Scripts declare input/output contracts, letting the compiler statically schedule them and surface performance budgets.
- **Data binding.** Elements bind to data sources (MIDI channels, analysis features) through declarative expressions. The compiler translates bindings into uniform updates or compute kernels, enabling rich audio-reactive visuals without manual glue code.

## Developer experience improvements
- **Strong typing & schema evolution.** Node schemas live in a central registry with TypeScript definitions generated from JSON schemas. Codegen updates runtime validators, editor UI bindings, and documentation simultaneously.
- **Testing harness.** Provide a headless compiler harness that runs scenes through the pipeline, asserting on change set outputs and GPU resource diffs. Golden snapshots live alongside scene fixtures for regression testing.
- **Observability-first tooling.** Bundle GPU capture scripts, shader hot-reloaders, and compilation timeline visualizers so developers can reproduce user reports quickly. Diagnostics integrate with CI to flag shader compile errors or performance regressions.

## Migration considerations (informational)
- **Back-compat adapters.** While this document ignores feasibility, note that a transitional layer could wrap legacy `SceneElement` outputs into the new node taxonomy until elements are rewritten.
- **Incremental tooling adoption.** Editors could consume the immutable scene document before the renderer migrates, unlocking improved UX earlier.

## Open questions
- How should collaborative editing resolve conflicts on shared node resources (e.g., two users editing the same material stack) while keeping compilation deterministic?
- What is the UX for exposing shader graph complexity without overwhelming non-technical creators?
- Where should live-coding shader/behaviour edits execute to guarantee sandboxing and performance (main thread vs. worker vs. remote service)?

