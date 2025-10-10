# WebGL polish progress

_Last reviewed: 2025-05-18_

## Phase A – Observability uplift
- Instrumented `VisualizerCore` and `WebGLRenderer` to log context acquisition, framebuffer bindings,
  and lost-context recovery so triage can trace preview startup.
- Captured copy and readback timings around `_blitWebGLSurface`, `drawImage`, and `gl.readPixels` to
  quantify GPU → CPU → GPU costs that previously hid in the compositor.
- Logged viewport sizing across CSS layout, backing store, and device pixel ratio to explain the
  quarter-scale preview symptoms.

## Phase B – Direct WebGL2 rendering
- Consolidated preview rendering onto a single WebGL2 surface with retained context ownership and
  lost-context recovery that reuses the same canvas.
- Brought CSS, backing-store, and GL viewport sizing into alignment to eliminate quarter-scale output
  while keeping interaction math stable under high DPR displays.
- Verified resize behaviour, hit testing, and diagnostics overlays through automated coverage and manual
  QA, closing Phase B of the polish initiative.

## Migration outcomes
- WebGL now owns all production rendering paths; the Canvas renderer remains only as a guarded
  development fallback.
- Render objects (rectangles, lines, particles, images, text) share GPU-backed adapters with lifecycle
  diagnostics and deterministic frame hashing.
- Snapshot and parity testing harnesses cover interactive and export rendering, supported by telemetry on
  context loss, buffer rebuilds, and frame timing.

## Reference material
- [`docs/renderer-contract.md`](./renderer-contract.md)
- [`thoughts/outstanding-work.md`](../thoughts/outstanding-work.md)
