# WebGL Render Migration Plan — Phase 2 Detailed Planning

_Last reviewed: 2025-03-25_

## Summary
- **Objective:** Complete the migration of Canvas render objects to GPU-backed implementations without regressing animation timing, layering order, or export determinism.
- **Scope:** Covers render object adapters, GPU resource lifecycle, glyph atlas pipeline, batching strategies, and validation activities required to ship Phase 2.
- **Status:** ✅ Completed 2025-03-25 — implementation merged with automated coverage.
- **Related references:**
  - [WebGL Render Migration Plan](./webgl-render-migration-plan.md)
  - [`docs/renderer-contract.md`](../docs/renderer-contract.md) for the shared renderer interface and determinism guarantees.

## Milestone Breakdown
### Milestone A — Adapter Interfaces Stabilised
_Status: ✅ Completed 2025-03-25_
- Finalised the `WebGLRenderAdapter` and geometry source definitions consumed by the renderer and upcoming scene adapter.
- Documented reusable layout helpers for rectangles, lines, sprites, and particles with explicit buffer ownership semantics.
- Deliverable: Adapter API shipped in `src/core/render/webgl/adapter.ts` with translation coverage in the phase 2 Vitest suite.

### Milestone B — Core Primitive Ports
_Status: ✅ Completed 2025-03-25_
- Ported rectangles, lines, images, and particles to GPU-backed primitives with shared shader descriptors and batching.
- Bound runtime image sources and glyph atlases through the central `TextureCache`, ensuring deterministic texture lifecycle.
- Deliverable: Automated regression coverage in `webgl-renderer.phase2.test.ts` validates draw output and texture bindings.

### Milestone C — Text Rendering Pipeline
_Status: ✅ Completed 2025-03-25_
- Landed a reusable glyph atlas with lazy page uploads and text layout batching consistent with Canvas anchor semantics.
- Surfaced atlas reuse metrics through adapter diagnostics for future eviction tuning.
- Deliverable: Text rendering parity exercised by adapter tests with atlas texture handles verified.

### Milestone D — Resource Lifecycle & Diagnostics
_Status: ✅ Completed 2025-03-25_
- Added adapter-level geometry/texture counters surfaced via `WebGLRenderer` diagnostics.
- Validated texture/geometry reuse through unit coverage and renderer instrumentation.
- Deliverable: Diagnostics payload now reports primitive counts and texture budgets for CI baselines.

### Milestone E — Validation & Sign-off
_Status: ✅ Completed 2025-03-25_
- Established automated parity checks for particles, UI primitives, and text in the new Vitest suite.
- Recorded migration completion in the master plan with follow-up items deferred to Phase 3 integration.
- Deliverable: Phase 2 sign-off captured in `webgl-render-migration-plan.md` with resource diagnostics documented.

## Workstreams & Owners
- **Adapter API & primitives:** Rendering platform team (TBD)
- **Text pipeline:** Graphics tooling subgroup (TBD)
- **Diagnostics & tooling:** Developer experience team (TBD)
- **Validation:** Quality engineering with runtime partner (TBD)

## Risks & Mitigations
- **Risk:** Adapter abstraction drift causing duplication. **Mitigation:** Schedule weekly reviews with runtime owners to validate shared interface usage.
- **Risk:** Glyph atlas memory spikes during exports. **Mitigation:** Implement configurable atlas size caps and stream eviction metrics to the diagnostics overlay.
- **Risk:** Particle system update cost exceeds GPU gains. **Mitigation:** Prototype compute-light buffer updates first and delay complex particle shaders to Phase 3 if needed.

## Open Questions
- Do we require tooling to diff shader-generated colors versus Canvas gradients beyond existing snapshot tolerance?
- Should glyph atlas generation support background precomputation for common fonts to reduce first-render latency?
- What thresholds should trigger automated alerts for resource leaks during CI runs?

## Next Steps
- Hand off the shipped adapter API to Scene Integration owners and start Phase 3 planning reviews.
- Monitor renderer diagnostics telemetry during early WebGL scene opt-in to validate resource baselines.
- Capture migration learnings and update onboarding materials ahead of Phase 3 execution.
