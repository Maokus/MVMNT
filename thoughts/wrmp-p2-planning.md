# WebGL Render Migration Plan — Phase 2 Detailed Planning

_Last reviewed: 2025-03-19_

## Summary
- **Objective:** Complete the migration of Canvas render objects to GPU-backed implementations without regressing animation timing, layering order, or export determinism.
- **Scope:** Covers render object adapters, GPU resource lifecycle, glyph atlas pipeline, batching strategies, and validation activities required to ship Phase 2.
- **Status:** In planning — pending review by rendering and export owners.
- **Related references:**
  - [WebGL Render Migration Plan](./webgl-render-migration-plan.md)
  - [`docs/renderer-contract.md`](../docs/renderer-contract.md) for the shared renderer interface and determinism guarantees.

## Milestone Breakdown
### Milestone A — Adapter Interfaces Stabilised
_Status: Open_
- Finalise the adapter interface that maps legacy `RenderObject` properties to WebGL buffer descriptors and uniform payloads.
- Produce TypeScript definitions for geometry payloads (rectangles, lines, sprites, particles) that Phase 3 scene integration can reuse.
- Define buffer usage patterns (static, dynamic) and ownership semantics for upload staging.
- Deliverable: Draft adapter API merged behind a feature flag with unit tests covering property translation.

### Milestone B — Core Primitive Ports
_Status: Open_
- Rectangle & line primitives: Implement instanced buffer layouts with shared shaders supporting fill, stroke, and dashed variants.
- Image primitives: Support texture atlas bindings, color transforms, and mip handling for export resolution parity.
- Particle systems: Introduce per-instance attribute buffers with spawn/update hooks routed through the existing animation scheduler.
- Deliverable: Regression suite scenes render via WebGL for the above primitives with frame hash parity within tolerance.

### Milestone C — Text Rendering Pipeline
_Status: Open_
- Integrate glyph atlas generator leveraging existing font loader; cache atlas pages per font weight/style.
- Implement glyph layout batching that respects kerning data and baseline alignment identical to Canvas.
- Add atlas eviction policy metrics and alerts to avoid thrashing during long exports.
- Deliverable: Text-heavy regression scene renders identically between Canvas and WebGL with atlas reuse confirmed via metrics.

### Milestone D — Resource Lifecycle & Diagnostics
_Status: Open_
- Instrument buffer/texture creation, reuse, and disposal with debug counters surfaced through the renderer diagnostics channel.
- Add automated tests validating that resource pools do not leak across frame boundaries or exports.
- Provide developer tooling (CLI or debug overlay) to inspect live GPU resource state during validation.
- Deliverable: Diagnostics reports demonstrate stable resource counts across playback/export loops, with CI guardrails in place.

### Milestone E — Validation & Sign-off
_Status: Open_
- Expand snapshot test coverage to include particle-heavy, UI, and text scenes under both runtime and export flows.
- Run cross-team review session to confirm parity metrics and capture go/no-go decisions for Phase 3 integration.
- Document residual gaps and mitigation plans in the main migration plan.
- Deliverable: Sign-off memo filed with rendering and export owners, linked from the main plan.

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
- Circulate this document for review with rendering and export owners by 2025-03-21.
- Draft adapter interface proposal and schedule design review for Milestone A sign-off.
- Prepare regression scene list with quality engineering to ensure coverage before validation work begins.
