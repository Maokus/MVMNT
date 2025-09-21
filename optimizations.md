# Playback Performance Optimization Ideas

Ordered from simplest / lowest effort to most complex / highest effort. Each item includes: Goal, Idea, Rationale (why it helps), Feasibility (subjective: High / Medium / Low), Complexity (LoE 1–5), Suggested Validation, and Potential Risks / Notes.

---

## 1. Avoid redundant canvas renders while paused

**Goal:** Reduce unnecessary frame work when not playing.
**Idea:** In `VisualizerContext` RAF loop, skip scheduling another frame if nothing changed (no tick advance, no pending UI label update, no interactions). Or gate the loop entirely when transport paused and resume on state changes / user interaction / seek.
**Rationale:** Currently the loop (`loop` in `VisualizerContext`) runs every RAF even while paused, recomputing timing, conversions, and labeling, causing CPU usage and lowering available main-thread time.
**Feasibility:** High
**Complexity:** 1
**Validation:** Profile FPS & CPU (Performance panel) while paused before/after; expect near-zero scripting time.
**Risks:** Need a wake-up trigger (transport play toggle, scrub, hover interactions) to re-enable loop.

## 2. Throttle UI label/state updates more aggressively

**Goal:** Reduce React re-renders and layout.
**Idea:** Increase `lastUIUpdate` interval from 80ms (~12.5Hz) to 125–166ms (8–6Hz) or compute label text in a separate lightweight store/signal outside React.
**Rationale:** Time label precision doesn’t require 12Hz; fewer state updates free main thread for rendering.
**Feasibility:** High
**Complexity:** 1
**Validation:** Count React commits (React DevTools) before/after.
**Risks:** Slightly less responsive time label; acceptable trade-off.

## 3. Memoize TimingManager BPM + tempo map configuration

**Goal:** Avoid repeated tempo map re-application inside tight RAF loop.
**Idea:** In `VisualizerContext.loop`, many places call `getSharedTimingManager()` then `setBPM` and maybe `setTempoMap`. Cache a hash (bpm + version of tempo map) and only apply when it changes.
**Rationale:** Re-applying maps can allocate & touch arrays every frame; eliminating redundant work lowers GC and CPU.
**Feasibility:** High
**Complexity:** 2
**Validation:** Performance profile diff; measure function self time.
**Risks:** Must invalidate cache on tempo / map edits.

## 4. Short-circuit PlaybackClock update when transport paused earlier

**Goal:** Micro-opt reduce per-frame overhead.
**Idea:** In the loop, skip `transportCoordinator.updateFrame` & tick reconciliation if `!state.transport.isPlaying` and tick unchanged since last frame.
**Rationale:** Fewer function calls; synergistic with #1.
**Feasibility:** High
**Complexity:** 1
**Validation:** JS profile while paused.
**Risks:** Edge cases if something external expects continuous updates; likely safe.

## 5. Defer expensive sceneBuilder.getMaxDuration calls

**Goal:** Avoid heavy duration scans during frequent operations.
**Idea:** Maintain a cached duration invalidated only when tracks / elements mutate instead of recomputing on each `getCurrentDuration()` or scene init path.
**Rationale:** `getMaxDuration` scans tracks & note arrays; caching reduces cost in idle frames.
**Feasibility:** High
**Complexity:** 2
**Validation:** Add counters/log wrapper around getMaxDuration before & after.
**Risks:** Must ensure invalidation on track region changes / MIDI load.

## 6. Cache element render object arrays between frames (temporal memoization)

**Goal:** Reduce allocation & work when elements unchanged.
**Idea:** In `HybridSceneBuilder.buildScene`, maintain per-element last (timeSlice bucket → render objects) for elements whose `buildRenderObjects` are pure w.r.t. time within frame windows (e.g., if animations only change every N ms or depend on quantized beats). For static elements, build once.
**Rationale:** Avoid per-frame object creation & sorting overhead.
**Feasibility:** Medium
**Complexity:** 3
**Validation:** Heap allocation profile (Allocation instrumentation) before/after.
**Risks:** Incorrect caching if element is time-continuous; need capability flags (element.canCacheFrameAtTime?).

## 7. Replace repeated array sorts with stable z-order structure

**Goal:** Remove O(n log n) per-frame cost.
**Idea:** Maintain elements in z-order already; when zIndex changes, reposition once. Then iterate directly instead of copying + sorting each frame.
**Rationale:** `buildScene` copies & sorts each frame; with many elements this is avoidable.
**Feasibility:** High
**Complexity:** 2
**Validation:** Profile large scenes (simulate 500 elements). Measure frame time improvement.
**Risks:** Must ensure stable ordering when equal zIndex (could track insertion order separately).

## 8. Use object pools / recycle temporary Canvas instances in exporters

**Goal:** Reduce GC during export.
**Idea:** `image-sequence-generator` and `video-exporter` create many canvases temporarily; introduce an OffscreenCanvas or pooled canvases reused per frame.
**Rationale:** Allocation churn can hurt foreground responsiveness if export runs concurrently (or for preview with similar pattern in future).
**Feasibility:** Medium
**Complexity:** 3
**Validation:** Allocation timeline during export.
**Risks:** OffscreenCanvas browser support; fallback path required.

## 9. Conditional interaction overlay rendering

**Goal:** Skip overlay pass if no interaction state changes.
**Idea:** Track hash of interaction state + selected element geometry; only call `_renderInteractionOverlays` when changed. Optionally draw overlays to separate transparent layer canvas composited over main canvas.
**Rationale:** Overlays may be expensive for large scenes; eliminates redundant stroke operations.
**Feasibility:** High
**Complexity:** 2 (layered canvas adds 1)
**Validation:** Toggle selection rapidly; measure frame time.
**Risks:** Slight complexity managing second canvas sizing.

## 10. Partial invalidation / dirty rectangles

**Goal:** Minimize overdraw on large canvases.
**Idea:** Track bounding boxes of changed elements between frames and only re-render those regions (copy unchanged regions from previous frame via `drawImage` from a back buffer). For majority static scenes w/ sparse animations.
**Rationale:** Avoid full-canvas fill + redraw when most pixels unchanged.
**Feasibility:** Medium
**Complexity:** 4
**Validation:** Simulate many static text elements with one moving element; compare render ms.
**Risks:** Complexity; blending artifacts if elements overlap; may not help if scene mostly dynamic.

## 11. Migrate render loop to OffscreenCanvas + Worker

**Goal:** Free main thread; increase responsiveness.
**Idea:** Move `MIDIVisualizerCore` rendering to worker using OffscreenCanvas transfer. Main thread posts timing & interaction events; worker paints.
**Rationale:** UI thread freed for React & input; potential smoother FPS.
**Feasibility:** Medium (browser support fairly good)
**Complexity:** 4
**Validation:** FPS & input latency metrics (RAIL). DevTools performance capture.
**Risks:** Access to DOM APIs (fonts/image loading) must be proxied; custom events replaced by postMessage.

## 12. WebGL (or WebGPU) renderer for batched note geometry

**Goal:** Improve draw performance for large numbers of primitives (notes, overlays) & enable GPU instancing.
**Idea:** Abstract render objects to allow WebGL path for rectangles / gradients / text via SDF atlas; batch notes via instanced quads.
**Rationale:** Canvas 2D fillRect loops scale poorly beyond tens of thousands of shapes per frame.
**Feasibility:** Medium
**Complexity:** 5
**Validation:** Benchmark 5k/10k/20k note rectangles; compare frame time CPU vs GPU path.
**Risks:** Higher maintenance, shader complexity, font rendering differences.

## 13. Precompute MIDI note visibility windows

**Goal:** Reduce per-frame filtering of notes.
**Idea:** During ingest, bucket notes into time segments (e.g., per 1/4 beat or per 50ms). At frame time, only iterate buckets overlapping current window.
**Rationale:** Avoid scanning all notes to decide what to draw; essential for large MIDI files.
**Feasibility:** High
**Complexity:** 3
**Validation:** Large MIDI (50k notes) profiling: time spent in buildRenderObjects before/after.
**Risks:** Memory overhead for buckets; must rebuild on tempo map changes or transpositions.

## 14. Adaptive frame skipping under load

**Goal:** Maintain smooth perceived motion under heavy scenes.
**Idea:** Measure last render duration; if > (frameBudget \* 0.9), skip next visual update but still advance logical time (or reduce quality like disabling overlays temporarily).
**Rationale:** Keeps UI interactive & avoids spiraling backlog.
**Feasibility:** High
**Complexity:** 2-3
**Validation:** Artificially stress (insert sleep); verify stable FPS not falling below threshold.
**Risks:** Visual jitter; must avoid desync with audio (when audio path added).

## 15. Static text / shape atlas caching

**Goal:** Avoid re-rendering static elements.
**Idea:** Render static scene elements (background, static text, logos) into a cached offscreen bitmap; composite each frame before dynamic elements.
**Rationale:** Cuts per-frame draw calls for unchanging content.
**Feasibility:** High
**Complexity:** 2
**Validation:** Count draw calls before/after with instrumentation.
**Risks:** Need invalidation when properties or debug settings change.

## 16. Use typed arrays for geometry accumulation

**Goal:** Reduce GC and accelerate numeric loops.
**Idea:** For note rectangles/etc., accumulate positions in Float32Array reused each frame; single loop dispatch to render (Canvas path: manual loop; WebGL path: buffer update).
**Rationale:** Lower allocation & better CPU cache locality.
**Feasibility:** Medium
**Complexity:** 3
**Validation:** Allocation timeline & CPU profile on large scenes.
**Risks:** Code complexity; must handle dynamic growth.

## 17. Multi-phase render pipeline (layout -> paint separation)

**Goal:** Unlock parallelism & better caching.
**Idea:** Split buildRenderObjects into: (1) data extraction + layout (pure, cacheable), (2) GPU/Canvas painting. Layout can be memoized by time slice & reused for export.
**Rationale:** Enables reuse across export paths & worker offloading (#11).
**Feasibility:** Medium
**Complexity:** 4
**Validation:** Compare layout recomputation frequency before/after.
**Risks:** Architectural refactor touches many elements.

## 18. Background MIDI parsing + incremental hydration

**Goal:** Avoid main-thread stalls on large file load affecting early playback.
**Idea:** Parse MIDI in Worker; stream note events into store increments; visually show partial scene quickly.
**Rationale:** Faster interactive readiness; no parse jank.
**Feasibility:** Medium
**Complexity:** 4
**Validation:** Load large MIDI; measure time to first paint & responsiveness.
**Risks:** Complexity in progressive tempo map application.

## 19. Predictive scheduling / frame time smoothing

**Goal:** Stabilize motion with variable workload.
**Idea:** Estimate next frame cost; adjust dt / interpolation to smooth.
**Rationale:** Reduces perceived stutter when cost spikes.
**Feasibility:** Low-Medium
**Complexity:** 4
**Validation:** Introduce synthetic cost spikes; assess smoothness metrics.
**Risks:** Time drift vs real clock; complexity may outweigh benefit.

## 20. Audio-driven high precision tick (future path) + decoupled visual tick interpolation

**Goal:** Ensure visuals stay in sync with audio with minimal jitter while allowing visual frames to skip.
**Idea:** Use AudioContext time as canonical; visuals interpolate between last committed audio tick positions.
**Rationale:** Industry standard for DAW-like sync; enables aggressive frame skipping without desync.
**Feasibility:** Medium (depends on audio engine maturity)
**Complexity:** 5
**Validation:** A/B test with metronome & visual playhead drift measurement.
**Risks:** Requires robust audio scheduling; more complex state reconciliation.

## 21. WebAssembly acceleration for hot numeric kernels

**Goal:** Speed up heavy numeric transforms (geometry, note interval clipping, chord analysis) if profiling shows hotspots.
**Idea:** Port tight loops to WASM (Rust / AssemblyScript) behind feature flag.
**Rationale:** Potential 2-5x speed in CPU-bound sections.
**Feasibility:** Low-Medium (depends on hotspot purity)
**Complexity:** 5
**Validation:** Micro-bench loops pre/post port.
**Risks:** Build complexity; FFI overhead may negate gains for small loops.

## 22. Scene graph diffing & retained-mode rendering

**Goal:** Only update changed nodes rather than full rebuild each frame.
**Idea:** Maintain persistent objects with draw() referencing mutable state; skip rebuilding arrays of render objects.
**Rationale:** Reduces allocation & CPU overhead at scale.
**Feasibility:** Medium
**Complexity:** 5
**Validation:** Large scene benchmark (allocate 5k+ elements) diff performance.
**Risks:** Memory residency increases; requires invalidation discipline.

## 23. Adaptive resolution scaling (dynamic supersampling)

**Goal:** Maintain target FPS by scaling canvas resolution down under load, back up when idle.
**Idea:** Monitor frame time; if > budget for N frames, reduce internal canvas size (CSS scaled) by factor; restore when stable.
**Rationale:** Common in games; trades sharpness for smoothness.
**Feasibility:** High
**Complexity:** 3
**Validation:** Stress test; expect FPS stabilization with visible resolution shifts.
**Risks:** Visual quality fluctuation; user perception.

## 24. Frame prefetch for export using deterministic clock (already partially implemented)

**Goal:** Speed up export pipeline.
**Idea:** Parallelize frame rasterization & encoding using a worker pool (each with OffscreenCanvas) feeding into encoder queue.
**Rationale:** Utilizes multi-core; reduces wall clock export time.
**Feasibility:** Medium
**Complexity:** 4
**Validation:** Export 10s 60fps @ 1500x1500 before/after; measure time.
**Risks:** Ordering and memory pressure; potential race on shared state.

## 25. Pluggable renderer quality tiers

**Goal:** Offer low/medium/high preview modes.
**Idea:** Disable expensive effects / overlays / note gradients at low tier; full quality only on export or when user toggles.
**Rationale:** Users can trade fidelity for interactivity.
**Feasibility:** High
**Complexity:** 2-3
**Validation:** Toggle tiers; measure frame time difference.
**Risks:** Complexity in feature gating; consistency mismatch between preview & export.

---

## Suggested Immediate Wins (Top 5 to Implement First)

1. Idle loop suspension (#1)
2. TimingManager config memoization (#3)
3. Z-order pre-sorted structure (#7)
4. Static atlas caching (#15)
5. Adaptive frame skipping (#14) or preview quality tier (#25)

These provide strong ROI with limited architectural risk.

---

## Follow-up Instrumentation Recommendations

-   Add a lightweight in-canvas FPS & frame time overlay (sample last 120 frames) for quick visual regression detection.
-   Build a profiling scene (synthetic large MIDI + many overlay elements) & record baseline metrics before each optimization phase.
-   Introduce feature flags (e.g., `?perfFlags=cacheLayout,skipIdleLoop`) for A/B testing in production builds.

---

## Validation Matrix Mapping

(See `docs/VALIDATION_MATRIX.md` for expanding test categories)

-   Performance: Add scenarios for paused idle CPU, large MIDI note count render, interaction overlay stress, export throughput.
-   Correctness: Ensure caching layers invalidate on element config/macros/tempo changes.
-   UX: Confirm time label update cadence acceptable after throttling.

---

Feel free to request implementation details for any specific item next.
