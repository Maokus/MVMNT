# WebGL renderer migration summary

_Last reviewed: 2025-04-12_

## Completed work
### Renderer contract foundations
- Captured the shared renderer lifecycle (`init`, `resize`, `renderFrame`, `teardown`) and render object
  taxonomy in [`docs/renderer-contract.md`](../docs/renderer-contract.md).
- Stood up snapshot and frame-hash parity scaffolding that now underpins CI coverage for GPU and Canvas
  comparisons.

### GPU infrastructure and batching
- Shipped the production `WebGLRenderer` with context recovery, deterministic frame hashing, and material
  descriptors that keep shader uniforms declarative.
- Landed buffer, texture, and instancing helpers plus diagnostics on draw counts and GPU resource churn.

### Render object migration
- Ported rectangles, lines, particles, images, and text to GPU-backed adapters with shared lifecycle
  management so exports and live playback reuse buffers.
- Introduced glyph atlas management and texture caches with instrumentation that surfaces reuse metrics.

### Scene integration and rollout
- Wired `VisualizerCore` and `SceneRuntimeAdapter` to the shared contract, exposing WebGL via a runtime
  preference while retaining the Canvas renderer only for development overrides.
- Added telemetry hooks for context loss, buffer rebuild counts, and frame hashing to runtime diagnostics
  and CI.

### Canvas decommissioning
- Removed Canvas entry points from production builds, sanitised persisted renderer settings, and refreshed
  documentation to highlight WebGL-first workflows.
- Promoted WebGL telemetry dashboards and alerting so regressions surface quickly during rollout.

## Outstanding follow-ups
- Continue broadening regression fixtures that stress new GPU materials, instancing, and text effects as
  those features ship.
- Review telemetry thresholds with release engineering to ensure determinism alerts stay actionable as
  more WebGL scenes land.
- Expand developer onboarding to cover WebGL debugging tips and the limited Canvas fallback available in
  development builds.
- Monitor emerging browser APIs (for example, `OffscreenCanvas`) for opportunities to offload exports
  without compromising determinism or diagnostics.

## References
- [`docs/webgl-render-migration-status.md`](../docs/webgl-render-migration-status.md)
- [`docs/renderer-contract.md`](../docs/renderer-contract.md)
