# WebGL Polish Plan 1

_Last reviewed: 2025-04-15_

## Status & Scope

-   **Status:** Draft — pending validation of root-cause investigations and implementation staffing.
-   **Owner:** Rendering guild (coordination led by Visualizer Platform).
-   **Related plans:** Builds upon [WebGL Render Migration Plan](./webgl-render-migration-plan.md) Phase 4 outcomes and feeds future runtime docs in `/docs` once stabilised.

## Background

The workspace currently instantiates the WebGL workflow by default but composites frames through a Canvas 2D surface. The preview canvas reports a `2d` context despite the WebGL renderer being active, implying that rendered frames are copied back into a 2D buffer each tick. This indirection likely causes:

-   **Undersized output:** Scaling artefacts from drawing an offscreen WebGL buffer onto a differently sized 2D canvas.
-   **Severe UI lag:** Extra GPU → CPU → GPU copies, synchronous readbacks for texture uploads, and redundant layout thrash when the compositor swaps buffers.

## Goals

1. Render the entire interactive preview directly to a `webgl2` context with no 2D canvas intermediary (except for glyph atlas generation for text).
2. Resolve scaling discrepancies so the visualisation fills its intended viewport.
3. Improve interactive frame rate to target ≥ 55 FPS on baseline development hardware.
4. Harden the renderer lifecycle (resize, lost-context recovery, teardown) to avoid regressions when the 2D fallback is removed.

## Non-goals

-   Reintroducing the Canvas 2D fallback for production. Diagnostic tooling may retain a hidden toggle but will not block the migration.
-   Redesigning the UI layout system; only renderer integration points are in scope.

## Symptom Triage & Root-Cause Validation (Phase A)

1. **Audit context creation paths.** Instrument `VisualizerCore` and `RendererHost` to log the actual context type acquired. Confirm whether the displayed canvas is created with `webgl` then transferred or if a second 2D canvas mediates blitting.
2. **Inspect render targets.** Trace framebuffer bindings inside `WebGLRenderer` to ensure we draw to the default framebuffer sized to the viewport. Verify whether exports and preview share an offscreen framebuffer.
3. **Measure copy costs.** Use performance marks around any `gl.readPixels`, `texSubImage2D` with DOM sources, or `ctx.drawImage` bridging WebGL → Canvas 2D. Capture flamecharts via Chrome DevTools.
4. **Validate device pixel ratio handling.** Check how DPI and responsive resizing propagate. Confirm CSS vs. backing store sizes and the effect on the quarter-size rendering.

_Deliverables:_ Debug report summarizing actual context acquisition, framebuffer flow, and timing data. This should graduate into `/thoughts/webgl-runtime-notes.md` once confirmed.

## Direct WebGL2 Rendering (Phase B)

1. **Single canvas ownership.** Refactor the preview surface so `VisualizerCanvas` requests `canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true })` once and shares it with `WebGLRenderer`. Remove any intermediate 2D contexts in React components.
2. **Resize pipeline.** Update resize observers to call `gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio)` and set `canvas.width/height` accordingly. Ensure CSS size matches layout bounds to eliminate quarter-scale output.
3. **Lost-context handling.** Attach `webglcontextlost`/`webglcontextrestored` listeners directly on the main canvas and funnel through existing recovery hooks. Remove 2D fallback paths that attempted to mask lost contexts.
4. **Export alignment.** Verify export routines operate on the same WebGL2 context or an OffscreenCanvas derived from it, avoiding downscale copies before encoding.

## Text Rendering Containment (Phase C)

1. **Glyph atlas via OffscreenCanvas.** Constrain 2D context usage to an `OffscreenCanvas` (or hidden `<canvas>`) strictly for baking glyph atlases. Document and assert that no `CanvasRenderingContext2D` touches the main preview surface.
2. **Upload flow.** Batch atlas uploads using `gl.texSubImage2D` with typed arrays to avoid layout-triggering DOM image sources.
3. **Diagnostics.** Add runtime assertions that guard against acquiring 2D contexts elsewhere (e.g., wrapping `HTMLCanvasElement.prototype.getContext`).

## Performance Optimisation (Phase D)

1. **Frame pacing.** Revisit the render loop to ensure it relies on `requestAnimationFrame` exclusively, avoids redundant state changes, and batches draw calls by material where possible.
2. **Buffer lifecycle.** Audit per-frame allocations; migrate transient buffers to persistent `Map` caches keyed by render object IDs. Ensure `gl.bufferSubData` is used instead of re-allocating buffers every frame.
3. **Texture management.** Consolidate framebuffer and texture reuse. Pre-size render targets for blur or post-processing passes to eliminate repeated `gl.createTexture` calls.
4. **Profiling harness.** Extend existing Vitest + headless-gl suites to capture frame timing counters and guard performance regressions.

## Rollout & Validation (Phase E)

1. **QA scenarios.** Execute representative projects (dense particle scenes, typography-heavy layouts, automation-heavy audio sync) and capture before/after FPS + resolution metrics.
2. **Regression tests.** Update snapshot and hashing harnesses to assert WebGL2 output parity without the Canvas fallback. Add tests ensuring canvas size matches the layout.
3. **Instrumentation dashboards.** Wire frame time, draw call count, and texture upload metrics into the diagnostics overlay for ongoing monitoring.
4. **Documentation.** Publish updated renderer lifecycle notes in `/docs`, including troubleshooting for WebGL2-only deployments and glyph atlas constraints.

## Risks & Mitigations

-   **Legacy browser support:** Some environments may lack WebGL2. Mitigation: retain a behind-the-scenes compatibility toggle for manual QA only and document the requirement.
-   **Text rendering parity:** Moving glyph handling off the main canvas may introduce kerning differences. Mitigation: expand glyph atlas regression tests and compare exported frames.
-   **Context loss recovery:** Removing the Canvas fallback raises stakes on WebGL resilience. Mitigation: increase coverage of context loss simulation in tests and ensure clean recovery paths.

## Open Questions

1. Do we require a temporary dual-render mode for customer beta validation, or can we ship WebGL2-only to production once metrics are green?
2. Should export still render via an offscreen framebuffer for deterministic capture, or can we reuse the onscreen default framebuffer now that scaling issues are fixed?
3. Are there platform-specific constraints (e.g., Safari iPad) that necessitate retaining WebGL1 fallback code during the transition window?

## Decision Log

-   _2025-04-15:_ Confirmed plan status as Draft pending validation of Phase A investigations.
