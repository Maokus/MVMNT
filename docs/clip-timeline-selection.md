# Clip Timeline Selection

The clip view is the `clips` tab in the timeline panel. Its selection state is stored separately from scene element, track, and automation keyframe selection so clip editing commands can know which domain is active.

## State

Clip-view selection lives in `useSelectionStore`:

- `activeTarget`: set to `'clipTimeline'` when a clip-view selection is active.
- `clipTimelineSelection`: the current point, range, or explicit clip-list selection.

The selection is not stored on timeline tracks or MIDI clips. Clips remain plain timeline data; the selection store holds transient UI state.

```ts
type ClipTimelineSelection =
    | { type: 'point'; point: { trackId: string; tick: number } }
    | { type: 'range'; range: { startTick: number; endTick: number; trackIds: string[] } }
    | { type: 'clips'; clips: Array<{ trackId: string; clipId: string }> };
```

Calling `selectClipTimeline(selection)` also clears element, track, and keyframe selections. Calling `clearSelection('clipTimeline')` clears only the clip-view selection and resets `activeTarget` when the clip timeline was active.

Use `selectClipTimeline()` for user-facing clip gestures and commands. The lower-level
`setClipTimelineSelection()` setter only patches the stored value and does not change
`activeTarget` or clear other selection domains.

## Selection Modes

### Point

A point selection represents an insertion location in the clip lane. It is created by clicking empty space in the clip view without dragging far enough to create a marquee range.

Point selections store:

- `trackId`: the track row under the pointer.
- `tick`: the snapped timeline tick under the pointer.

The UI renders this as a vertical marker on the selected track row.

### Range

A range selection represents a rectangular time-and-track area. It is created by dragging on empty clip-lane background.

Range selections store:

- `startTick` and `endTick`: snapped timeline bounds.
- `trackIds`: every visible track row covered by the marquee.

The UI renders a selection box spanning the selected track rows and time range. MIDI clips are considered selected by a range when their absolute timeline bounds intersect the range and their track is included in `trackIds`.

### Clips

A clips selection is an explicit list of MIDI clip references. It is created by clicking a MIDI clip, shift-clicking/cmd-clicking to toggle clips, or converting a range to concrete clip references for clipboard and drag operations.

Clip selections store stable references:

- `trackId`: the track currently containing the clip.
- `clipId`: the clip id within that track.

The UI renders each selected clip with selected styling. It also renders a per-track selection overlay spanning the min/max timeline bounds of the selected clips on that track.

## Pointer Behavior

MIDI clip blocks own their drag gesture. On pointer down they:

- stop propagation so the background marquee handler does not start.
- prevent default browser behavior so native text/image dragging does not steal the gesture.
- capture the pointer and store the active pointer id.
- select the clicked clip, unless it is already part of the current concrete selection.

During movement, drag and resize handlers also prevent default browser behavior. On pointer up, pointer cancel, or a matching window-level pointer-up fallback, the gesture is committed and pointer capture is released. This fallback prevents clips from remaining attached to the mouse if the browser or OS interrupts normal pointer delivery.

Native `dragstart` is cancelled on MIDI clip blocks. The clip DOM node is also marked `draggable={false}` and styled with disabled user selection and touch-action so the app gesture stays authoritative.

Background clicks and drags are handled by `useMarqueeSelect()`:

- left-clicking empty clip-lane space starts a provisional marquee and clears the old
  clip timeline selection immediately.
- releasing within a 3 px threshold creates a point selection on the row under the
  pointer.
- dragging beyond that threshold creates a range selection over the snapped time bounds
  and all covered visible track rows.
- holding Ctrl/Cmd while resolving the pointer position bypasses normal snapping.

MIDI clip blocks convert the current selection into concrete clip refs before drag or
resize. This means a range selection can be dragged as a group after the user starts a
gesture on one of the clips inside the range.

Dragging clips horizontally updates clip offsets. Dragging vertically previews
cross-track movement and commits the selected clips to their target MIDI tracks on
pointer up. If the pointer crosses a non-MIDI row, the preview snaps to the closest MIDI
track.

Resize handles edit a clip's local region bounds. A left resize writes
`regionStartTick`, and a right resize writes `regionEndTick`; bounds that reach the
source start/end are stored as `undefined` so untrimmed clips stay compact.

## Resolving Selected Clips

Code that needs concrete MIDI clips should resolve the current `clipTimelineSelection` against the timeline store rather than reading clip data from the selection store. `getMidiClipsInTimelineSelection()` performs this resolution for clipboard and group-drag workflows:

- `clips` selections return their stored refs.
- `range` selections return MIDI clips whose timeline bounds intersect the selected range.
- `point` and `null` selections return no clip refs.

This keeps the selection store lightweight and avoids duplicating timeline data.

Resolution is intentionally store-relative:

- disabled clips are ignored when resolving a range selection.
- stale explicit refs are harmless; command code checks the timeline store before
  applying mutations.
- returned refs are ordered by `tracksOrder` and then by each track's clip order.

## Keyboard Commands

Timeline navigation owns clip-selection shortcuts when `activeTarget` is
`'clipTimeline'`:

- Cmd/Ctrl+A selects every enabled MIDI clip on every MIDI track.
- Cmd/Ctrl+C copies a range or clips selection into the in-memory MIDI clip clipboard.
- Cmd/Ctrl+X copies the selection, removes the selected clips, and clears clip selection.
- Cmd/Ctrl+V pastes from the MIDI clip clipboard and selects the pasted clips.
- Cmd/Ctrl+D duplicates the selected clips immediately after the selected block.
- Delete/Backspace removes selected clips, or clears an empty point/range selection.
- Shift+2 zooms to the current clip point, range, or selected clip bounds.
- F frames the current selection, falling back to the playhead when nothing is selected.

Paste destination is derived from the active selection:

- range selections paste to the range start on the first selected MIDI track.
- point selections paste to the point tick and track.
- clips selections paste to the earliest selected clip offset on the first selected MIDI
  track in timeline order.
- if no clip selection is usable, paste falls back to the selected MIDI track at the
  playhead, then the first MIDI track at the playhead.

The clipboard payload stores MIDI source cache entries alongside clip refs. If a paste
would extend beyond the available destination MIDI tracks, the paste command creates
additional MIDI tracks and maps source rows onto them.

## Persistence

Clip-view selection is UI state and is omitted from saved scene files. Loading a scene should restore timeline content, not the previous editing selection.
