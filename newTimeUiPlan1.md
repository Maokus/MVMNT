# Timeline UI Overhaul — Implementation Plan (Plan v1)

This plan proposes a DAW‑style timeline with grid, bar labels, draggable MIDI clips, a playhead, seekable ruler, and loop braces, integrated with the existing timing and transport system.

## Requirements coverage

-   Grid: horizontal lane separators + vertical musical-time grid per quantize setting.
-   Bar labels: small numbers above the grid every few lines (bars).
-   MIDI clip rectangles: width reflects clip length; dragging moves along time (updates track offset).
-   Track offset: stored in beats from the first beat (not seconds) while preserving existing behavior.
-   Playhead: vertical line that scrolls with playback and reflects current track time.
-   Seek: click on the top ruler area to seek (quantized as configured).
-   Loop braces: draggable start/end braces in the same top area to set playback range.

Status per item appears at the end in Quality Gates/Checklist.

---

## What exists today (grounded in repo)

-   State and transport
    -   `src/state/timelineStore.ts` exposes transport and timeline view.
        -   Current time: `timeline.currentTimeSec` (seconds)
        -   Transport: { isPlaying, rate, quantize: 'off' | 'bar', loopEnabled, loopStartSec, loopEndSec }
        -   Tracks: currently store offset in seconds: `TimelineTrack.offsetSec`
        -   Conversions: master tempo map + `globalBpm` and `beatsPerBar`.
        -   Actions: `seek`, `scrub`, `setLoopRange`, `setLoopEnabled`, `setQuantize`, `setTimelineView`, `setTrackOffset`.
    -   Selectors/utilities: `src/state/selectors/timing.ts` and `@core/timing/tempo-utils` provide `seconds↔beats↔bars` conversions.
-   Timeline UI
    -   `src/ui/panels/TimelinePanel/TrackLanes.tsx` already renders vertical beat/bar grid lines and a simple draggable block per track (fixed width). It supports snapping to bars via `transport.quantize` and Option/Alt to bypass. It supports drop-to-create tracks with snapping.
    -   There’s no top “ruler” with bar labels, no horizontal lane separators, the clip width is not based on MIDI length, and no playhead/loop braces yet.
-   Visualizer
    -   `src/core/visualizer-core.ts` supports explicit playback range via `setPlayRange(startSec, endSec)` and seeks. We should keep this in sync with the timeline loop braces.

---

## Data model changes (minimal, backwards-compatible)

Goal: “The offset of the track is stored in beats from the first beat.” Maintain seconds as a derived view for rendering/legacy callers.

-   Extend `TimelineTrack`:
    -   Add `offsetBeats: number` (new source of truth).
    -   Keep `offsetSec` for compatibility, but derive it from `offsetBeats` on read paths. During a transition phase, both may exist.
-   Store actions:
    -   New: `setTrackOffsetBeats(id: string, beats: number)`.
    -   Keep `setTrackOffset(id, offsetSec)` but implement as: convert seconds→beats using selectors, write to `offsetBeats`.
-   Migration/initialization:
    -   When reading tracks without `offsetBeats`, compute `offsetBeats = secondsToBeats(tempoMap, offsetSec)` once (lazy migration in `updateTrack`/`setTrackOffset` and at `addMidiTrack`).
-   Selectors:
    -   Provide helpers for consistent use:
        -   `getTrackOffsetBeats(state, id)` and `getTrackOffsetSec(state, id)` (latter converts beats→seconds via tempo map).

Rationale: storing in beats is tempo-robust and aligns with DAW semantics; seconds conversion remains available for rendering.

---

## UI and interactions

### 1) Timeline Ruler (new component)

-   File: `src/ui/panels/TimelinePanel/TimelineRuler.tsx` (new)
-   Responsibilities:
    -   Draw the bar grid labels (numbers) above lanes.
    -   Provide seek-on-click area across the full width.
    -   Display and allow dragging “loop braces” for start and end.
    -   Show a playhead hairline synced with `timeline.currentTimeSec`.
-   Behavior:
    -   Clicking the ruler seeks: uses `seek(sec)` with quantization (`transport.quantize`), Option/Alt bypasses.
    -   Dragging braces updates `transport.loopStartSec/loopEndSec`. Holding Shift constrains to bars; Option/Alt bypasses snapping.
    -   If `loopEnabled` is true, draw highlighted region between braces.
    -   Labels: show every bar index within view; optional minor ticks for beats when zoomed in (future extension).

### 2) Grid improvements in lanes

-   `TrackLanes.tsx`:
    -   Horizontal separators: render 1px lines between lanes.
    -   Reuse vertical grid (already implemented). Optional alternating row background for contrast.

### 3) MIDI clips per track

-   Clip extent in seconds comes from cached MIDI for the track:
    -   Use `midiCache[track.midiSourceId ?? id].notesRaw` to compute local clip start/end (track-local seconds). Most often `start` is 0.
    -   Clip width = `localClipDuration` mapped via `toX(endSec + offset) - toX(startSec + offset)`.
    -   If track has `regionStartSec/regionEndSec`, clip rectangle shows only the active region. Optionally render a faint “ghost” for trimmed parts.
-   Dragging a clip changes offset:
    -   Compute candidate sec from dx, convert to beats with selectors, snap as needed, then store via `setTrackOffsetBeats`.
    -   Tooltip/label shows offset in bars.beats for precision (e.g., “+3|2”).

### 4) Playhead

-   A vertical line drawn across the ruler and lanes at `timeline.currentTimeSec`.
-   Updates on each render frame. Two options:
    -   Subscribe to store changes and `requestAnimationFrame` throttle to ~FPS.
    -   Or rely on periodic renders due to `VisualizerCore` RAF; minimal overhead expected.

### 5) Zoom/pan (out of scope for now)

-   Keep using the existing `timelineView` start/end. Future work could add mouse wheel/drag for zoom/pan.

---

## Quantization and snapping

-   Use existing `transport.quantize` ('off'|'bar') with Option/Alt bypass.
-   Helpers in `src/state/selectors/timing.ts` already provide `secondsToBars` and `barsToSeconds`.
-   For future: extend quantize options to beat/sub-beat: e.g., 'beat', '1/8', '1/16'. Keep the store API open for extension.

---

## Integration with Visualizer

-   On loop brace updates, call `VisualizerCore.setPlayRange(loopStartSec, loopEndSec)` from the timeline panel (or via a small controller hook), so the renderer uses the same window.
-   On seek, call store `seek(sec)` which updates `timeline.currentTimeSec`; if the visualizer listens to this (or we wire a small mediator), also call `VisualizerCore.seek(sec)` to keep them in lockstep.
-   On play/pause/toggle, continue using transport actions; no change needed. The playhead reflects current time.

---

## File‑level changes (by phase)

### Phase 1: Data model + selectors

-   `src/state/timelineStore.ts`
    -   Extend `TimelineTrack` with `offsetBeats?: number`.
    -   Add `setTrackOffsetBeats` action; update `setTrackOffset` to delegate.
    -   In `addMidiTrack`, initialize `offsetBeats` from provided `offsetSec` or default 0.
-   `src/state/selectors/timelineSelectors.ts`
    -   Add `getTrackOffsetBeats/Seconds` helpers.
    -   Update windowed note computations to use `offsetSec` from beats (keep API identical externally).
-   Tests: `src/state/tests/timelineStore.test.ts`
    -   Add tests for beats↔seconds storage conversions and dragging logic invariants.

### Phase 2: Ruler + grid + playhead (UI)

-   New `src/ui/panels/TimelinePanel/TimelineRuler.tsx`:
    -   Draw bar labels, ticks, playhead, loop region, and braces.
    -   Seek-on-click and brace drag interactions.
-   Update `TimelinePanel` to include the ruler above `TrackLanes`.
-   `TrackLanes.tsx`
    -   Horizontal separators, alternating row background.
    -   Render playhead overlay (shared source of truth with ruler).

### Phase 3: MIDI clip width + drag behavior

-   `TrackLanes.tsx`
    -   Compute clip duration from `midiCache` and map to width.
    -   Clip drag: store offset in beats using `setTrackOffsetBeats` with snapping.
    -   Tooltip with formatted bars|beats offset.

### Phase 4: Loop sync with VisualizerCore

-   Add a small mediator hook `useSyncVisualizerPlayRange(vis: MIDIVisualizerCore)` inside the TimelinePanel to call `vis.setPlayRange(loopStartSec, loopEndSec)` and `vis.seek()` on store changes.
-   Optional: when loop wraps in store (`setCurrentTimeSec` already wraps when playing+loopEnabled), ensure visualizer time update is propagated.

### Phase 5: Polishing

-   Accessibility: focusable braces and keyboard nudge (←/→ adjusts by quantize unit; add Shift for larger step).
-   Performance: memoize grid tick generation and clip note windows; use `ResizeObserver` (already present) and `requestAnimationFrame` throttling for playhead redraw.
-   Visual details: subtle grid colors, active loop region tint, hovered brace highlight, lane hover line.

---

## Algorithms and calculations

-   Bars and beats
    -   Use `secondsToBeats/BeatsToSeconds` with `beatsPerBar` for bars conversions.
-   Clip size
    -   For each track: derive `localClipStartSec = min(notesRaw.startTime)`, `localClipEndSec = max(notesRaw.endTime)`; default to [0,0] if empty.
    -   Apply region trimming if set.
-   Drag snapping
    -   Candidate seconds → bars, round as per quantize, then `barsToSeconds` back for rendering and convert to `offsetBeats` for storage.
-   Loop braces
    -   On drag: candidate sec computed from pointer → apply snapping rules → write to store via `setLoopRange`.

---

## Edge cases

-   No MIDI on a track: render an empty placeholder clip with small width and show “No data”.
-   Tempo map changes: offsets in beats keep clips musically aligned; seconds are recalculated on the fly.
-   Loop start > end or equal: clamp and prevent crossing; keep minimal length epsilon.
-   Extremely zoomed out: hide beat ticks, show only bar labels; prevent label overlap with simple density check.
-   Playback outside view: playhead still renders (off-screen); optional auto-scroll later.

---

## Minimal API surface (contracts)

-   Inputs
    -   State: `timelineView { startSec, endSec }`, `transport`, `timeline` (bpm, bpb, tempo map), tracks (+midiCache).
    -   User events: pointer interactions on ruler (seek, braces) and clip drag.
-   Outputs
    -   State mutations: `seek`, `setLoopRange`, `setLoopEnabled`, `setTrackOffsetBeats`.
    -   Visualizer sync: `vis.setPlayRange`, `vis.seek` (optional direct calls from a mediator hook).
-   Error modes
    -   Invalid numbers → clamp and ignore; safe defaults.
    -   Crossed braces → swap or lock to min range.

---

## Quality gates and validation

-   Build/lint/typecheck: PASS when new types/actions added.
-   Unit tests:
    -   beats/seconds conversions for offset storage.
    -   Seek/brace snapping behavior with 'off' vs 'bar'.
    -   Clip width calculation across tempo changes and regions.
-   Smoke test:
    -   Add a MIDI track, drag clip; confirm offset displays correctly and persists.
    -   Click ruler to seek; enable loop; drag braces; press Play; observe playhead and visualizer range.

---

## Estimated work breakdown

-   Phase 1 (store/selectors/types): 3–5 hrs
-   Phase 2 (ruler + grid + playhead): 5–8 hrs
-   Phase 3 (clip width + drag): 3–5 hrs
-   Phase 4 (visualizer sync): 1–2 hrs
-   Phase 5 (polish/tests): 3–5 hrs

---

## Checklist (requirements mapping)

-   DAW-like grid with horizontal separators and vertical musical grid: Planned in Phase 2 (TrackLanes + Ruler).
-   Bar numbers above grid: Planned in Phase 2 (Ruler labels).
-   Rectangles per track with width = clip length; drag to move: Planned in Phase 3.
-   Offset stored in beats from first beat: Planned in Phase 1 (data model + actions + migration).
-   Playhead scrolling line: Planned in Phase 2.
-   Click ruler to seek: Planned in Phase 2.
-   Loop braces to set start/end: Planned in Phase 2 + store wiring; Visualizer sync in Phase 4.

---

If you want, I can start with Phase 1 changes (types + actions + selectors) and wire the new `TimelineRuler` skeleton next.
