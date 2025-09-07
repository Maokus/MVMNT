# New Timing System Plan v6 — Global tempo, tracks, drag + bar snapping

This plan implements the requested model: a global tempo (and optional tempo map), MIDI-first timeline tracks (one file per track), and dragging files/tracks along the x-axis with snapping to bars. It’s grounded in the current codebase (Zustand store, timing utils, timeline UI) and staged for incremental shipping.

## Scope recap

-   Global tempo, plus optional tempo map.
-   Tracks in timeline: MIDI now, Audio later. Each track corresponds to exactly one file.
-   Drag files into the timeline and drag tracks horizontally to change their start time; snap to bars.

## Data model updates

Add small, explicit fields to the store to support bar-snapping and a global tempo fallback:

-   `timeline.globalBpm: number` — default 120. Used as fallback when no tempo map is present.
-   `timeline.beatsPerBar: number` — default 4. Used by snapping logic and bar grid.
-   Actions: `setGlobalBpm(bpm: number)`, `setBeatsPerBar(n: number)`.

Derived selectors/utilities (non-stateful):

-   `getSecondsPerBeat({ bpm, map? })` — when `map` is empty, returns `60 / bpm`.
-   `secondsToBeats` and `beatsToSeconds` that call `@core/timing/tempo-utils` and pass the fallback SPB derived from `globalBpm`.
-   `secondsToBars(seconds) = secondsToBeats(seconds) / beatsPerBar`.
-   `barsToSeconds(bars) = beatsToSeconds(bars * beatsPerBar)`.

Note: Keep seconds as the transport domain in state (as today). Use the conversions only for snap/grid calculations and UI.

## Snapping behavior (bars)

Given a candidate timeline time `tSec` and grid parameters `{ beatsPerBar, map, bpm }`:

1. Convert to beats: `b = secondsToBeats(map, tSec, 60/bpm)`.
2. Convert to bars: `bars = b / beatsPerBar`.
3. Snap to nearest integer: `barsSnapped = round(bars)` (or floor/ceil depending on intended behavior; choose nearest by default).
4. Convert back: `tSecSnapped = beatsToSeconds(map, barsSnapped * beatsPerBar, 60/bpm)`.

Snap affordances:

-   Hold a modifier (e.g., Alt) to temporarily disable snapping.
-   Optional finer grids later (1/2 bar, 1/4 bar) with a `quantize` setting; v6 ships bar-only.

## Track semantics

-   Each `TimelineTrack` references exactly one file. For MIDI, that’s the current `midiSourceId` and cache entry.
-   The track’s start on the master timeline is `offsetSec`. Dragging the track horizontally modifies `offsetSec`.
-   Region bounds `regionStartSec`/`regionEndSec` remain track-local; snapping applies to the track’s global offset, not its internal region bounds (future enhancement could add region snapping, too).

## UI/UX changes

Timeline panel

-   Add a scrollable “track lanes” area below the existing header/controls.
-   Implement drag-and-drop of files into the track lanes area:
    -   On drop of a MIDI file: `addMidiTrack({ name, file, offsetSec: dropTimeSecSnapped })`.
    -   Compute `dropTimeSec` from pixel → seconds using the current `timelineView` scale; then snap to bar.
    -   Provide a hover line showing the snapped bar position under the cursor.

Track row interactions

-   Add a draggable handle on each row (or the full lane) to adjust `offsetSec` by dragging left/right.
-   While dragging, show ghost position and the snapped bar marker; write back `setTrackOffset(id, snappedSec)` on mouseup (and optionally during drag for live feedback).

Keyboard nudging

-   Reuse `useBarNudge` to nudge the playhead; add a variant `useTrackBarNudge(trackId)` to increment/decrement the selected track’s `offsetSec` by ±1 bar (respects tempo map and fallback).

## Phased roadmap (0–7), adapted from v5

Phase 0 — Cleanup and unification (now)

-   Unify tempo conversions on `@core/timing/tempo-utils`; deprecate `timeline-helpers` and remove any core→state coupling.
-   Standardize a single `TempoMapEntry` type in `@core/timing` and update imports in state/utils/tests.
-   Add store fields for `timeline.globalBpm` and `timeline.beatsPerBar` with actions; default 120 and 4.
-   Replace any private timing API usage in UI with public helpers; normalize imports to `@core/timing`.

Phase 1 — Read-only transport clock (`getNow`)

-   Implement a lightweight transport facade with `getNow(): { secTime, beats }`, anchored to `performance.now()` (optionally `AudioContext.currentTime`).
-   Drive the playhead/render tick via `getNow` while keeping authoritative position in seconds in the store.
-   Add selectors for derived beats/bars: `positionBeats`, `positionBars` using `globalBpm`, `beatsPerBar`, and tempo map.

Phase 2 — Store extensions for grid and rate

-   Add `transport.rate` (default 1.0), `transport.quantize?: 'bar'|'1/2'|'1/4'|off` (start with 'bar' and off).
-   Actions: `setRate`, `setQuantize` and existing `setBeatsPerBar`, `setGlobalBpm`.
-   Provide thin wrappers `secondsToBars`/`barsToSeconds` for consistent snapping across UI.

Phase 3 — Worker scheduler (MIDI-first)

-   Worker keeps a min-heap by absolute seconds; look-ahead 100–200ms; refill interval 25–50ms.
-   Compile per-track windows using track `offsetSec` and the master tempo map for conversions.
-   Messages: `INIT`, `UPDATE_STATE` (tempo map, bpm, beatsPerBar, tracks list, offsets, regions), `PLAY`, `PAUSE`, `SEEK`; outputs `SCHEDULE_BATCH`.
-   Ensure windows respect each track’s enabled/mute/solo flags and region trimming.

Phase 4 — Transport FSM, looping, quantization, and rate

-   Formalize play/pause/seek/loop FSM; flush worker queues on seeks and loop wraps.
-   Loop in seconds (authoritative) with helpers to set by bars: `{ startBars, endBars }`.
-   Apply quantized play/seek to nearest grid boundary (bar by default; extendable to finer divisions).
-   Rate affects `getNow` and scheduling time dilation; keep conversions beat-accurate.

Phase 5 — Diff bridge and perf hardening

-   Send compact diffs to the worker when tracks/tempo/grid change (avoid full-state resends).
-   Memoize heavy selectors; debounce mass edits (dragging, DnD) to keep UI responsive.
-   Instrument latency; set thresholds for missed deadlines and auto-adjust look-ahead.

Phase 6 — UI integration (lanes, DnD, drag + snapping)

-   Implement track lanes with pixel→seconds mapping from `timelineView`.
-   DnD: dropping a MIDI file creates a track at snapped drop time; hover shows snapped bar.
-   Track drag: horizontal drag adjusts `offsetSec` with bar snapping; Alt disables snapping.
-   Playhead and grids: render bar lines using tempo map + `beatsPerBar` so markers shift with tempo.

Phase 7 — Deterministic export

-   Add `SimulatedClock` and fixed-step render for export; make schedule compilation pure.
-   Ensure track offsets, bars, and tempo map yield identical results across machines.

## Acceptance criteria

-   Global BPM and beats-per-bar are configurable in state and used for fallback/time-grid.
-   Dropping a MIDI file onto the timeline creates a track at the (snapped) drop position.
-   Dragging a track horizontally updates `offsetSec` and snaps to bars by default; holding Alt disables snapping.
-   Bar snapping respects tempo maps: bar lines move with tempo changes; snapping positions align with `TempoMapEntry` segments.
-   `useBarNudge` uses the normalized conversions and respects `beatsPerBar`.

## Assumptions and verification

1. Assumption: The store already has a place for a master tempo map.

    - Verification: TRUE. `timelineStore.ts` has `timeline.masterTempoMap?: TempoMapEntry[]`.

2. Assumption: Each track corresponds to a single file, and its position on the timeline is controlled by `offsetSec`.

    - Verification: TRUE. `TimelineTrack` includes `offsetSec` and `midiSourceId`; there’s no multi-file track.

3. Assumption: There’s a `beatsPerBar` field we can use for bar snapping.
    - Verification: FALSE. No such field exists yet.
    - Fix: This plan adds `timeline.beatsPerBar` (default 4) and `setBeatsPerBar`. All snapping/grid helpers consume it.

Related checks:

-   `tempo-utils.ts` expects a fallback seconds-per-beat argument. We’ll pass `60 / globalBpm`.
-   `useBarNudge` currently imports from `timeline-helpers`. We’ll migrate it to the normalized wrappers in Phase A.

## Risks and follow-ups

-   Mixed meters (changing time signatures) are out of scope for v6. We’ll treat the “beat” as the tempo unit and use a constant `beatsPerBar` for snapping. Time signature maps can be added later.
-   Audio tracks: the snapping, offsets, and lanes API will support them; we’ll add an `AudioTrack` variant and a decoder/waveform renderer in a later phase.
-   Export: snapping/grid is read-only UI; the authoritative schedule remains seconds-based, so export remains deterministic.

## Minimal API outline (for reference)

-   `setGlobalBpm(bpm: number)`
-   `setBeatsPerBar(n: number)`
-   `secondsToBeats(state, s: number): number`
-   `beatsToSeconds(state, b: number): number`
-   `secondsToBars(state, s: number): number`
-   `barsToSeconds(state, bars: number): number`

Once these are in place, the snap-to-bars logic is a 4-line transformation with a clear fallback path.
