# WebGL Polish Plan 1

_Last reviewed: 2025-04-23_

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

1. **Audit context creation paths.** Instrument `VisualizerCore` and `RendererHost` to log the actual context type acquired and the call stack that requests it. Confirm whether the displayed canvas is created with `webgl` then transferred or if a second 2D canvas mediates blitting.
2. **Inspect render targets.** Trace framebuffer bindings inside `WebGLRenderer` to ensure we draw to the default framebuffer sized to the viewport. Record how exports obtain their framebuffer so we can quantify divergence between preview and capture.
3. **Measure copy costs.** Use performance marks around any `gl.readPixels`, `texSubImage2D` with DOM sources, or `ctx.drawImage` bridging WebGL → Canvas 2D. Capture flamecharts via Chrome DevTools and annotate high-water timings.
4. **Validate device pixel ratio handling.** Check how DPI and responsive resizing propagate by logging CSS vs. backing store dimensions on resize events. Confirm the relationship to the observed quarter-size rendering.
5. **Context lifecycle sampling.** Trigger context loss (Chrome devtools `webglcontextlost` tool) and observe which fallbacks activate, logging all handlers invoked.

_Deliverables:_ Debug report summarizing actual context acquisition, framebuffer flow, and timing data. This should graduate into `/thoughts/webgl-runtime-notes.md` once confirmed. See [WebGL Polish Phase A Report](./webgl-polish-phase-a-report.md) for current findings and instrumentation notes.

_Acceptance criteria:_

- Console logs or trace captures demonstrate the exact context types requested and acquired by each canvas consumer.
- Captured flamecharts (attached in the report) highlight any WebGL → 2D copy hotspots with quantified durations.
- Resize experiments document both CSS and backing store dimensions before and after fixes, showing the mismatch responsible for quarter-scale rendering.
- Simulated context-loss runbook exists with observed handler order and any fallback activations clearly described.

## Direct WebGL2 Rendering (Phase B)

1. **Single canvas ownership.** Refactor the preview surface so `VisualizerCanvas` requests `canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true })` once and shares it with `WebGLRenderer`. Remove any intermediate 2D contexts in React components and update dependency injection so preview overlays receive a reference to the existing WebGL context.
2. **Resize pipeline.** Update resize observers to call `gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio)` and set `canvas.width/height` accordingly. Ensure CSS size matches layout bounds to eliminate quarter-scale output, and add unit tests that mock resize events to verify the math.
3. **Lost-context handling.** Attach `webglcontextlost`/`webglcontextrestored` listeners directly on the main canvas and funnel through existing recovery hooks. Remove 2D fallback paths that attempted to mask lost contexts while ensuring renderer state is rehydrated from serialized descriptors.
4. **Export alignment.** Verify export routines operate on the same WebGL2 context or an OffscreenCanvas derived from it, avoiding downscale copies before encoding. Document any remaining divergences in the report for follow-up work.
5. **Preview instrumentation.** Update diagnostics overlays to report the active context type, buffer dimensions, and last resize timestamp so QA can confirm the new pipeline in builds.

_Acceptance criteria:_

- `VisualizerCanvas` acquires `webgl2` exactly once per mount (confirmed via unit tests or logging) and no component requests a `2d` context in the preview path.
- Automated tests demonstrate correct viewport and backing store sizing across at least three representative viewport dimensions (e.g., 720p, 1080p, 4K).
- Context loss simulation recovers without reloading the page, with the preview resuming rendering within two frames.
- Exported renders share identical resolution with the on-screen preview, confirmed by pixel dimension assertions in the export harness.
- Diagnostics overlay exposes the new context telemetry and matches observed values during manual QA sessions.

## Text Rendering Containment (Phase C)

1. **Glyph atlas via OffscreenCanvas.** Constrain 2D context usage to an `OffscreenCanvas` (or hidden `<canvas>`) strictly for baking glyph atlases. Document and assert that no `CanvasRenderingContext2D` touches the main preview surface, and add lint rules or runtime guards to enforce this contract.
2. **Upload flow.** Batch atlas uploads using `gl.texSubImage2D` with typed arrays to avoid layout-triggering DOM image sources. Consolidate glyph batch updates so that each animation frame issues at most one texture upload.
3. **Diagnostics.** Add runtime assertions that guard against acquiring 2D contexts elsewhere (e.g., wrapping `HTMLCanvasElement.prototype.getContext`). Emit warnings in development mode if new call sites appear.
4. **Atlas lifecycle tooling.** Extend developer tooling to show atlas occupancy, eviction counts, and memory footprint so we can confirm the containment strategy under stress tests.

_Acceptance criteria:_

- Static analysis or runtime assertions prevent the main preview canvas from ever obtaining a `2d` context after this phase.
- Glyph atlas uploads originate exclusively from typed-array sources, verified by logging or unit tests that inspect the upload pathway.
- Stress tests with dynamic text (e.g., >200 unique glyphs per minute) maintain atlas upload frequency at or below one `texSubImage2D` call per frame.
- Diagnostics tooling surfaces atlas metrics and shows non-zero occupancy when rendering text-heavy scenes.

## Performance Optimisation (Phase D)

1. **Frame pacing.** Revisit the render loop to ensure it relies on `requestAnimationFrame` exclusively, avoids redundant state changes, and batches draw calls by material where possible. Record GPU timing queries around heavy passes to verify improvements.
2. **Buffer lifecycle.** Audit per-frame allocations; migrate transient buffers to persistent `Map` caches keyed by render object IDs. Ensure `gl.bufferSubData` is used instead of re-allocating buffers every frame, and add telemetry counters for buffer churn.
3. **Texture management.** Consolidate framebuffer and texture reuse. Pre-size render targets for blur or post-processing passes to eliminate repeated `gl.createTexture` calls, and expose a leak detector that tracks outstanding textures.
4. **Profiling harness.** Extend existing Vitest + headless-gl suites to capture frame timing counters and guard performance regressions. Automate benchmark runs on CI hardware to capture before/after FPS deltas.
5. **Shader warmup.** Compile and link critical shader programs at load to prevent hitching during first interaction, documenting any asynchronous compilation strategies.

_Acceptance criteria:_

- Automated benchmarks show ≥10% FPS improvement (relative to Phase B baseline) on reference projects covering geometry-heavy and text-heavy scenes.
- Buffer churn metrics indicate ≤5 transient buffer allocations per frame after optimisation, with telemetry published to the diagnostics overlay.
- Texture leak detector reports zero unreleased textures after a 10-minute soak test with scene switching.
- Profiling harness reports GPU timing for top render passes and fails the pipeline if regressions exceed a configurable threshold.
- Shader compilation completes before the first frame in interactive sessions, as verified by logs showing zero runtime shader compile stalls.

## Rollout & Validation (Phase E)

1. **QA scenarios.** Execute representative projects (dense particle scenes, typography-heavy layouts, automation-heavy audio sync) and capture before/after FPS + resolution metrics. Record testbed hardware details for reproducibility.
2. **Regression tests.** Update snapshot and hashing harnesses to assert WebGL2 output parity without the Canvas fallback. Add tests ensuring canvas size matches the layout and fails if a `2d` context is requested.
3. **Instrumentation dashboards.** Wire frame time, draw call count, and texture upload metrics into the diagnostics overlay for ongoing monitoring. Publish dashboards to the internal telemetry portal with phase-specific annotations.
4. **Documentation.** Publish updated renderer lifecycle notes in `/docs`, including troubleshooting for WebGL2-only deployments and glyph atlas constraints. Link to any new tooling created in earlier phases.
5. **Beta rollout checklist.** Prepare a phased rollout doc covering feature flags, rollback steps, and communication templates for customer support.

_Acceptance criteria:_

- QA matrix captures FPS, frame pacing variance, and resolution results for at least three hardware tiers (baseline dev, high-end desktop, WebGL2-capable laptop) with before/after comparisons stored in the test report.
- Regression suite runs green in CI with WebGL2-only configuration, and new assertions fail if a Canvas2D context is acquired.
- Diagnostics overlay and telemetry dashboards display the newly wired metrics with live data from canary builds.
- Documentation in `/docs` is published with an updated review date and installation/troubleshooting steps for WebGL2-only deployments.
- Rollout checklist is approved by release management and includes explicit rollback triggers and contact points.

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
-   _2025-05-07:_ Phase B verification complete; see
    [webgl-polish-phase-b-verification](./webgl-polish-phase-b-verification.md)
    for evidence and follow-on actions.
