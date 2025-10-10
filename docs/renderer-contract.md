# Renderer Contract

_Last reviewed: 2025-04-05_

## Overview
The `RendererContract` describes the lifecycle that both the legacy Canvas renderer and the
upcoming WebGL renderer must implement. It anchors shared responsibilities for context management,
frame submission, export capture, and teardown so `MIDIVisualizerCore` can swap implementations
without changing its call sites.

- **Interface location:** `src/core/render/renderer-contract.ts`
- **Current implementers:** `ModularRenderer` (Canvas 2D), `WebGLRenderer`
- **Consumers:** `MIDIVisualizerCore`, export pipelines, and WebGL runtime diagnostics

## Lifecycle methods
All renderers MUST implement the following lifecycle entry points.

### `init(options)`
- Accepts an `HTMLCanvasElement`, optional pre-created rendering context, and device pixel ratio
  hint.
- Returns the acquired rendering context plus the resolved context type (`canvas2d`, `webgl`, or
  `webgl2`).
- Responsible for attaching context loss handlers and any renderer-specific caches.

### `resize(payload)`
- Invoked whenever the host canvas changes size.
- Resizes the underlying drawing buffer and updates any pixel ratio derived scaling factors.
- Must be safe to call before or after `init` (no-ops prior to initialization).

### `renderFrame(input)`
- Receives the scene configuration snapshot, render object list, target timestamp, and optional
  frame metadata (`interactive` vs `export`).
- Executes drawing commands for the active frame while respecting deterministic ordering.
- Implementations should prefer cached GPU buffers or canvas paths over per-frame allocation.

### `captureFrame(request)`
- Used by export flows to produce deterministic frame artifacts.
- Mirrors `renderFrame` inputs but specifies an output format (`imageData`, `dataURL`, or `blob`).
- Must render against an off-screen target to avoid mutating the interactive canvas.

### `teardown()`
- Releases event listeners, GPU resources, and cached buffers.
- Called when `MIDIVisualizerCore.cleanup()` runs so exports and workspace sessions dispose cleanly.

## Export hooks
Exports reuse the same contract with explicit metadata:

- `renderFrame` runs with `target.mode = 'export'` to signal deterministic timing semantics.
- `captureFrame` provides the artifact required by image or video encoders while preserving the
  hashable pixel buffer.
- Implementations should emit debug traces (context loss, buffer rebuilds, frame hashes) via the shared
  instrumentation utilities shipped with the WebGL renderer rollout.

## Render object taxonomy
Render objects fall into four categories, each mapping to future GPU abstractions:

| Category            | Canvas attributes (today)                             | GPU mapping (future)              |
| ------------------- | ----------------------------------------------------- | -------------------------------- |
| Vector primitives   | Path commands, stroke/fill styles, transforms         | Static/indexed vertex buffers + per-instance uniforms |
| Raster images       | DrawImage calls with source rectangles and opacity    | Texture samplers with atlas coordinates + alpha uniforms |
| Text                | Canvas font/measure APIs and manual kerning handling  | Glyph atlas textures + per-glyph instance data |
| Particles/effects   | Iterated arc/line draws driven by scene state         | Instanced geometry buffers + dynamic uniform blocks |

All render objects MUST expose deterministic getters for bounds and colors so hit testing and frame
hashing stay consistent across renderers.

## Test harness scaffolding
Runtime and export owners agreed to the following scaffolding for parity checks:

- **Snapshot comparison:** Use existing Canvas captures as the baseline, diff against WebGL output
  with the tolerance thresholds codified in the parity harness.
- **Frame hashing:** Compute a stable hash across RGBA buffers in both playback and export modes to
  detect divergence without full image diffs. Surface hashes through the diagnostics store for CI.
- **Scene fixtures:** Reuse the `failedtests` and `src/persistence/__fixtures__` assets to pin common
  geometry, text, and particle scenarios for deterministic testing. Extend fixtures when onboarding
  new GPU-centric primitives.

These hooks unlock WebGL regression coverage without blocking Canvas while the migration proceeds.

## Sign-off
- Runtime owner (✅ 2025-03-15)
- Export owner (✅ 2025-03-15)
