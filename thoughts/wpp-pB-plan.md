# WebGL Polish Phase B Execution Plan

_Last updated: 2025-04-24_

## Purpose

Detail the concrete implementation steps for migrating the interactive preview
and export stack to render exclusively through a `webgl2` context, retiring the
Canvas 2D compositor everywhere except where text rasterisation truly requires
it.

## Snapshot of Current Architecture

- `src/core/visualizer-core.ts:27` sets up a 2D compositor on the visible
  preview canvas and mirrors WebGL output via `_blitWebGLSurface()`.
- `VisualizerBootstrap` (`src/context/visualizer/useVisualizerBootstrap.ts` and
  `VisualizerContext.tsx`) instantiates `MIDIVisualizerCore` with a single DOM
  canvas and assumes the core manages any secondary surfaces.
- `WebGLRenderer` lives in `src/core/render/webgl/webgl-renderer.ts`, pulling
  frames from an offscreen surface and still leaning on ad-hoc 2D contexts for
  glyph upload helpers (`glyph-atlas.ts`) and GIF export surfaces.
- Export pipelines (`ImageSequenceGenerator`, `VideoExporter`) request whatever
  canvas the core reports; today that is the composited 2D surface which implies
  implicit downscale when source FBO differs.
- Multiple feature modules still call `getContext('2d')` on the main workspace
  canvas (`AnimationTestPage`, `VisualizerCore`, `modular-renderer.ts`, text and
  GIF render objects). Most of these must be rerouted or retired once we rely on
  a single WebGL2 surface.

## Guiding Principles

- The viewport canvas created in React becomes the only onscreen rendering
  surface. `VisualizerCore` acquires `webgl2` once, caches it, and hands the raw
  WebGL2 context to every caller who needs GPU work.
- Resize math operates directly on that canvas: width/height and viewport are
  set in lockstep with device pixel ratio. No intermediate copy or blit path
  remains in the steady-state render loop.
- Canvas 2D usage is constrained to glyph atlas preparation (potentially via
  `OffscreenCanvas`) and any legacy export helpers until they are ported. All
  other `getContext('2d')` accessors are either deleted or guarded behind
  explicit text-render-only utilities.
- Context-lost handling, diagnostics, and export routines observe the same
  WebGL2 context so parity between preview and exported frames is guaranteed.

## Workstreams & Tasks

### 1. Single Surface Ownership

- Refactor `MIDIVisualizerCore` so `_initCompositor` requests
  `canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true })`
  and bails with a descriptive error if unavailable. Retire `_ensureWebGLSurface`
  and `_blitWebGLSurface` by making `this.canvas` the WebGL surface.
- Update renderer factories: the default modular (2D) renderer remains available
  only when `allowCanvasFallback` is true, but the primary path initialises the
  WebGL renderer against the single surface and stores the acquired context type
  (`webgl2` expected, `webgl` tolerated with guarded metrics).
- Adjust bootstrap/init flows so exports and diagnostics read the now-shared
  WebGL canvas reference instead of a composited 2D surface.
- Hard-deprecate `_allowCanvasFallback` toggles for normal runtime builds and
  gate them behind an explicit developer flag so the UI cannot silently revert to
  2D.

### 2. Resize & DPR Alignment

- Replace `_syncWebGLSurfaceSize` with logic that sets `canvas.width/height`
  using layout bounds multiplied by `devicePixelRatio`. Immediately update
  `gl.viewport` in `resize()` and the frame loop to prevent stale viewport sizes.
- Audit all resize call paths (`VisualizerProvider`, window resize listeners,
  timeline zoom interactions) to ensure they delegate through the updated core
  method and pass CSS pixel dimensions instead of backing store values.
- Add unit coverage around the resize helper to assert that given a CSS rect and
  DPR, the canvas width/height and viewport match expectations.

### 3. Render Loop & Diagnostics

- Simplify `_renderFrame` to skip compositing work: remove `clearRect` /
  `drawImage` operations and instead rely on WebGL clear/draw inside the renderer.
- Update diagnostics overlays to report the live context kind and backing-store
  dimensions pulled straight from `canvas.width/height` and `gl.drawingBufferWidth`.
- Ensure the render invalidation logic respects the new single-surface design,
  especially where `renderer.resize` or `renderer.render` previously received a
  synthetic canvas argument.

### 4. Export Path Alignment

- Trace `ImageSequenceGenerator` and `VideoExporter` to confirm they now render
  directly from the WebGL2 context (using the onscreen canvas or an explicitly
  created WebGL2 OffscreenCanvas clone when running headless tests).
- Remove any temporary 2D canvas usage during export except where format
  encoders demand CPU-side pixel copies (`gl.readPixels` → buffer → encoder).
- Validate export resolution parity by comparing `canvas.width/height` against
  requested output size and by adding assertions before encoding kicks off.

### 5. Text Rendering Containment

- Keep `glyph-atlas.ts` 2D logic but migrate it to use `OffscreenCanvas` where
  available. Introduce a central `getTextAtlasCanvas()` helper so no other module
  touches `getContext('2d')` on the main canvas.
- Audit `render-objects/text.ts` and related components to ensure they populate
  GPU textures via typed arrays or pre-uploaded atlases. Document this pipeline
  inside the renderer docs updated for Phase B.
- Add runtime guards (development only) that throw if any module outside the
  text pipeline requests a 2D context from the preview canvas.

### 6. Context Lifecycle & Recovery

- Attach `webglcontextlost` / `webglcontextrestored` listeners directly on the
  primary canvas inside `MIDIVisualizerCore`. Route these events through the
  existing recovery hooks and disable automatic Canvas 2D fallbacks.
- Implement a lightweight watchdog in diagnostics that surfaces the last context
  loss timestamps and whether recovery succeeded without reload.

## Dependencies & Coordination

- Phase A instrumentation outputs (see `thoughts/webgl-polish-phase-a-report.md`)
  must be reviewed so resize calculations and context acquisition fixes are
  based on verified data.
- Export tooling updates may touch build-time Rollup configs if headless rendering
  changes; coordinate with build/release maintainers when adjusting CLI scripts.
- Any lingering `ModularRenderer` consumers (e.g., legacy automation tests) need
  a migration path or a temporary compatibility switch to avoid breaking tooling.

## Validation Plan

- Automated: extend Vitest suites to cover resize math, context acquisition, and
  text pipeline guards. Ensure CI runs headless WebGL2 tests (via `@vitest/webgl` /
  `headless-gl`).
- Manual: verify preview scaling on standard DPR values (1x, 1.5x, 2x) and capture
  before/after frame metrics in the diagnostics overlay. Exercise context loss via
  Chrome DevTools to confirm recovery without fallback.
- Export parity: render representative scenes before/after migration and compare
  pixel dimensions and hash snapshots to ensure no regression.

## Risks & Mitigations

- **WebGL2 availability gaps:** Provide a controlled dev-only flag to re-enable
  the 2D fallback when testing on unsupported hardware. Document the limitation.
- **Rendering regressions during rollout:** Maintain feature flag hooks so the
  new single-surface path can be toggled for canary builds while metrics are
  gathered.
- **Export pipeline drift:** Schedule joint QA runs with tooling owners to ensure
  headless exports keep working once the compositor goes away.
