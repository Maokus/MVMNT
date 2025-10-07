# WebGL Render Migration Plan

_Last reviewed: 2024-05-05_

## Summary
- **Objective:** Replace the existing 2D canvas render system with a WebGL-based pipeline for improved performance and shader-driven visuals.
- **Scope:** Core render loop, renderable object abstractions, material system, batching, and compatibility layers for existing scenes.
- **Status:** Draft plan pending architectural validation.

## Current Challenges
- CPU-bound rendering due to per-frame Canvas 2D draw calls.
- Lack of GPU-accelerated effects (blending, shaders, instancing) limits complex scenes.
- Render objects tightly coupled to 2D context APIs, complicating reuse.
- Scene graph updates assume immediate mode rendering without retained state on the GPU.

## Goals
- Establish a WebGL renderer abstraction that mirrors the existing render system's responsibilities while enabling GPU pipelines.
- Introduce a render object interface compatible with WebGL resources (buffers, shaders, textures).
- Maintain feature parity during migration, preserving existing scenes and animations.
- Provide a compatibility layer to phase out Canvas 2D without blocking ongoing feature work.

## Architectural Decisions
- **Renderer Core:** Implement a `WebGLRenderer` that conforms to the current renderer contract (init, resize, render frame) while managing WebGL context lifecycle.
- **Render Objects:** Define `IRenderObject` with lifecycle hooks (`prepare`, `updateBuffers`, `draw`) to bridge scene updates and GPU resources.
- **Material System:** Introduce shader/material descriptors decoupled from render objects, allowing shared programs and uniforms.
- **Batching:** Support geometry batching via vertex/index buffers to reduce draw calls for repeated primitives.
- **State Management:** Store GPU resource handles within render objects to avoid redundant creation each frame.
- **Compatibility:** Add a 2D fallback renderer implementing the same interface to allow staged migration per scene.

## Migration Phases
### Phase 0: Foundation (Blocking)
- Audit existing render system responsibilities and document touchpoints with scene state.
- Establish shared renderer interface covering initialization, resize, frame submission, and teardown.
- Identify render object categories (e.g., meshes, text, particle systems) and map to future WebGL counterparts.

### Phase 1: WebGL Infrastructure (Blocking)
- Scaffold WebGL context management (context acquisition, resize handling, lost context recovery).
- Implement buffer and shader utilities (creation, compilation, binding helpers) with error reporting.
- Define material/shader descriptor schema supporting vertex/fragment programs and uniform bindings.
- Build a prototype render loop that clears the frame and draws a simple test geometry via the new abstractions.

### Phase 2: Render Object Migration (Incremental)
- Wrap existing render objects with adapters that populate vertex data into WebGL buffers.
- Port sprite/rectangle primitives to use textured quads with instanced or batched draws.
- Implement text rendering strategy (bitmap fonts or SDF) aligned with current typography requirements.
- Introduce uniform update pathways for animations (e.g., color, transform, opacity).

### Phase 3: Scene Integration (Incremental)
- Update scene graph to emit render commands compatible with the new `IRenderObject` lifecycle.
- Provide a compatibility layer allowing scenes to opt into WebGL per feature flag.
- Validate frame timing and visual parity against Canvas 2D output, adjusting batching/precision as needed.

### Phase 4: Decommission 2D Renderer (Stretch)
- Migrate remaining render objects and effects to WebGL implementations.
- Remove Canvas 2D renderer paths once parity metrics are met and QA sign-off is complete.
- Document migration steps and update developer onboarding materials.

## Open Questions
- Text rendering approach: Should we adopt signed distance fields, cached glyph atlases, or rely on existing Canvas-based rasterization for now?
- Post-processing effects roadmap: What initial shader effects are mandatory for parity (e.g., blur, bloom)?
- Asset pipeline requirements: Do we need tooling for precomputing geometry/texture atlases before migration completes?

## Risks & Mitigations
- **Risk:** WebGL context loss leading to blank frames. **Mitigation:** Centralize context restoration logic and maintain CPU-side copies of critical buffers.
- **Risk:** Performance regressions from naive buffer updates. **Mitigation:** Profile buffer uploads, adopt dynamic draw usage hints, and cache geometry where possible.
- **Risk:** Increased complexity for feature teams. **Mitigation:** Provide guidelines, reference implementations, and training sessions during rollout.

## Next Steps
- Review plan with rendering and scene state owners for feasibility feedback.
- Spike a WebGL prototype using current scene data to validate buffer and shader abstractions.
- Establish success metrics (frame time targets, visual parity acceptance tests) before full migration begins.
