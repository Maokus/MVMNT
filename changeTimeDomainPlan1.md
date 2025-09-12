# Migration Plan: Change Primary Time Domain from Seconds to Musical Time (Ticks/Beats/Bars)

> Goal: Make musical time (ticks as lowest resolution; beats/bars as aggregates) the authoritative domain for transport, timeline, scheduling, storage, and UI logic. Real-time seconds become a derived, cached view computed via tempo context (global BPM + tempo map). Backward compatibility is explicitly **not** required.

---

## Guiding Principles

1. Single Source of Truth: Store canonical positions/durations as ticks (integer) or beats (float). Seconds are always derived.
2. Determinism Under Tempo Change: Changing BPM or tempo map must instantly update any seconds-based view without mutating canonical musical positions.
3. Explicit Conversion Layer: All seconds<->ticks transformations centralized (no ad‑hoc math in UI/components).
4. Progressive Refactor: Decompose into coherent phases enabling partial verification.
5. Low Drift: Remove dual offsetSec/offsetBeats fields; keep only musical domain + computed accessors.
6. Future-Proof: Prepare for per-track tempo, nested meters, variable PPQ, and offline render alignment.

---

## High-Level Architecture After Migration

-   Timeline Store: `currentTick`, `loopStartTick`, `playbackRangeTicks`, `viewWindowTicks`, `tracks[].offsetTicks`, `notesRaw[].startTick/endTick` (ticks canonical).
-   Transport: Operates in ticks; playback rate maps ticks->seconds using active tempo map each animation frame / scheduler pulse.
-   Tempo Context: Unified `TimingManager` (or lightweight adapter) provides fast conversions: ticks<->beats<->seconds. Precomputes tempo segments.
-   UI Rulers & Grids: Render from ticks/beats; derive pixel positions via ticks->seconds only when necessary for easing with existing animation code or to sync with external real-time visualizer loops.
-   Export: Simulated clock iterates frames -> targetSeconds -> convert to ticks to gather events.
-   MIDI Ingestion: Normalize all events to ticks immediately (use file TPQ -> internal canonical TPQ). Beats optional (computed on demand from ticks / PPQ).

---

## Domain Model Choices

| Concept               | Canonical                                                 | Rationale                                                           |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Base resolution       | `tick` (int)                                              | Stable integer arithmetic, lossless relative to PPQ; easy snapping. |
| Track offset          | ticks                                                     | Uniform with note events; avoids dual maintenance.                  |
| Loop / playback range | ticks                                                     | Accurately aligns with musical boundaries.                          |
| Selection / editing   | ticks (with display in bars.beats.ticks)                  | Precise; UI can format.                                             |
| Tempo map anchor      | seconds (input) + derived cumulative beats & tick offsets | Keep original spec; precompute mapping to accelerate conversions.   |
| Rendering scheduling  | seconds (derived per frame from currentTick)              | Renderer ultimately bound to wall clock / RAF / export time.        |

Derived fields (seconds) never persisted in store—only computed selectors or memoized caches.

---

## Phase Overview

1. Foundations & Data Model Introduction
2. Dual-Write Transitional Layer (Optional Light Bridge)
3. Transport & Playback Core Migration
4. Timeline Store Purge of Seconds Fields
5. UI & Component Refactor (Ruler, Clips, Loop Handles, Scrub)
6. MIDI & Ingestion Normalization
7. Export / Rendering Alignment
8. Cleanup & Hardening (Perf, Tests, Tooling)
9. Advanced Extensions (Optional / Future)

Each phase lists: Objective, Scope, Steps, Acceptance Criteria, Risks/Mitigations.

---

## Phase 1: Foundations & Data Model Introduction

**Objective:** Introduce tick-centric types/utilities without breaking current behavior.

**Scope:**

-   Add global `TimingDomain` module with interfaces: `Tick`, `Beats`, `Seconds` branded types (TypeScript nominal typing via intersections) for clarity.
-   Extend `TimingManager` with: `ticksToBeats()`, `beatsToTicks()`, `ticksToSeconds()`, `secondsToTicks()` using cached PPQ + tempo segments.
-   Decide canonical internal PPQ (e.g., 960). Provide conversion from source MIDI TPQ -> canonical ticks when ingesting.

**Steps:**

1. Create `@core/timing/time-domain.ts` with branded types + helpers.
2. Add tick conversion methods to `TimingManager` (some already exist; ensure symmetrical beats<->ticks utilities + fast path without tempo map).
3. Add unit tests for pure conversions (fixed tempo & multi-segment tempo map edge cases: boundary, mid-segment, last segment extrapolation).
4. Introduce selector layer: `selectCurrentTick`, `selectSecondsForTick(tick)`, etc. (still derived from existing seconds store values until Phase 3).

**Acceptance Criteria:**

-   Tests: ticks<->seconds roundtrip error < 1 microsecond \* (#segments+1) under fixed tempo and tempo map scenarios.
-   No existing UI regressions; console warnings allowed if unused exports.
-   Lint & type check pass.

**Risks/Mitigation:** Minor: confusion on where conversions reside → central barrel export & docs.

---

## Phase 2: Dual-Write Transitional Layer (Optional but Recommended if Large UI Surface)

**Objective:** Begin storing tick fields in parallel to existing seconds fields to prepare for cutover.

**Scope:**

-   Augment timeline store with parallel tick state (e.g., `currentTick`, `loopStartTick`, `tracks[].offsetTicks`). Keep updates in sync.
-   Provide write APIs that accept musical inputs (bars/beats/ticks) and maintain both representations.

**Steps:**

1. Add `currentTick` computed from `currentTimeSec` at store init.
2. On every `setCurrentTimeSec`, also set `currentTick` (using conversion) until Phase 3 removes seconds setter.
3. For track offset setters, compute & store `offsetTicks` and still maintain existing offsetSec for compatibility.
4. Add migration utility: `recomputeSecondsFromTicks()` for debugging parity.

**Acceptance Criteria:**

-   Toggling BPM updates seconds without changing tick counts (stability test).
-   Setting offsets via new `setTrackOffsetTicks()` yields identical visual positions as seconds version within 1 frame tolerance.

**Risks:** Drift or rounding mismatch. Mitigate by choosing deterministic rounding: floor for indices (e.g., grid), nearest for display.

---

## Phase 3: Transport & Playback Core Migration

**Objective:** Make transport operate solely in ticks; seconds become derived per frame.

**Scope:**

-   Replace `currentTimeSec` with `currentTick` as the authoritative playhead.
-   Animation loop / RAF obtains wall-clock delta → converts to ticks using tempo context (handle tempo map while playing).

**Steps:**

1. Introduce `PlaybackClock` abstraction: given lastRealTimestamp, lastTick, returns nextTick (supports tempo changes mid-playback; queries `TimingManager` each step for SPB at current position).
2. Refactor `visualizer-core` or wrapper to call `store.getState().currentTick` and compute seconds on the fly for render functions needing seconds.
3. Replace `setCurrentTimeSec()` calls with `setCurrentTick()` in transport actions.
4. Ensure loop boundaries & playback range comparisons done in ticks.
5. Add unit tests for play/pause/seek under tempo change mid-play (simulate tempo map insertion, BPM change while playing).

**Acceptance Criteria:**

-   Changing BPM while playing keeps musical position stable: A note scheduled at bar 5 triggers when `currentTick` reaches its tick range independent of new BPM.
-   Seeking to bar 3 beat 2 tick 0 positions playhead correctly (within <0.5 tick error).
-   Looping works using tick boundaries even if BPM changes inside loop.

**Risks:** Mid-play tempo changes causing discontinuities in tick->second mapping. Mitigate with per-frame recomputation; no cumulative floating drift (use integer ticks + rational multipliers, accumulate in beats not seconds when possible).

---

## Phase 4: Timeline Store Purge of Seconds Fields

**Objective:** Remove seconds fields as canonical; keep only ticks + derived selectors.

**Scope:**

-   Remove: `currentTimeSec`, `loopStartSec`, `loopEndSec`, `playbackRange.startSec/endSec`, `timelineView.startSec/endSec`, track `offsetSec`, note `startTime/endTime/duration` in store.
-   Provide selectors: `selectPlayheadSeconds`, `selectTimelineViewSeconds`, `selectTrackOffsetSeconds`, etc.
-   Cache conversions (memo by [tick, tempoVersionHash]) to avoid recomputation storms.

**Steps:**

1. Introduce `tempoVersionHash` incremented on BPM or tempo map change; attach to timing manager.
2. Implement memoized conversion helper `ticksToSecondsCached(tick, hash)`.
3. Strip seconds fields + update all actions to operate in ticks.
4. Update auto-range logic to compute content bounds using ticks; convert to seconds only for heuristics requiring time lengths (e.g., view padding).

**Acceptance Criteria:**

-   No seconds fields remain in store shape (TypeScript compile-time enforcement).
-   All tests from Phases 1–3 still pass.
-   UI renders identically (pixel diff within tolerance for a sample state snapshot).

**Risks:** Performance dip due to many conversions in selectors. Mitigate with caching strategy + coarse invalidation on tempo change.

---

## Phase 5: UI & Component Refactor

**Objective:** Update Timeline Panel & related UI to consume tick-based selectors and support musical editing.

**Scope:**

-   Ruler: Render bar/beat grid directly from ticks/beats (asks TimingManager for grid inside view tick window).
-   Clip Rendering: Position & width calculated in ticks; convert to pixels using seconds only if existing layout tied to time-scaling; else adopt tick->beat scaling factor.
-   Inputs (loop range, selection, offsets): Accept bar.beat.tick strings; parse → ticks.
-   Scrub / Drag: Horizontal drag delta -> ticks via dynamic conversion at pointer-down SPB snapshot (or recompute continuously with tempo map for accuracy).

**Steps:**

1. Create parsing/formatting utils: `formatTickAsBBT(tick)`, `parseBBT('4.2.120')`.
2. Replace use of `currentTimeSec` in components with `useSelectCurrentTick()` and local derived seconds if still needed for existing animations.
3. Ruler draws: ask timing manager `getBeatGridInTicks(startTick, endTick)` (new method) -> produce lines (bar emphasis vs beat lines).
4. Implement snap logic (bar, beat, subdivision) purely in ticks.
5. Update drag logic for clips: store original `offsetTicks`, add deltaTicks (converted from pointer movement/time scale).
6. Add keyboard navigation (jump beat/bar) using tick increments.

**Acceptance Criteria:**

-   UI updates live when BPM changes: ruler resizes but bar counts stable; clip lengths stable in beats.
-   Dragging a clip while altering BPM mid-drag doesn’t jitter (tick deltas stable).
-   Formatting: entering "5.1.0" jumps to bar5 beat1 tick0 accurately.

**Risks:** Mixed scaling assumptions in layout. Mitigate with central `timeScale` context providing pixelsPerTick derived from viewport (bars visible / width).

---

## Phase 6: MIDI & Ingestion Normalization

**Objective:** Ensure all MIDI data canonical in ticks; remove reliance on seconds inside `notesRaw`.

**Scope:**

-   Modify ingestion to produce `startTick/endTick` only; compute beats lazily for display if needed.
-   Remove seconds fields from `NoteRaw`; introduce accessor for derived seconds.
-   Provide mass migration function for existing cached notes (during hot reload / dev state persistence).

**Steps:**

1. Update `NoteRaw` type: remove `startTime/endTime/duration` (or mark deprecated) add `durationTicks`.
2. Adjust `buildNotesFromMIDI` to output ticks using canonical PPQ.
3. Provide selector `selectNotesForTrackSeconds(trackId)` performing ticks->seconds mapping on demand.
4. Update any rendering loops / exporters to use ticks->seconds conversions at the edge.

**Acceptance Criteria:**

-   All notes maintain same musical positions after BPM change (verified by snapshot test of BBT positions pre/post BPM).
-   Perf: fetching seconds for a 5k note track with caching under 5ms (baseline target; measure & record).

**Risks:** Large note sets causing conversion overhead. Mitigate by vectorized conversion (precompute secondsPerBeat segments; multiply arrays) + memoization.

---

## Phase 7: Export / Rendering Alignment

**Objective:** Align export pipeline to drive from ticks ensuring identical frame content independent of BPM changes after schedule creation.

**Scope:**

-   `SimulatedClock`: still frame->seconds; add `frameToTick()` helper using tempo context at frame time.
-   Scene Builder: request note events by tick window (convert frameSeconds -> ticks then window around that if needed).
-   Ensure deterministic outputs when BPM map changes between frames mid-export (lock tempo snapshot?).

**Steps:**

1. Add `ExportTimingSnapshot` capturing tempo segments at export start (option to lock for deterministic export even if user changes BPM mid-export UI).
2. Modify note retrieval to use tick ranges.
3. Add regression test: same project exported at BPM 120 then retimed to 90 mid-export -> export remains consistent if snapshot enabled.

**Acceptance Criteria:**

-   Exported video identical frame-wise with snapshot; differs appropriately if snapshot disabled.
-   No drift > 1 tick over 10 minute export scenario test (synthetic).

**Risks:** Snapshot vs live confusion. Mitigate with UI toggle + tooltip.

---

## Phase 8: Cleanup & Hardening

**Objective:** Remove deprecated code, finalize typings, add comprehensive test coverage, add developer docs.

**Scope:**

-   Delete all deprecated seconds-based fields/functions.
-   Add README `TIME_DOMAIN.md` explaining architecture, conversion patterns, performance notes.
-   Benchmarks for conversion throughput (ticks->seconds, grid generation).
-   Property-based tests (fuzz random tempo maps, random ticks).

**Steps:**

1. Remove transitional dual-write code & warnings.
2. Final pass to eliminate stray `offsetSec` etc.
3. Add jest benchmarks (or simple timing harness) logging ops/sec.
4. Write developer doc.

**Acceptance Criteria:**

-   Zero references to removed fields (grep check passes).
-   95%+ branch coverage in timing utilities.
-   Benchmarks recorded & documented.

**Risks:** Hidden dead code paths. Mitigate with coverage gating in CI.

---

## Phase 9: Advanced Extensions (Future)

-   Per-Track Tempo (local tempo envelopes) producing per-track tick<->second contexts.
-   Variable Time Signatures Map (meter changes) → extend grid generation.
-   Swing / Humanization layers operating in ticks pre-conversion.
-   Sub-Frame Interpolation (for smooth curves) using fractional ticks.
-   Offline deterministic scheduler for macro automation referencing ticks.

---

## Cross-Cutting Concerns

**Performance:**

-   Cache structure: `{ hash: tempoVersionHash, tick: number } -> seconds`. Use LRU or ring buffer sized to viewport + small margin.
-   Grid generation: iterate beats inside visible tick window only; detect tempo segment boundaries to avoid O(totalBeats).

**Precision:**

-   Use integers for ticks; beats = tick / PPQ; seconds derived via double precision.
-   Avoid cumulative floating addition in playback; compute tick from integral beat count or use rational microseconds per tick per segment.

**Testing Strategy:**

-   Unit: conversion math, tempo map boundaries (exact hit, epsilon before/after, last segment extrapolation).
-   Integration: playhead seek, loop under BPM change, clip drag mid-tempo change.
-   Snapshot: serialized tick store vs derived seconds rendering (pixel threshold).
-   Property: random tempo maps verifying beats->seconds->beats stability within tolerance.

**Refactor Safety Nets:**

-   Feature flag: `USE_TICK_DOMAIN` environment toggle for early incremental rollout (optional since backward compat not required, but useful during development).
-   Logging guard: dev-only warnings if component accesses deprecated seconds selectors.

**Data Migration (Dev State):**

-   Provide helper to transform persisted JSON: map `offsetSec` -> `offsetTicks = secondsToTicks(offsetSec)`, discard seconds.

---

## Acceptance Summary (Global Success Criteria)

-   Changing BPM or tempo map: visual clip lengths remain constant in bars; horizontal scaling adjusts smoothly; no manual recomputation hooks required.
-   All transport logic (play, pause, seek, loop) deterministic in tick space.
-   Store shape contains only musical time for temporal concepts.
-   Performance: baseline timeline interaction (scroll, zoom) within previous frame budget ±10%.
-   Documentation & tests articulate new model; contributors can implement new time-based features without adding seconds state.

---

## Implementation Ordering Notes

If project bandwidth is constrained, Phases 2 & 3 can merge (direct cutover) skipping dual-write. Ensure automated tests exist beforehand.

---

## Rollback Strategy

Given no backward compatibility requirement, rollback = revert branch to pre-migration commit. Keep a patch tag `pre-tick-domain` before Phase 4.

---

## Open Questions / Decisions (Resolve Early)

1. Canonical PPQ value? (Recommend 960 for finer subdivision; update ingestion scaling.)
2. Do we need fractional ticks for swing? (Probably not initially; derive swing offsets at render time.)
3. Should export always snapshot tempo map? (Likely yes for determinism.)
4. Meter changes timeline when added — stored as separate map or reuse tempo entries augmented with numerator/denominator? (Future Phase 9.)

---

## Next Immediate Actions

1. Implement Phase 1 foundations (time-domain module + tests).
2. Decide PPQ constant & integrate into ingestion pipeline.
3. Add tick selectors & ensure no circular dependencies.

End of Plan.
