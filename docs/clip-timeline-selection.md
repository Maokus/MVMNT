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

## Resolving Selected Clips

Code that needs concrete MIDI clips should resolve the current `clipTimelineSelection` against the timeline store rather than reading clip data from the selection store. `getMidiClipsInTimelineSelection()` performs this resolution for clipboard and group-drag workflows:

- `clips` selections return their stored refs.
- `range` selections return MIDI clips whose timeline bounds intersect the selected range.
- `point` and `null` selections return no clip refs.

This keeps the selection store lightweight and avoids duplicating timeline data.

## Persistence

Clip-view selection is UI state and is omitted from saved scene files. Loading a scene should restore timeline content, not the previous editing selection.
