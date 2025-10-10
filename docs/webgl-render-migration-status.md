# WebGL Render Migration Status

_Last reviewed: 2025-04-05_

## Overview
The WebGL renderer has completed the foundational phases required to match the legacy Canvas
implementation. This document summarises the outcomes of phases 0 through 3 and highlights the
operational guardrails in place before decommissioning the Canvas path.

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

## Quality and parity safeguards
- Snapshot and hash-based parity tests cover interactive and export rendering modes.
- Diagnostics streaming provides context loss, buffer rebuild, and hash telemetry in CI and runtime
  tooling.
- Canvas fallback remains available behind the existing feature flag for incremental rollout and
  regression investigation.

## Outstanding work before Canvas removal
- Confirm no feature teams rely on Canvas-only rendering paths.
- Expand fixtures that stress new GPU materials and instancing as they ship.
- Finalise developer onboarding content so WebGL debugging workflows are first-class.
