# New Timing System Plan v7 — Detailed phased roadmap (based on v6)

This document expands the v6 roadmap into concrete, actionable steps. Each phase has: objectives, implementation steps (with suggested files/locations), and acceptance criteria. Where file paths are proposed, treat them as guidance; adapt to actual locations in the codebase.

Key recap carried forward from v6:

-   Global tempo fallback plus optional tempo map.
-   MIDI-first timeline tracks (one file per track) with horizontal drag and bar snapping.
-   Authoritative transport domain is seconds; beat/bar conversions are derived for UI and snapping.

Assumptions verified in v6:

-   `timeline.masterTempoMap?: TempoMapEntry[]` exists.
-   `TimelineTrack` uses `offsetSec` and references a single file.
-   `timeline.beatsPerBar` does not yet exist and must be added (default 4).

Glossary (used throughout):

-   SPB: seconds per beat.
-   Tempo map: array of `TempoMapEntry` segments.
-   Grid: bar grid derived from beats and `beatsPerBar`.

---

## Phase 0 — Cleanup and unification (now)

Objectives

-   Centralize tempo/beat conversions in one public module.
-   Introduce `timeline.globalBpm` and `timeline.beatsPerBar` with actions.
-   Standardize a single `TempoMapEntry` type under `@core/timing`.
-   Remove UI coupling to any ad-hoc or deprecated helpers.

Implementation steps

1. Timing types and utilities

-   Create or confirm `src/core/timing/` with:
    -   `types.ts`: export `TempoMapEntry` and related timing types.
    -   `tempo-utils.ts`: export
        -   `getSecondsPerBeat({ bpm, map? }): number`
        -   `beatsToSeconds(map: TempoMapEntry[] | undefined, beats: number, fallbackSpb: number): number`
        -   `secondsToBeats(map: TempoMapEntry[] | undefined, seconds: number, fallbackSpb: number): number`
-   Ensure utils accept undefined/empty map and use `fallbackSpb`.

2. Store model

-   In `src/state/timelineTypes.ts` add (or extend):
    -   `globalBpm: number` (default 120)
    -   `beatsPerBar: number` (default 4)
-   In `src/state/timelineStore.ts` add actions:
    -   `setGlobalBpm(bpm: number)`
    -   `setBeatsPerBar(n: number)`
-   Where the store currently references tempo helpers, route through `@core/timing/tempo-utils`.

3. Derived wrappers (non-stateful functions co-located near state)

-   Add `src/state/selectors/timing.ts`:
    -   `secondsToBeats(state, s)` -> uses `tempo-utils` with `60 / state.timeline.globalBpm`.
    -   `beatsToSeconds(state, b)` -> same fallback handling.
    -   `secondsToBars(state, s) = secondsToBeats(state, s) / state.timeline.beatsPerBar`.
    -   `barsToSeconds(state, bars) = beatsToSeconds(state, bars * state.timeline.beatsPerBar)`.
-   Keep these as pure functions/selectors; avoid storing derived values.

4. Deprecate and migrate

-   Identify and remove uses of legacy `timeline-helpers` (if present). Replace imports with `@core/timing/tempo-utils` or the wrappers in `state/selectors/timing`.

Acceptance criteria

-   `globalBpm` and `beatsPerBar` exist with defaults and actions.
-   `tempo-utils` module exists and is used in place of ad-hoc helpers.
-   Build and tests pass; no broken imports. Unit tests cover empty tempo map fallback behavior.

Quality gates

-   Build: PASS
-   Lint/Typecheck: PASS
-   Unit tests: Add tests for `tempo-utils` (empty vs non-empty map) and selector wrappers.

Feasibility notes and adjustments

-   Consolidate timing conversions on `src/core/timing/tempo-utils.ts` (already present and segment-aware). Avoid adding parallel helpers.
-   Standardize `TempoMapEntry` on `src/core/timing/timeline.ts` (`{ time, tempo?, bpm? }`). Update `src/state/timelineTypes.ts` to import/re-export this type.
-   Deprecate `src/core/timing/timeline-helpers.ts`. Known consumer: `src/hooks/useBarNudge.ts` (hardcodes 4 beats/bar). Migrate it to `tempo-utils` and new store-backed `beatsPerBar` and `globalBpm`.

---

## Phase 1 — Read-only transport clock (getNow)

Objectives

-   Provide a monotonic clock facade for render/playhead without changing the authoritative seconds domain in state.
-   Derive playhead beats/bars from state + clock using the unified conversions.

Implementation steps

1. Clock source (repo reality)

-   Do not add a new `transport.ts` yet. `VisualizerContext` already provides the live clock via `visualizer.currentTime` and mirrors it into the store (`timeline.currentTimeSec`). Treat this as the transport facade for now.

2. Store selectors

-   In `src/state/selectors/timing.ts` add:
    -   `positionBeats(state): number` — converts current seconds position (from store) to beats.
    -   `positionBars(state): number` — beats / `beatsPerBar`.

3. Render loop

-   Keep using `VisualizerContext`’s render loop; use selectors to derive beats/bars for labels and grids.

Acceptance criteria

-   Playhead can be displayed in beats and bars using selectors without drift.
-   No change in store’s primary seconds-based state.

Feasibility notes

-   Using the existing visualizer-driven clock avoids double-clocking and drift. A dedicated transport facade can be revisited if audio/MIDI scheduling is introduced.

Quality gates

-   Build/Typecheck: PASS
-   Optional: add a lightweight selector test to validate derived beats/bars monotonicity with a mock tempo map.

---

## Phase 2 — Store extensions for grid, rate, and quantize

Objectives

-   Add transport rate and grid quantization settings.
-   Provide shared wrappers for seconds↔bars everywhere.

Implementation steps

1. Store additions

-   In `timelineStore` add `transport:{ rate: number }` (default 1.0).
-   Add `transport.quantize?: 'bar' | '1/2' | '1/4' | 'off'` (start with `'bar'` and `'off'`).
-   Actions: `setRate(number)`, `setQuantize(value)`.

2. Wrappers

-   Confirm presence of `secondsToBars`/`barsToSeconds` wrappers; expose them for general use in UI logic.

3. UI controls (minimal)

-   Add a simple setting in the timeline header/panel to switch quantize on/off (bar-only in v6 scope).

Acceptance criteria

-   Rate and quantize live in state with actions. Note: `rate` has no live playback effect until wired to visualizer/worker in later phases.
-   `secondsToBars`/`barsToSeconds` wrappers are used by any UI that needs bar conversions.
-   Toggling quantize does not break existing behaviors.

Quality gates

-   Build/Typecheck: PASS
-   Add unit tests for `barsToSeconds(secondsToBars(x)) ≈ x` round-trip within a small epsilon (constant tempo and with tempo map segments).

---

## Phase 3 — Worker scheduler (MIDI-first)

Objectives

-   Offload real-time scheduling to a Web Worker with a look-ahead strategy.
-   Compile per-track event windows based on track `offsetSec` and tempo map.

Implementation steps

1. Compilation first (pure)

-   Add `compileWindow({ tracks, nowSec, lookAheadSec, tempoMap, bpm, beatsPerBar })` in `src/core/render/compile.ts` that produces a `SCHEDULE_BATCH` in absolute seconds.
-   Respect `offsetSec`, regions, and mute/solo; convert MIDI tick/beat time to absolute seconds using `tempo-utils`.
-   Unit test with a simple MIDI clip and offset — assert first few scheduled times.

2. Optional worker scaffolding (feature-flagged)

-   If real-time scheduling is needed, add `scheduler.worker.ts` and a thin `scheduler-bridge.ts`; gate behind a flag so current playback is unaffected.

3. Compilation

-   Add `compileWindow({ tracks, nowSec, lookAheadSec, tempoMap, bpm, beatsPerBar })` in a pure module `src/core/render/compile.ts` that produces a `SCHEDULE_BATCH`.
-   Respect `offsetSec`, regions, and mute/solo; convert MIDI tick/beat time to absolute seconds using `tempo-utils`.

4. Debugging

-   Gate detailed logging behind an environment flag; include counters for missed deadlines (only relevant if worker is enabled).

Acceptance criteria

-   `compileWindow` passes unit tests and aligns with expected musical time when a tempo map is present.
-   If worker enabled: on `PLAY`, worker posts batches within the look-ahead window; pause/seek flush and reschedule correctly.

Quality gates

-   Build/Typecheck: PASS
-   Add unit tests for `compileWindow` covering offsets, regions, and tempo map segments.

---

## Phase 4 — Transport FSM, looping, quantization, and rate

Objectives

-   Formalize transport states and behaviors.
-   Support looping and quantized play/seek.
-   Ensure rate affects clocking and scheduling coherently.

Implementation steps

1. FSM

-   Define states: `idle`, `playing`, `paused`, `seeking`.
-   Add loop config in store: `loop: { enabled: boolean, startSec: number, endSec: number }`.
-   Actions: `play()`, `pause()`, `seek(sec)`, `setLoop(cfg)`, `toggleLoop()`.

2. Quantized play/seek

-   If `transport.quantize === 'bar'`, snap requested `sec` to nearest bar using wrappers (`seconds→bars→round→seconds`).
-   Support `floor`/`ceil` variants later; default is nearest.

3. Rate integration

-   Store the `rate` value but do not attempt to affect live playback until the visualizer or a worker supports it.
-   When rate support is wired, anchor to the moment of change to avoid jumps; scheduler look-ahead should scale accordingly.

4. Looping behavior

-   On hitting `endSec` while playing with loop enabled, seek to `startSec` (quantized if configured), flush worker, resume.

Acceptance criteria

-   `play/pause/seek` transitions are consistent; no zombie scheduling after pause or seek.
-   Looping in seconds works; optional setters allow specifying bars which convert to seconds.
-   Quantized play/seek land on bar boundaries as configured.

Quality gates

-   Build/Typecheck: PASS
-   Add unit tests for FSM transitions and quantized seek behavior.

---

## Phase 5 — Diff bridge and performance hardening

Objectives

-   Minimize data sent to worker; keep UI responsive during drags.
-   Add lightweight instrumentation for latency and missed deadlines.

Implementation steps

1. Memoization/throttling (now)

-   Memoize heavy selectors reading MIDI clips or computing draw data.
-   Throttle drag/DnD updates at ~8–16ms to avoid UI jank.

2. Diffing (later, worker-enabled)

-   If the worker is introduced, implement shallow/delta comparison and only send changes on `midiSourceId`, `offsetSec`, region bounds, mute/solo, tempo map, bpm, beatsPerBar, rate, quantize.

3. Instrumentation

-   Add counters and timings for: batched events per window, deadlines hit/missed, average latency.
-   Expose a minimal debug UI readout (optional) or log to `utils/debug-log.ts` under a flag.

Acceptance criteria

-   Dragging tracks horizontally keeps 60fps UI with no audible scheduling stutter.
-   (If worker enabled) Worker message sizes and frequency drop measurably vs. naive full-state sends.
-   Debug metrics are accessible in development mode.

Quality gates

-   Build/Typecheck: PASS
-   Add a micro-benchmark or assertion-based tests for the diffing function.

---

## Phase 6 — UI integration (lanes, DnD, drag + snapping)

Objectives

-   Provide track lanes with DnD for MIDI files.
-   Enable horizontal drag to change `offsetSec` with bar snapping (Alt to bypass).
-   Render bar grid lines responsive to tempo map and `beatsPerBar`.

Implementation steps

1. Lanes and rows

-   Add components under `src/ui/panels/timeline/`:
    -   `TrackLanes.tsx` — scrollable lanes area below header/controls.
    -   `TrackRow.tsx` — represents a single track; full-lane drag or a handle at the left.

2. DnD

-   On file drop (MIDI) into `TrackLanes`, compute `dropTimeSec` from pixel→seconds using the current timeline scale.
-   Snap to bar using wrappers: `seconds→beats→bars→round→seconds`.
-   Dispatch `addMidiTrack({ name, file, offsetSec: dropTimeSecSnapped })`.
-   Provide a hover line showing the snapped bar position under cursor.

3. Dragging tracks

-   On drag, compute candidate time from delta pixels; if quantize is on or default snapping applies, snap as above.
-   While dragging, show ghost and snapped bar marker.
-   On mouseup, commit `setTrackOffset(id, snappedSec)`; optionally update during drag for live feedback (throttled).
-   Alt/Option key disables snapping during the gesture.

4. Grid rendering

-   Render vertical bar lines using tempo map segments and `beatsPerBar` so lines move with tempo changes. You can also leverage `TimingManager.getBeatGridInWindow(startSec, endSec)` for precise beat/bar markers.

5. Keyboard nudging

-   Update `hooks/useBarNudge.ts` to use `tempo-utils` (unified conversions) and store-backed `beatsPerBar` and `globalBpm` fallback. Implement `useTrackBarNudge(trackId)` to adjust `offsetSec` by ±1 bar via wrappers.

Acceptance criteria

-   Dropping a MIDI file creates a track at the snapped drop position.
-   Dragging a track horizontally updates `offsetSec` and snaps to bars by default; holding Alt disables snapping.
-   Bar grid reflects tempo map changes and `beatsPerBar`.
-   `useBarNudge` uses unified conversions.

Quality gates

-   Build/Typecheck: PASS
-   Interaction smoke tests: drag, snap, Alt bypass, DnD creation, bar grid alignment.

---

## Phase 7 — Deterministic export

Objectives

-   Make export deterministic and tempo-accurate across machines.
-   Ensure track offsets and bar/tempo relationships are preserved in exported media.

Implementation steps

1. Deterministic stepping (repo reality)

-   Exporters already step at fixed `1/fps` and call `visualizer.renderAtTime(t)`, which is deterministic for visuals.
-   If the scheduler from Phase 3 is adopted, add a small simulated clock to drive `compileWindow` deterministically during export.

2. Export integration

-   In `src/export/video-exporter.ts` and `src/export/image-sequence-generator.ts`, use the simulated clock to drive frame-accurate scheduling with consistent offsets.

3. Verification

-   For a sample project with tempo map and offsets, render twice and verify identical event timestamps across runs.

Acceptance criteria

-   Exported outputs are consistent between runs on the same machine.
-   (If scheduler is integrated) Scheduled event times during export match those produced during live playback within expected quantization tolerance.

Quality gates

-   Build/Typecheck: PASS
-   Add a deterministic test for the simulated clock driving a short clip.

---

## Cross-phase acceptance (from v6)

-   Global BPM and beats-per-bar configurable; used for fallback/grid.
-   DnD of MIDI files creates tracks at snapped positions.
-   Dragging tracks updates `offsetSec` and snaps to bars; Alt disables snapping.
-   Bar snapping respects tempo maps; markers align with `TempoMapEntry` segments.
-   `useBarNudge` uses normalized conversions and respects `beatsPerBar`.

## Notes and risks

-   Mixed meters (changing time signatures) remain out of scope for this phase; snapping uses a constant `beatsPerBar`.
-   Audio tracks will be added later; the lanes/offset/scheduler APIs are designed to generalize.
-   Authoritative schedule remains seconds-based to preserve determinism.

## Suggested test matrix (incremental)

-   Tempo map edge cases: long segments, rapid changes, empty map.
-   Round-trip conversions s→b→s and s→bars→s, with and without maps.
-   Snapping behaviors around bar boundaries and exactly-on-boundary cases.
-   Drag/DnD throttling and worker diffs under stress (e.g., continuous drag for 5 seconds).

## Traceability

Map v6 phases to v7 details:

-   v6 Phases 0–7 correspond 1:1 to v7 sections with explicit objectives, steps, and acceptance criteria, plus quality gates and testing guidance.

## Feasibility review — repo-specific notes and assumptions

Nuances and adjustments confirmed by code review

-   Single clock authority: `VisualizerContext` provides the live clock (visualizer.currentTime) and mirrors to the store. Avoid adding a second transport clock now.
-   Timing helpers duplication: Consolidate on `src/core/timing/tempo-utils.ts`. Standardize `TempoMapEntry` under `src/core/timing/timeline.ts`. Remove usages of `src/core/timing/timeline-helpers.ts` (notably in `src/hooks/useBarNudge.ts`).
-   Rate: Add `transport.rate` but document it as inactive for live playback until a worker or visualizer rate control exists.

Top 3 assumptions and their status

1. Unified tempo conversions used everywhere

-   Status: False. Action: migrate to `tempo-utils.ts`, deprecate `timeline-helpers.ts`, unify `TempoMapEntry`.

2. Store is the single transport source of truth

-   Status: Partially false. Action: use the visualizer/store time as the single clock source for now; avoid a parallel transport clock.

3. Adding `beatsPerBar` and `globalBpm` to the store is sufficient for snapping/grid

-   Status: True (needs implementation). Action: add these fields and use `60 / globalBpm` as fallback SPB.
