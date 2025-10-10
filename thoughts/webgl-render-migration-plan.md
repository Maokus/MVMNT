# WebGL Render Migration Plan

_Last reviewed: 2025-03-12_

## Summary
- **Objective:** Replace the existing 2D canvas renderer with a WebGL pipeline that preserves deterministic output while
  unlocking GPU-accelerated materials and batching.
- **Scope:** Renderer contract, renderable object abstractions, material system, batching, compatibility layers, and
  regression tooling for parity validation.
- **Status:** In review with runtime and scene state owners prior to implementation.
- **Related plans:** Aligns with [Audio Visualisation Implementation Plan (Phase Consolidation)](./audio-visualisation-plan-3.md)
  and its Phase 3.5 deliverables.

## Context Update (2025-03-12)
- The current runtime relies on `ModularRenderer` (`src/core/render/modular-renderer.ts`) invoking Canvas 2D `RenderObject`
  subclasses (`src/core/render/render-objects/*`). Rendering is CPU-bound and tightly coupled to the scene graph produced by
  `SceneRuntimeAdapter` and `VisualizerCore`.【F:src/core/render/modular-renderer.ts†L1-L71】【F:src/core/render/render-objects/base.ts†L1-L119】
- Export flows reuse the same Canvas renderer and populate sequences through repeated draw calls, so WebGL must integrate with
  export determinism guarantees documented in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
- Runtime plans for audio visualisation (Phase 3.5) expect deterministic shader/material primitives, so this migration unblocks
  later GPU-dependent visuals while keeping the Canvas fallback viable.

## Dependencies & References
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — runtime contract, SceneRuntimeAdapter ownership, and export guarantees.
- [`docs/mvt-asset-packaging.md`](../docs/mvt-asset-packaging.md) — asset packaging expectations for future texture resources.
- [`src/core/render`](../src/core/render) — baseline renderer, render object hierarchy, and scene integration points.
- [`thoughts/audio-visualisation-plan-3.md`](./audio-visualisation-plan-3.md) — downstream consumers of the WebGL renderer.

## Current Challenges
- CPU-bound rendering due to per-frame Canvas 2D draw calls.
- Lack of GPU-accelerated effects (blending, shaders, instancing) limits complex scenes.
- Render objects tightly coupled to 2D context APIs, complicating reuse.
- Scene graph updates assume immediate mode rendering without retained state on the GPU.

## Architectural Decisions
- **Renderer Core:** Implement a `WebGLRenderer` that conforms to the current renderer contract (init, resize, render frame) while
  managing WebGL context lifecycle, lost-context recovery, and offscreen export hooks.
- **Render Objects:** Define a GPU-friendly render object interface with lifecycle hooks (`prepare`, `updateBuffers`, `draw`) to bridge
  scene updates and GPU resources without duplicating Canvas-only behavior.
- **Material System:** Introduce shader/material descriptors decoupled from render objects, allowing shared programs, uniform layouts,
  and deterministic constant buffers for animation inputs.
- **Batching:** Support geometry batching via vertex/index buffers and instancing to reduce draw calls for repeated primitives.
- **State Management:** Cache GPU resource handles within render objects and centralize disposal so exports and playback share buffers.
- **Compatibility:** Add a Canvas 2D fallback implementing the same interface and share adapters so scenes can opt in per feature flag.
- **Instrumentation:** Emit timing and determinism metrics (frame hash, draw call counts) for regression tests and runtime diagnostics.

## Migration Phases
### Phase 0 — Foundation (Blocking)
_Status: ✅ Completed 2025-03-15_

**Goal:** Capture the renderer contract and classify render object responsibilities before introducing GPU abstractions.

**Key activities**
- Document the current renderer lifecycle (`init`, `resize`, `renderFrame`, `teardown`) and export hooks in shared architecture notes.
- Enumerate render object categories (vector primitives, images, text, particles) and identify which attributes map to GPU buffers,
  uniforms, or textures.
- Specify the `RendererContract` TypeScript interface consumed by `VisualizerCore` so WebGL and Canvas implementations compile against
  the same surface.

**Exit criteria**
- Contract and object taxonomy published in `/docs` with sign-off from runtime and export owners. ✅ See
  [`docs/renderer-contract.md`](../docs/renderer-contract.md).
- Test harness scaffolding agreed upon (snapshot comparison, frame hashing) to reuse during later phases. ✅ Documented in
  [`docs/renderer-contract.md`](../docs/renderer-contract.md).

### Phase 1 — WebGL Infrastructure (Blocking)
_Status: ✅ Completed 2025-03-18_

**Goal:** Establish the minimal WebGL runtime capable of drawing deterministic primitives through the new abstractions.

**Key activities**
- Implement context acquisition, resize handling, and lost-context recovery utilities with descriptive error reporting.
- Build buffer, shader, and program helpers plus a material descriptor schema that tracks uniform layouts and texture bindings.
- Produce a prototype render loop that clears the frame, issues batched draw calls, and records frame hashes for regression tests.

**Exit criteria**
- `WebGLRenderer` class implements the agreed contract and renders a reference primitive scene deterministically in both playback and
  export harnesses. ✅ Implemented in [`src/core/render/webgl/webgl-renderer.ts`](../src/core/render/webgl/webgl-renderer.ts) with diagnostics and frame hashing.
- Snapshot tests compare Canvas vs. WebGL output for basic geometry and pass within tolerance. ✅ Covered by prototype regression harness in
  [`src/core/render/__tests__/webgl-renderer.phase1.test.ts`](../src/core/render/__tests__/webgl-renderer.phase1.test.ts), validating deterministic hashing and draw calls.

### Phase 2 — Render Object Migration (Incremental)
_Status: In planning_

**Goal:** Adapt render objects to populate GPU resources while preserving existing animation and layout semantics.

Further detail: See [Phase 2 detailed planning](./wrmp-p2-planning.md) for milestone breakdowns, risks, and owners.

**Key activities**
- Create adapters that translate current `RenderObject` properties into vertex buffers, uniform blocks, or texture updates.
- Port rectangle, line, image, and particle primitives to instanced or batched WebGL draws, matching Canvas ordering and blending.
- Implement glyph-atlas-backed text rendering that reuses the existing font loader for atlas generation and uploads texture pages on
  demand.
- Route animation parameters (opacity, transforms, color ramps) through uniform updates rather than CPU-side per-frame draws.

**Exit criteria**
- Reference scenes render via WebGL without diverging from Canvas baselines for shapes, sprites, and text (verified by snapshot tests).
- GPU resource lifecycle (creation, reuse, disposal) is encapsulated within render objects with profiling confirming reduced per-frame
  allocations.

### Phase 3 — Scene Integration (Incremental)
_Status: Pending Phase 2 validation_

**Goal:** Wire the scene runtime to emit GPU-compatible render commands and support opt-in rollout.

**Key activities**
- Update `SceneRuntimeAdapter` and `VisualizerCore` to target the shared renderer contract and expose a feature flag for WebGL scenes.
- Provide a compatibility shim translating legacy Canvas render paths to the new adapter so teams can opt in scene-by-scene.
- Add performance and determinism instrumentation (frame time, hash comparison, error logs) to runtime diagnostics and CI checks.

**Exit criteria**
- Feature-flagged scenes render through WebGL in the workspace and export pipeline with no regressions in determinism or transport sync.
- QA scripts validate parity across representative scenes (UI-heavy, animation-heavy, text-heavy) before expanding rollout.

### Phase 4 — Decommission Canvas Renderer (Stretch)
_Status: Future work_

**Goal:** Remove the Canvas implementation once parity metrics are met and teams have migrated their scenes.

**Key activities**
- Audit remaining Canvas-only render paths and port them (or declare fallbacks) to WebGL equivalents.
- Retire Canvas-specific code paths from `VisualizerCore`, exporters, and tooling once telemetry confirms negligible usage.
- Refresh developer onboarding and documentation to reference WebGL-only workflows, including debugging and performance profiling guides.

**Exit criteria**
- Canvas renderer is kept only as a development fallback and is no longer invoked in production configurations.
- Documentation, onboarding, and templates reference WebGL primitives exclusively, with release notes highlighting the migration completion.

## Decisions & Open Questions

### Decisions
- **Text rendering:** Start with cached glyph atlases generated via Canvas 2D or `OffscreenCanvas`, uploaded as WebGL textures per font
  variant. This leverages the existing font loader while keeping parity with Canvas kerning and fallback behavior.
- **Post-processing:** Prioritize deterministic parity. Initial WebGL rollout will ship with the equivalent of Canvas compositing only; bloom
  or blur passes can layer on once parity and performance budgets are locked.
- **Asset pipeline:** Reuse the packaged asset layout defined in `docs/mvt-asset-packaging.md` for textures and glyph atlases so exports remain
  deterministic and inspectable.

### Open questions
- How aggressively should we adopt `OffscreenCanvas` for worker-based rendering to avoid blocking the main thread during exports?
- Which GPU profiling hooks (WebGL debug extensions, frame timers) should feed CI baselines versus developer tooling only?

## Risks & Mitigations
- **Risk:** WebGL context loss leading to blank frames. **Mitigation:** Centralize context restoration logic and maintain CPU-side copies of critical buffers.
- **Risk:** Performance regressions from naive buffer updates. **Mitigation:** Profile buffer uploads, adopt dynamic draw usage hints, and cache geometry where possible.
- **Risk:** Increased complexity for feature teams. **Mitigation:** Provide guidelines, reference implementations, and training sessions during rollout.

## Next Steps
- Review plan with rendering, export, and scene state owners for feasibility feedback.
- Publish the renderer contract and taxonomy in `/docs` and link it from dependent plans.
- Spike a WebGL prototype using current scene data to validate buffer, shader, and glyph atlas abstractions before committing to Phase 1 scope.
- Establish success metrics (frame time targets, determinism thresholds, visual parity acceptance tests) before full migration begins.
