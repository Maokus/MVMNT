## Codebase Cleanup & Maintainability Recommendations

This document summarizes improvements applied during the comment/documentation cleanup and lists further recommendations to enhance maintainability, testability, and architectural clarity of the new audio + export stack.

### 1. Immediate Changes Performed

1. Removed roadmap / "Phase X" style comments from runtime source files (`av-exporter.ts`, `offline-audio-mixer.ts`, `video-exporter.ts`, `VisualizerContext.tsx`).
2. Replaced ad‑hoc header comments with structured doc blocks describing purpose, guarantees, limitations, and extension points.
3. Normalized terminology ("deterministic", "offline mix", "delegation") to reduce future drift and ambiguity.

### 2. Structural Recommendations

1. Export Service Abstraction
    - Introduce a `ExportService` (facade) that selects `VideoExporter` vs `AVExporter` vs future formats. This keeps UI components ignorant of per‑exporter option branching (bitrate heuristics, audio delegation, etc.).
2. Audio Subsystem Modularization
    - Group audio runtime pieces (`transport-coordinator`, scheduling, decoding, offline mix) under `src/audio/` with clear subfolders: `runtime/`, `offline/`, `graph/`, `types/` to reduce scattering across `core/` and `export/`.
3. Typed Visualizer Interface
    - Define a `VisualizerAdapter` interface capturing only the methods used by exporters (`renderAtTime`, `resize`, `getCurrentDuration`, `getSceneBuilder`, `getPlayRange`). Replace pervasive `any` usage to regain static safety and ease refactors.
4. Error Taxonomy
    - Create domain error classes (`ExportError`, `AudioMixError`, `CodecSelectionError`) so callers can present user-facing guidance. Avoid overloading `Error` messages with structured data.
5. Determinism Boundary
    - Encapsulate all logic that must be deterministic (tick <-> time mapping, mix, frame time iteration) in a package or namespace. Provide a test util that replays a saved snapshot and validates hash invariants.
6. Configuration Centralization
    - Extract bitrate heuristics, codec preference arrays, normalization targets, and default sample rates into a single `config/mediaDefaults.ts`. This aids discoverability and tuning.
7. Store Selectors Layer
    - Create a `selectors/` directory with pure functions for commonly computed values (e.g., `selectTicksPerSecond`, `selectAudibleTracks`). Many ad‑hoc recalculations could be centralized and unit tested.

### 3. Code-Level Recommendations by Module

AV Exporter (`av-exporter.ts`)

-   Factor bitrate heuristic + Kbps interpretation into `resolveVideoBitrate(opts)` helper (pure) with unit tests around edge thresholds.
-   Lazy import mediabunny only when needed (dynamic `import()`); provides faster initial load for projects that never export.

Video Exporter (`video-exporter.ts`)

-   Replace direct DOM download logic with a shared `downloadBlob` utility (dedupe logic also inside AV exporter if added later).
-   Provide a progressive streaming path (when file size large) using `StreamTarget` when mediabunny supports it – currently everything buffers in memory.

Offline Audio Mixer (`offline-audio-mixer.ts`)

-   Extract resampling loop into its own pure function (`resampleAndAccumulate`) with benchmark + correctness tests (rounding, boundary off‑by‑one).
-   Optionally support dynamically choosing a higher quality windowed sinc resampler when offline export duration is small but quality paramount.
-   Add guard rails: warn when peak > 1.05 (indicating clipping beyond minor FP rounding) before optional normalization.

Visualizer Context (`VisualizerContext.tsx`)

-   Shrink component by moving export orchestration & progress overlay logic into custom hooks (`useExportController`, `useProgressOverlay`). Reduces line count and improves testability.
-   Replace event bus string (`'scene-name-changed'`) with a typed dispatcher or use Zustand subscription for scene name changes.

State / Store

-   Introduce versioned project serialization (schema object with `version: number`) to facilitate migrations when audio track structure evolves (e.g., future effects chains).
-   Provide unit tests that diff the serialization output before/after a no-op mutation to catch accidental ordering or key name regressions affecting hashes.

### 4. Testing & Determinism Enhancements

1. Golden Mix Tests
    - Store small synthetic source buffers (impulses, sines at different SRs) – verify mixed output hash remains stable across environments.
2. Resampling Accuracy
    - Validate maximum absolute error vs a high-quality reference (e.g., offline sinc) remains below threshold for representative frequencies.
3. Hash Stability
    - Add a test that intentionally reorders `tracksOrder` input to ensure normalized output for hashing is unaffected by map iteration order.
4. Export Timing
    - Simulate multi-minute export using mocked `SimulatedClock` to ensure frame timestamp accumulation does not drift past < half frame.

### 5. Incremental Refactor Plan (Low → High Effort)

Low

-   Introduce media config constants file.
-   Add `VisualizerAdapter` type + apply to exporters.
-   Extract bitrate & codec resolution helpers with tests.
    Medium
-   Create `ExportService` facade and shift UI to call it.
-   Move deterministic components into `deterministic/` namespace.
-   Extract resampling function & add benchmarks (run under Vitest).
    High
-   Streaming export pipeline (chunked flush) for very long durations.
-   Pluggable effects graph for offline mix (gain staging, EQ, optional micro‑fades).
-   Web Worker based mix for large projects to keep main thread responsive.

### 6. Observed Technical Debt / Pitfalls

-   Use of `any` in exporters and context hides coupling & can mask accidental API changes.
-   Mixed responsibility in `VisualizerContext` (render loop management, export config, progress UI) makes it hard to isolate logic for tests.
-   Hard‑coded magic numbers (e.g., bitrate thresholds) scattered – risk of drift when tuning.
-   Error handling mostly via `console.warn` – UI layer can’t surface actionable feedback to users.
-   Potential memory pressure for long exports due to full in‑memory buffering; no early streaming flush.

### 7. Suggested Conventions

-   Prefer JSDoc blocks with: Purpose, Inputs, Outputs, Determinism, Extension Points.
-   Single source of truth for timing: always derive seconds from ticks via shared manager; avoid duplicating formula inline.
-   Guard public methods with `if (this.isExporting)` style invariants and throw explicit domain errors.
-   Keep reproducibility-affecting changes behind feature flags until hash version bump is coordinated.

### 8. Closing Notes

The current implementation is a solid foundation: deterministic principles are explicit, and audio/video concerns are largely separated. The largest wins now come from isolating pure logic for testing, reducing `any`, and centralizing configuration + error handling. Implementing the low effort items above will immediately improve confidence and future change velocity.

---

Maintained automatically – update as architectural decisions evolve.
