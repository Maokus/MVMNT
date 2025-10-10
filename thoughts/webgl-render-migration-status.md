# WebGL Render Migration Status

_Last reviewed: 2025-04-12_

## Overview
The WebGL renderer now owns all production rendering. The legacy Canvas implementation has been
decommissioned outside development diagnostics. This document summarises the outcomes of phases 0
through 4 and captures the guardrails that keep WebGL deterministic in production.

## Phase outcomes
- **Phase 0 – Foundation:** Documented the renderer lifecycle contract, render object taxonomy, and
  parity testing hooks. The shared contract now lives in `docs/renderer-contract.md` with sign-off from
  runtime and export owners.
- **Phase 1 – WebGL Infrastructure:** Delivered the `WebGLRenderer`, context management utilities, and
  deterministic frame hashing. Prototype parity tests exercise Canvas and WebGL outputs across
  reference scenes.
- **Phase 2 – Render Object Migration:** Adapted primary primitives (shapes, images, text, particles)
  to GPU-friendly buffers. Introduced texture and glyph atlas caches with lifecycle diagnostics to
  ensure stable memory reuse.
- **Phase 3 – Scene Integration:** Wired `VisualizerCore` and `SceneRuntimeAdapter` to the shared
  contract, enabling feature-flagged WebGL playback and export. Added diagnostics to surface frame
  hashes, draw call counts, and performance timings.
- **Phase 4 – Decommission Canvas:** Removed the Canvas renderer from production pathways,
  gated the fallback behind development overrides, refreshed documentation, and promoted WebGL
  telemetry to production dashboards.

## Quality and parity safeguards
- Snapshot and hash-based parity tests cover interactive and export rendering modes.
- Diagnostics streaming provides context loss, buffer rebuild, and hash telemetry in CI, runtime
  tooling, and production dashboards.
- The Canvas fallback is locked behind development overrides for targeted debugging; production
  builds instantiate `WebGLRenderer` exclusively.

## Ongoing monitoring
- Expand fixtures that stress new GPU materials and instancing as they ship.
- Keep WebGL telemetry alert thresholds under review as new scenes land.
- Continue curating developer onboarding so WebGL debugging workflows stay first-class.
