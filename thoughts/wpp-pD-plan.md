# WebGL Polish Plan — Phase D Expansion

_Last reviewed: 2025-05-14_

## Status & Scope

- **Status:** Draft — extends Phase D of [WebGL Polish Plan 1](./webgl-polish-plan-1.md) pending engineering estimation.
- **Scope:** Deepen the performance optimisation backlog for the WebGL renderer after Phase C containment lands. Covers CPU ↔ GPU scheduling, resource lifecycle, and diagnostics uplift. Does not reprioritise earlier phases.

## Context Snapshot

Recent profiling shows the renderer still clears and rebuilds large CPU-side buffers every frame, configures vertex attributes per draw, and spins up ad-hoc WebGL contexts for exports. The preview remains CPU-bound with spikes caused by layout-driven texture uploads and repeated shader state churn. This addendum enumerates optimisation levers to pursue during Phase D.

## Optimisation Backlog

### 1. Frame Pacing & Main-Thread Load Shedding

- **Centralised RAF scheduler.** Introduce a frame clock that multiplexes `requestAnimationFrame` subscriptions instead of letting individual features queue their own loops. Gate redundant renders triggered from React effects by coalescing state changes into the next RAF tick.
- **Idle budget integration.** Push low-priority diagnostic sampling (e.g., frame hashing) into `requestIdleCallback` or stagger across frames. `WebGLRenderer.renderFrame` currently computes frame hashes synchronously, allocating scratch buffers when output dimensions grow.【F:src/core/render/webgl/webgl-renderer.ts†L124-L195】【F:src/core/render/webgl/webgl-renderer.ts†L229-L310】
- **Dynamic frame skipping.** When the adapter reports identical draw-call counts and geometry bytes across frames, skip GPU submission and reuse the previous frame hash. Wire this through diagnostics to verify pacing stability.
- **Tab visibility heuristics.** Lower the render frequency or pause entirely when `document.visibilityState !== 'visible'` to avoid useless work while backgrounded.

### 2. CPU → GPU Data Flow

- **Typed array arenas.** Replace per-frame `number[]` accumulation in `WebGLRenderAdapter` with pooled `Float32Array` slabs sized from telemetry. The adapter currently repopulates plain arrays and recalculates geometry each traversal.【F:src/core/render/webgl/adapter.ts†L44-L166】
- **Geometry diffing.** Cache `RenderObject` → `WebGLGeometrySource` transforms and only rebuild when dirty flags propagate. Combine with structural sharing in scene graph updates to minimise traversal cost.
- **Uniform & texture staging buffers.** Stage batched uniform uploads in `SharedArrayBuffer`/`ArrayBuffer` views to avoid repeated `Array.from` conversions in `MaterialProgram` setters.【F:src/core/render/webgl/material.ts†L1-L156】 Memoise typed conversions per material ID.
- **Worker-assisted preparation.** Offload heavy geometry tessellation (rounded rectangles, particle billboards) to a Web Worker that streams typed arrays back via `postMessage` with transfer lists once the data can be reused across frames.

### 3. GPU Pipeline & State Changes

- **Vertex array objects.** Migrate material setup to WebGL2 `VertexArrayObject`s so `renderFrame` binds VAOs instead of issuing `enableVertexAttribArray`/`vertexAttribPointer` every draw.【F:src/core/render/webgl/webgl-renderer.ts†L154-L221】 This also opens the door to instancing for repeated sprites.
- **Instanced draws for particles & glyphs.** Refactor particle systems and text quads to use `gl.drawArraysInstanced`/`ANGLE_instanced_arrays`, slashing duplicate vertex data submissions.
- **State change minimisation.** Sort primitives by material and texture to avoid thrashing `useProgram`/`bindTexture`. The adapter can emit draw packets grouped by pipeline state rather than traversal order, with per-node z-order encoded in vertex attributes.
- **Persistent mapped buffers.** For dynamic geometry, adopt `gl.bufferData` with `gl.DYNAMIC_DRAW` once and refresh regions via `gl.bufferSubData`, keeping buffers alive across frames to eliminate reallocations detected in GPU capture tools.
- **Multisample resolve strategy.** If antialiasing is required, pre-create an MSAA framebuffer and resolve into the default FBO, preventing per-frame texture churn.

### 4. Texture & Render Target Lifecycle

- **Texture cache residency policies.** Augment `TextureCache` with LRU eviction thresholds keyed by estimated GPU bytes. Surface telemetry on cache hits/misses to the diagnostics overlay so spikes can be correlated with uploads.
- **Atlas compaction sweeps.** Schedule glyph atlas compaction when occupancy breaches a threshold. Emit metrics (evictions, atlas count) so Phase C diagnostics stay actionable during performance validation.
- **Capture path reuse.** `WebGLRenderer.captureFrame` creates a throwaway `<canvas>` and renderer each call, then reads pixels synchronously.【F:src/core/render/webgl/webgl-renderer.ts†L200-L264】 Replace with a persistent OffscreenCanvas + shared context to amortise setup and avoid blocking the main thread.
- **Texture streaming guardrails.** Detect when DOM-backed textures (`CanvasImageSource`) invalidate and throttle refresh rates. Consider copy-on-write surfaces for frequently animated images.

### 5. Profiling & Regression Tooling

- **Disjoint timer queries.** Integrate `EXT_disjoint_timer_query_webgl2` (or `KHR_parallel_shader_compile`) to collect GPU timings around each pass, replacing console logs with structured metrics exported via the diagnostics overlay.
- **Headless benchmarking path.** Extend the Vitest headless-gl harness to load representative projects, run fixed-duration render loops, and assert on average & p95 frame times. Persist baselines so CI can detect ≥10% regressions automatically.
- **Frame capture automation.** Automate Chrome DevTools `Tracing` exports with puppeteer to gather CPU flamecharts pre/post optimisation, ensuring reproducible analysis when verifying backlog items.
- **Metrics ingestion.** Push frame pacing, draw-call counts, buffer churn, and texture allocations into the existing telemetry stack so product owners can watch improvements roll out during canaries.

### 6. Shader Lifecycle & Compilation

- **Program binary cache.** Cache shader binaries or source hashes per material to skip recompilation when toggling between projects. `MaterialRegistry` currently rebuilds programs lazily but does not persist across renderer lifetimes.【F:src/core/render/webgl/material.ts†L108-L156】
- **Asynchronous compile fences.** Use `KHR_parallel_shader_compile` to poll link status without blocking the frame. Warm shaders during idle time before first interaction, logging completion timestamps in diagnostics.
- **Specialisation constants.** Derive variants (e.g., rounded vs. non-rounded rectangles) via uniforms rather than separate shaders to reduce the total programs compiled at startup.

## Validation Plan Updates

- Add CI perf gates that compare telemetry deltas (FPS, draw calls, GPU/CPU timings) against Phase B baselines, failing on regression thresholds.
- Document new instrumentation in `/docs/webgl-runtime-notes.md` once stabilised so future phases inherit the profiling toolkit.

## Open Questions

1. Which optimisations unlock measurable FPS gains on baseline hardware first (to sequence the backlog)?
2. Do we need feature flags for aggressive batching (e.g., instancing) while verifying visual parity?
3. Can export workflows tolerate the latency added by asynchronous GPU timing queries, or should we gate instrumentation behind a dev flag?
