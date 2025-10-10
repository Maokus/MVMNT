# WebGL Polish Phase A Report

_Last reviewed: 2025-04-16_

## Status

- **State:** Completed — instrumentation merged for Phase A triage items.
- **Owner:** Rendering guild diagnostics pod.
- **Scope:** Observability of the existing WebGL pipeline prior to direct WebGL2 migration.

## Findings

### Context acquisition

- `MIDIVisualizerCore` still instantiates the preview surface as a `canvas2d` compositor and only spins up WebGL on a detached surface via `_ensureWebGLSurface`. New diagnostics log the compositor context through `[RendererDiagnostics] compositor-context-acquired` and capture the first WebGL context handshake with `[RendererDiagnostics] webgl-context-acquired`. 【F:src/core/visualizer-core.ts†L88-L121】【F:src/core/visualizer-core.ts†L216-L249】
- `WebGLRenderer` now emits `[RendererDiagnostics] webgl-context-ready` once it acquires a context, confirming whether WebGL1 or WebGL2 is in use and the underlying framebuffer dimensions. 【F:src/core/render/webgl/webgl-renderer.ts†L32-L80】

### Framebuffer and render-target flow

- WebGL rendering still targets an offscreen `<canvas>` that mirrors the 2D canvas size. The first frame emits `[RendererDiagnostics] webgl-framebuffer-binding` to confirm that rendering happens against the default framebuffer rather than a custom FBO. 【F:src/core/visualizer-core.ts†L216-L249】【F:src/core/render/webgl/webgl-renderer.ts†L120-L184】
- After each WebGL frame, `_blitWebGLSurface` composites the detached surface onto the visible 2D canvas via `drawImage`. Diagnostics now record `[RendererDiagnostics] webgl-surface-blitted` with the copy duration to quantify the compositing cost. 【F:src/core/visualizer-core.ts†L250-L292】

### Copy and readback costs

- The blit step is the only per-frame GPU→CPU→GPU bridge in interactive mode, and its timing is now captured once to seed profiling comparisons. 【F:src/core/visualizer-core.ts†L250-L292】
- Frame hashing invokes `gl.readPixels` when diagnostics sampling is enabled. A one-time `[RendererDiagnostics] webgl-readpixels` log captures how long that readback takes for the current viewport size so we can contrast interactive vs. export workloads. 【F:src/core/render/webgl/frame-hash.ts†L20-L53】

### Device pixel ratio and sizing

- `WebGLRenderer.resize` continues to derive the framebuffer size from `width * devicePixelRatio`. The initial diagnostic `[RendererDiagnostics] webgl-viewport-initialized` records both CSS and backing-store dimensions so we can confirm quarter-scale preview symptoms against the DOM layout. 【F:src/core/render/webgl/webgl-renderer.ts†L82-L136】
- Because the on-screen canvas width/height attributes are tied to export settings, any mismatch between CSS layout (`displaySize`) and backing store is surfaced via the logged ratios rather than silently blitting a mis-sized surface. 【F:src/workspace/panels/preview/PreviewPanel.tsx†L13-L90】

## Next steps

- Capture logs while reproducing the quarter-scale preview to correlate CSS/container dimensions with the recorded framebuffer size.
- Feed the collected timing samples into `/thoughts/webgl-runtime-notes.md` once validated, then proceed with Phase B refactors to eliminate the 2D compositor.
