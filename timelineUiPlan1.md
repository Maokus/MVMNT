# Timeline UI Implementation Plan (based on timelineDescription1.md)

This plan maps the current code to the desired timeline described in `timelineDescription1.md`, and outlines phases and concrete steps.

## Goals recap

-   Separate scroll areas with pinned labels/ruler and scrollable content.
-   Scroll sync: horizontal (ruler + content), vertical (labels + content).
-   Ruler & grid with dynamic ticks by zoom, bars/beats/subdivisions, snapping, loop markers.
-   Zoom & pan: horizontal zoom around cursor; pan via drag/scroll; clamp limits.
-   Track content: render MIDI clips per track row; position by start*zoom; width=duration*zoom; overlaps.
-   Playback & interaction: playhead synced to time; seek; select/drag; drag/resize clips; snap.
-   UX: allow negative space before 0, after end; smooth; hover tooltips.

## Current state (key files)

-   State store: `src/state/timelineStore.ts` with timelineView {startSec, endSec}, transport (play/pause/loop/quantize), track CRUD.
-   Time helpers: `src/state/selectors/timing.ts` for beats/bars conversions; used by lanes.
-   Timeline panel: `src/ui/panels/TimelinePanel/timeline-panel.tsx` renders TrackList and TrackLanes, centered transport.
-   Lanes: `src/ui/panels/TimelinePanel/TrackLanes.tsx` draws vertical musical grid, track rows, a draggable block per track (offset), DnD for MIDI, and a playhead hairline.
-   Visualizer bridge: `src/context/VisualizerContext.tsx` keeps visualizer and store in sync, including play range from loop or view.

## Phases

### Phase 1: Baseline fixes and cleanup (done here)

-   Fix play/pause resume to start from current playhead, not view start.
-   Simplify Track List to: name, eye (enabled), dustbin (delete).

### Phase 2: Ruler + scroll layout + sync

1. Layout split

-   Introduce a sticky header row height constant (RULER_HEIGHT) used by both list and lanes.
-   Create `TimelineRuler.tsx` above lanes; keep TrackList padded with RULER_HEIGHT spacer (already present) so rows align.
-   Wrap TrackList (left) and TrackLanes (right) in a container with:
    -   Left panel: vertical scroll, auto; sticky top spacer equals RULER_HEIGHT.
    -   Right panel: overflow:auto both; top contains ruler (sticky) and content below; horizontal scrollbar only on right.

2. Scroll sync

-   Implement shared refs + onScroll handlers to sync:
    -   Horizontal: ruler and lanes scrollLeft mirror.
    -   Vertical: TrackList and lanes scrollTop mirror.
-   Keep scroll positions in local component state; avoid store churn.

3. Ruler basics

-   In `TimelineRuler.tsx` render dynamic ticks for bars and beats based on zoom (view.end-start):
    -   Wide zoom: bars only; closer zoom: beats; extreme: subdivisions.
-   Label bars at the top; provide full-width click-to-seek area.
-   Show loop region as a highlighted range when transport.loopEnabled.

4. Playhead overlay

-   Render a vertical playhead line spanning ruler and lanes at timeline.currentTimeSec (already in lanes).
-   Share a small Playhead component so both ruler and lanes read from the same source of truth and draw at the same x.

### Phase 3: Zoom & pan (time axis only)

-   Mouse wheel + Ctrl/Meta for zoom; trackpad pinch to zoom if available:
    -   Zoom centered at cursor: convert cursor x to time, adjust view range around that time.
    -   Clamp min/max zoom extents; avoid too far in/out.
-   Horizontal panning: shift+wheel or middle-drag to move view window; clamp to [minTime, maxTime] with padding.
-   Maintain a small negative pre-roll (allow scroll before 0) and padding after end; clamp display to >= 0 while allowing seek negative optionally.

### Phase 4: Loop braces and snap

-   In ruler, draw draggable braces for loopStartSec/loopEndSec when loopEnabled.
-   Interactions:
    -   Click ruler: seek; respects quantize unless Alt/Option held.
    -   Drag braces: updates `setLoopRange`; Shift constrains to whole bars; Option bypasses snapping.
-   Keep `VisualizerCore.setPlayRange` in sync (already bridged via VisualizerContext effect relying on loop vs view).

### Phase 5: Track clips and interactions

-   Track clips render width based on MIDI local length (already computed in TrackLanes via notesRaw start/end) with offset adding timeline position.
-   Basic selection marquee across lanes; store selected notes/clips.
-   Drag clips horizontally (already supported for offset); implement edge handles for resize of regionStart/End.
-   Snapping uses transport.quantize; Alt bypass; surface current snap in tooltip.

### Phase 6: UX polish

-   Smooth animations for scroll and playhead using rAF and throttling (already basic in lanes/playhead).
-   Hover tooltips: show bar|beat + time, note info on clip hover.
-   Negative pre-roll and extra padding after content end; auto-scroll on playback optional.

## Implementation steps (actionable)

-   Add `src/ui/panels/TimelinePanel/TimelineRuler.tsx`:
    -   Props: width, onSeek(sec), render loop region, braces; consumes `timelineView` and transport from store; uses same scale util as lanes.
    -   Uses ResizeObserver to know width; draws ticks/labels; click/drag interactions.
-   Update `timeline-panel.tsx`:
    -   Create two scrollable containers: left list (vertical only), right content (both); include `TimelineRuler` atop the right container.
    -   Wire scroll sync via refs.
-   Refactor scale helpers from `TrackLanes.tsx` into shared `useTimeScale()` hook in `TimelinePanel` folder so both ruler and lanes use identical mapping and padding behavior.
-   Extend `TrackLanes.tsx` to consume shared scale hook and to render playhead via shared component; keep DnD hover snap line.
-   Implement zoom/pan handlers that update `setTimelineView(start,end)`; ensure clamping and min width.
-   Implement loop braces in `TimelineRuler.tsx` using `setLoopRange` and `setLoopEnabled`.
-   Ensure seek and braces honor quantize with Alt bypass; reuse existing `secondsToBars` and `barsToSeconds` helpers.
-   Keep `VisualizerContext` bridge intact; verify loop play range overrides view when enabled.

## Testing checklist

-   Click ruler to seek; press Play; playback starts at playhead.
-   Pause and resume; resumes exactly at paused time.
-   Toggle quantize 'bar'; seek snaps to bars; Alt bypass works.
-   Loop enabled; drag braces; playhead wraps within loop; visualizer clamps to range.
-   Zoom around cursor; ticks switch density (bars→beats→subdivisions) without popping.
-   Scroll sync: vertical (list+lanes) and horizontal (ruler+lanes) stay aligned.
-   DnD MIDI onto lanes with snapping; new track appears at snapped offset; list and lanes align.

## Notes

-   Performance: memoize tick generation; throttle playhead and scroll sync updates; prefer requestAnimationFrame.
-   Accessibility: ensure buttons are focusable; provide titles/tooltips; keyboard support for play/pause present via spacebar.
