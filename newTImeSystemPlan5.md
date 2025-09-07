# New Timing System Plan v5 (revised to match repo)

This revision aligns the plan with the current codebase, fixes mismatches, and clarifies incremental steps that fit the existing Zustand store and timing utilities.

## What changed vs v4

-   Correct module paths: `TimingManager` lives at `src/core/timing/timing-manager.ts` (barrel at `src/core/timing/index.ts`), with a compatibility shim at `src/core/timing-manager.ts`.
-   Convert/tempo helpers are duplicated across `tempo-utils.ts` and `timeline-helpers.ts`. v5 consolidates on `tempo-utils.ts` and removes cross-layer coupling.
-   Multiple, incompatible `TempoMapEntry` types exist in different modules. v5 unifies this type in `core/timing` and re-exports from the barrel.
-   Some components call private methods (e.g., `_secondsToBeats`, `_beatsToSeconds`) on `TimingManager`. v5 switches all usage to public APIs.
-   A `TimingManager` interface in `src/core/types.ts` conflicts by name with the class. v5 renames the interface to avoid ambiguity and clarifies responsibilities.
-   Store structure already uses Zustand via a single `timelineStore.ts` containing `timeline` and `transport` objects. v5 extends it rather than introducing a parallel store.
-   A separate `timeline-service.ts` overlaps with store responsibilities. v5 chooses the store as the authority and isolates or deprecates the service.

## Current repo facts (grounded)

-   Canonical timing engine: `src/core/timing/timing-manager.ts` with tempo map segments, binary search conversions, grid helpers, BBT conversions.
-   Barrel: `src/core/timing/index.ts` exports `TimingManager` and `tempo-utils`.
-   Store: `src/state/timelineStore.ts` (Zustand) with `timeline.masterTempoMap`, `transport.isPlaying`, loop fields in seconds, `currentTimeSec`, etc.
-   Duplicated helpers: `src/core/timing/tempo-utils.ts` and `src/core/timing/timeline-helpers.ts` both implement beats↔seconds conversions; the latter also imports selectors, creating an unintended core→state dependency.
-   Type proliferation for tempo maps: variants in `core/timing/timing-manager.ts`, `core/timing/timeline.ts`, `core/timing/tempo-utils.ts` (internal), and `state/timelineTypes.ts`.
-   UI relies on per-element `TimingManager` instances; e.g., MIDI manager, time displays, piano roll.
-   Play/seek: `VisualizerContext` + `VisualizerCore` drive rAF-based playback; `transport` in the store toggles `isPlaying` and holds loop bounds in seconds.

## Identified issues and fixes

1. Duplicate tempo conversion helpers

-   Issue: `timeline-helpers.ts` duplicates `beatsToSecondsWithMap`/`secondsToBeatsWithMap` found in `tempo-utils.ts` and couples core timing to selectors.
-   Fix: Remove `timeline-helpers.ts`. Use `tempo-utils.ts` exclusively via `@core/timing` barrel. Update imports in `hooks/useBarNudge.ts` and any other call sites.

2. TempoMapEntry type fragmentation

-   Issue: multiple shapes (`{time, tempo}`, `{time, tempo?; bpm?}`) across modules.
-   Fix: Standardize on `core/timing/timeline.ts` type `TempoMapEntry = { time: number; tempo?: number; bpm?: number }`. Re-export from `@core/timing`. Update usages in `state/*`, `tempo-utils.ts` (remove local alias), and `timing-manager.ts` to import this shared type.

3. Name conflict for TimingManager (interface vs class)

-   Issue: `src/core/types.ts` exports an interface named `TimingManager` that represents a transport-like controller, clashing conceptually with the timing utility class.
-   Fix: Rename interface to `TransportController` (or `PlaybackController`) and update references where used (e.g., `Manager.timingManager` becomes `transport?: TransportController`). Keep the class `TimingManager` unchanged.

4. Private API access in UI

-   Issue: `time-unit-piano-roll/note-block.ts` calls `_secondsToBeats` and `_beatsToSeconds` (private). Type is `any` to bypass TS checks.
-   Fix: Replace with `secondsToBeats` and `beatsToSeconds` public APIs. If needed, add explicit methods on `TimingManager` that return the same results (already present) and adjust callers.

5. Hard-coded grid math

-   Issue: `useBarNudge` assumes 4 beats/bar.
-   Fix: Read `beatsPerBar` from a `TimingManager` or from a store field, defaulting safely to 4 only if unavailable.

6. Authority duplication (store vs service)

-   Issue: `timeline-service.ts` includes mutations and conversions overlapping with the Zustand store.
-   Fix: Treat the Zustand store as the single source of truth. Either:
    -   Deprecate `timeline-service.ts` after migrating its unique logic into selectors/utils; or
    -   Wrap it as a pure utility that consumes store state (no internal state held).

7. Import normalization

-   Issue: Mix of `@core/timing-manager` and `@core/timing` imports.
-   Fix: Prefer `@core/timing` for all timing utilities to reduce churn; keep the shim only for legacy paths.

8. Time domain consistency

-   Issue: Store uses seconds for loop bounds and position; other components use beats.
-   Fix: Keep seconds as the persisted/transport domain for now; add derived selectors for beats using `TimingManager` + master tempo map. Later, consider moving to beats-first with on-demand seconds.

## Revised architecture (unchanged intent, aligned to repo)

-   Core timing stays in `TimingManager` (per-element is fine). A future “transport clock” will own the authoritative playback now and integrate with the store.
-   Use a thin transport facade exposing `getNow()` that maps AudioContext/performance time into both seconds and beats via the master tempo map.
-   Worker scheduler compiles renderable batches using store snapshots; rendering consumes batches and the transport clock for the playhead.

### Transport facade (proposed)

Public API (initial cut):

-   `play(opts?: { quantizeTo?: GridValue })`
-   `pause()`, `stop()`
-   `seek(toSec: number | { beats: number })`
-   `setRate(rate: number)`, `setLoop({ on, startSec?, endSec?, startBeats?, endBeats? })`
-   `getNow(): { secTime: number; beats: number }`

Notes:

-   v1 clock source: `performance.now()` anchored to `AudioContext.currentTime` when available and resumed on user gesture; keep a polyfilled path for previews.
-   Conversions use the shared `TempoMapEntry` and `TimingManager` API.

## Phased plan (revised)

Phase 0 — Cleanup and type/utility unification

-   Rename `core/types.ts` interface `TimingManager` → `TransportController`.
-   Consolidate `TempoMapEntry` in `core/timing/timeline.ts`; export from `@core/timing`. Update imports across `state/*`, `tempo-utils.ts`, `timing-manager.ts`.
-   Remove `core/timing/timeline-helpers.ts`. Move any missing helpers into `tempo-utils.ts`. Update imports (e.g., `hooks/useBarNudge.ts`).
-   Replace private method calls with public equivalents in piano roll and related components.
-   Normalize imports to `@core/timing` for timing utilities.

Outcomes:

-   One canonical conversion path, one shared tempo-map type, no private API leaks, and no core→state coupling.

Phase 1 — Transport getNow (read-only unification)

-   Implement a lightweight transport clock that exposes `getNow()` and subscribes to store state for tempo map and rate.
-   Replace direct time reads in visualizer playhead with `getNow()` while retaining existing UI controls and store actions.
-   Add derived selectors for beats (`positionBeats`) using the master tempo map.

Outcomes:

-   Single time source for rendering; no UX change yet; groundwork for Worker scheduling.

Phase 2 — Store extensions (within existing `timelineStore.ts`)

-   Add optional fields: `rate`, `quantize`, `timeSig`/`beatsPerBar` on a coherent slice (under `timeline` or `transport`).
-   Add actions: `setRate`, `setQuantize`, `setTimeSig`, `setBeatsPerBar`.
-   Provide selectors: master `TimingManager` configured from `timeline.masterTempoMap` and beats-per-bar; `positionBeats` from `currentTimeSec`.

Outcomes:

-   Unidirectional data flow; transport clock derives configuration from the store.

Phase 3 — Worker scheduler

-   Web Worker with min-heap keyed by absolute secTime, look-ahead 100–200 ms, refill every 25–50 ms.
-   Compile per-track windows using the master tempo map for seconds↔beats.
-   Messaging: `INIT`, `UPDATE_STATE`, `PLAY`, `PAUSE`, `SEEK` in; `SCHEDULE_BATCH` out.

Outcomes:

-   Smooth scheduling off the UI thread.

Phase 4 — Transport FSM, looping, quantization, rate

-   Formalize FSM over play states; gate seek during start; flush on seek/loop.
-   Implement loop in seconds (primary) with beat-aligned helpers.
-   Apply quantized play/seek behavior using grid from `TimingManager`.

Outcomes:

-   Deterministic transitions and boundary handling.

Phase 5 — Diff bridge and performance hardening

-   Send compact patches to the Worker; memoize heavy selectors; debounce mass edits.
-   Instrument scheduling latency and batch size.

Outcomes:

-   Stable performance with larger sessions.

Phase 6 — UI integration

-   Transport bar drives store actions; scrub/drag dispatches `seek`.
-   Visualizer renders via rAF and `getNow()`; consumes Worker batches.

Outcomes:

-   Accurate playhead and event timing across UI.

Phase 7 — Deterministic export

-   Add `SimulatedClock` and fixed-step mode for export; ensure schedule compilation is pure.

Outcomes:

-   Reproducible exports across machines.

## Acceptance criteria deltas

-   Phase 0: All references to `timeline-helpers` removed; a single `TempoMapEntry` type exported from `@core/timing`; no uses of private `_secondsToBeats`/`_beatsToSeconds` remain.
-   Phase 1: `getNow()` drives the playhead; playhead updates smoothly even if store updates are throttled.
-   Phase 3–4: No double-fires around seek/loop; tests cover segment boundaries and loop wrap.

## Notes and clarifications

-   Time signature denominator affects notation, not beat length; `TimingManager` treats “beat” as the unit set by tempo (seconds per quarter) and uses numerator for bars. Denominator changes won’t rescale beat length unless explicitly modeled; document this behavior.
-   Autoplay gating: Create/resume `AudioContext` only after a user gesture; gracefully fallback to perf clock if blocked.

## Migration checklist (practical)

-   Replace imports:
    -   `@core/timing-manager` → `@core/timing` (where feasible).
    -   Remove `@core/timing/timeline-helpers` usages; use `@core/timing` exports from `tempo-utils`.
-   Unify types:
    -   Export `TempoMapEntry` from `@core/timing` and update `state/*`, `tempo-utils.ts`, `timing-manager.ts` to use it.
-   Rename interface in `core/types.ts` to `TransportController` and update consumers.
-   Update `useBarNudge` to read `beatsPerBar` instead of hard-coding 4.
-   Replace private timing API usage in piano roll components with public methods.
