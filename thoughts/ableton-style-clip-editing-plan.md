# Ableton-Style Clip Editing Plan

Status: proposal

## What Already Works

The `midi-multi-clip-implementation-plan.md` is fully implemented (Phases 1–8):

- Multi-clip per MIDI track, non-overlap enforcement, undo/redo
- Range/point clip timeline selection (marquee + click)
- Horizontal clip drag (within the same track), multi-clip group drag
- Copy/paste with multi-track source/destination support in the clipboard format
- Viewport-culled rendering, resize handles, name editing

## What Is Missing for Ableton-Style Behaviour

### Gap 1: Cross-track clip drag (biggest)

`MidiClipBlock` drag only tracks `dx` → `offsetTicks`. There is no vertical movement,
no target-track detection, and no command to move a clip from one track to another.
Group drag (`setMultipleMidiClipOffsets`) also only moves clips horizontally.

### Gap 2: Explicit clip selection model

The current selection is range-based: `{startTick, endTick, trackIds[]}`. Clips are
resolved from the range lazily by `getMidiClipsInTimelineSelection`. This works well for
marquee/copy-paste but is imprecise for individual clip picking:

- Clicking clip A on track 1 (ticks 0–100), then shift-clicking clip B on track 3
  (ticks 500–600), would produce a range `[0–600, trackIds: [t1, t2, t3]]` that
  accidentally captures every clip on track 2 between 0–600.
- There is no shift-click or cmd-click to add or toggle individual clips.

### Gap 3: No Cmd+A to select all clips

### Gap 4: No Alt+drag duplicate

---

## Design Decisions

### Selection model

Add a third `ClipTimelineSelection` variant for explicit clip lists:

```ts
| { type: 'clips'; clips: TimelineClipRef[] }
```

- Clicking a clip → `type: 'clips'` with just that clip.
- Shift+click → extend `clips` array (add if absent, remove if already present).
- Marquee drag → `type: 'range'` (unchanged, captures everything in rectangle).
- Point click on empty lane → `type: 'point'` (unchanged, insertion point for paste).
- `getMidiClipsInTimelineSelection` handles all three variants.
- The range selection overlay in `TrackLanes` continues to compute a bounding rect over
  whichever clips are in the `clips` array; this handles non-rectangular multi-track
  selections by painting individual rows.

### Cross-track drag

Use store-level drag state for the ghost overlay, consistent with `_clipGroupDrag`:

```ts
_crossTrackDrag: CrossTrackDragState | null
_setCrossTrackDrag(state: CrossTrackDragState | null): void
```

Where:

```ts
interface CrossTrackDragState {
    // positions keyed by clipId for fast lookup during render
    previews: Array<{
        clipId: string;
        sourceTrackId: string;
        targetTrackId: string;
        previewOffsetTicks: number;
    }>;
    targetTrackId: string; // for row highlight
}
```

`MidiClipBlock` writes this state during pointerMove when dy crosses a row boundary.
`TrackLanes` reads it to:

1. Highlight the target row.
2. Render ghost clips at their target positions (as a z-20 overlay).

`MidiClipBlock` hides itself (opacity-30) when its clip appears in `_crossTrackDrag.previews`
so the ghost overlay is the only visual representation during cross-track drag.

On pointerUp, if any clip moved tracks, dispatch the new
`timeline.moveMidiClipsBetweenTracks` command instead of `updateMidiClips`.

### MidiClipBlock needs new props

```ts
trackIndex: number   // index in tracksOrder, for computing dy → target row
rowHeight: number    // already available in TrackRowBlock's parent
tracksOrder: string[] // can read from store inline or pass as prop
```

`TrackRowBlock` already knows `rowHeight` from the store. It can pass `trackIndex` from
the map index provided by `TrackLanes`.

---

## Phased Implementation

### Phase 1: Explicit clip selection (`type: 'clips'`)

**Files:**

- `src/state/selectionStore.ts`
- `src/workspace/panels/timeline/clipboard/midiClipClipboard.ts`
- `src/workspace/panels/timeline/tracks/TrackLanes.tsx`
- `src/workspace/panels/timeline/tracks/MidiClipBlock.tsx`
- `src/state/__tests__/selectionStore.timelineClips.test.ts`

**Tasks:**

1. Add `{ type: 'clips'; clips: TimelineClipRef[] }` to `ClipTimelineSelection` union in
   `selectionStore.ts`. Add `selectClipTimeline` already accepts the full union; extend the
   type there.

2. Update `getMidiClipsInTimelineSelection` in `midiClipClipboard.ts` to handle the new
   variant (just return `clips` array directly).

3. Change `selectForPointer()` in `MidiClipBlock`:
    - Without modifier: replace selection with `{ type: 'clips', clips: [{trackId, clipId}] }`.
    - With Shift held: extend existing `clips` array (toggle if already present, add otherwise).
      If current selection is a `range`, convert it to `clips` first by resolving via
      `getMidiClipsInTimelineSelection`, then add/toggle.
    - With Cmd/Ctrl: same as Shift (toggle individual clip).

4. Update the `isSelected` memo in `MidiClipBlock` to check all three variants:
    - `type: 'range'` → existing logic (overlap check).
    - `type: 'clips'` → `clips.some(c => c.trackId === trackId && c.clipId === clip.id)`.
    - `type: 'point'` → never selected.

5. Update `selectionOverlay` computation in `TrackLanes`:
    - `type: 'range'` → existing bounding rect.
    - `type: 'clips'` → compute per-track segments (one row highlight per track that has
      selected clips, spanning the tick range of clips on that track). Render each segment
      as a separate overlay div.
    - `type: 'point'` → unchanged.

6. Update delete handler in `useTimelineNavigation` to resolve clips from all three variants.

**Exit criteria:**

- Clicking a clip selects exactly that clip, not a range.
- Shift+clicking a second clip on a different track adds it without capturing unrelated clips.
- Marquee drag still produces a range selection.
- Copy/paste and delete still work correctly.
- Existing selection store tests pass; add new tests for `type: 'clips'` variant.

---

### Phase 2: Cross-track clip drag

**Files:**

- `src/state/timelineStore.ts`
- `src/state/timeline/patches.ts`
- `src/state/timeline/commandTypes.ts`
- `src/state/timeline/commands/midiClipCommands.ts` (new command)
- `src/workspace/panels/timeline/tracks/MidiClipBlock.tsx`
- `src/workspace/panels/timeline/tracks/TrackRowBlock.tsx`
- `src/workspace/panels/timeline/tracks/TrackLanes.tsx`

**New command: `timeline.moveMidiClipsBetweenTracks`**

```ts
interface MoveMidiClipsBetweenTracksInput {
    moves: Array<{
        sourceTrackId: string;
        clipId: string;
        destinationTrackId: string;
        newOffsetTicks: number;
    }>;
}
```

- Atomically removes each clip from its source track and inserts into destination track.
- Applies `enforceNonOverlappingMidiClips` on every affected destination track after all
  insertions.
- Single undo step: patch stores the complete before-state of all affected tracks.
- If `sourceTrackId === destinationTrackId` for all moves, delegate to existing
  `updateMidiClips` (horizontal-only move, no track change needed).

**Patch action:** `timeline/MOVE_MIDI_CLIPS_BETWEEN_TRACKS`
Payload: `{ before: Record<trackId, MidiClip[]>; after: Record<trackId, MidiClip[]> }`
(Records for both source and destination tracks for clean undo.)

**Store addition:**

```ts
_crossTrackDrag: CrossTrackDragState | null;
_setCrossTrackDrag(state: CrossTrackDragState | null): void;
moveMidiClipsBetweenTracks(input): Promise<void>;
```

**MidiClipBlock changes:**

Add props: `trackIndex: number`, `rowHeight: number`.

Extend `DragStart`:

```ts
type DragStart = {
    startX: number;
    startY: number; // ADD: clientY at pointer down
    baseOffsetTick: number;
    alt: boolean;
    groupBaseOffsets: Array<{
        trackId: string;
        clipId: string;
        offsetTicks: number;
        trackIndex: number; // ADD
    }>;
};
```

In `onPointerMove`, after computing horizontal snap:

- Compute `dy = e.clientY - drag.startY`.
- `trackDelta = Math.round(dy / rowHeight)`.
- If `trackDelta !== 0`: read `tracksOrder` from store, map each group offset's
  `trackIndex + trackDelta` to a new track id (clamping to valid range).
- Update `_crossTrackDrag` in store with computed previews.
- If `trackDelta === 0`: clear `_crossTrackDrag`.

In `onPointerUp`, check if any preview has `sourceTrackId !== targetTrackId`:

- Yes → dispatch `moveMidiClipsBetweenTracks` with all moves.
- No → existing horizontal-only path (`updateMidiClip` or `setMultipleMidiClipOffsets`).
- Always clear `_crossTrackDrag` on pointer up.

On pointer up without move (`!didMove`): clear `_crossTrackDrag`, no command.

**TrackRowBlock changes:**

- Accept `trackIndex: number` prop.
- Pass it and `rowHeight` through to `MidiClipBlock`.

**TrackLanes changes:**

1. Pass `trackIndex={idx}` to `TrackRowBlock` (index already available in the map).

2. Read `_crossTrackDrag` from store. Render ghost clip overlay:

```tsx
{
    crossTrackDrag &&
        crossTrackDrag.previews.map((preview) => {
            // Render a semi-transparent MidiClipBlock-like div at target position
            // Target row Y = tracksOrder.indexOf(preview.targetTrackId) * rowHeight
        });
}
```

3. Highlight target row: render a thin border or background tint on the row at
   `tracksOrder.indexOf(crossTrackDrag.targetTrackId)`.

**MidiClipBlock hide-self during cross-track drag:**

Add `isCrossDragging` check:

```ts
const isCrossDragging = useTimelineStore((s) => s._crossTrackDrag?.previews.some((p) => p.clipId === clip.id) ?? false);
```

Apply `opacity-30 pointer-events-none` when `isCrossDragging`.

**Exit criteria:**

- Dragging a clip vertically beyond a row boundary moves it to the target track.
- Multi-clip selection: all selected clips move to new tracks preserving relative offsets.
- Non-overlap is enforced on destination tracks.
- Undo restores clips to their original tracks in one step.
- Horizontal-only drags are unaffected.

---

### Phase 3: Cmd+A and UX polish

**Files:**

- `src/workspace/panels/timeline/hooks/useTimelineNavigation.ts`
- `src/workspace/panels/timeline/tracks/MidiClipBlock.tsx`

**Tasks:**

1. **Cmd+A** when `activeTarget === 'clipTimeline'`: select all enabled MIDI clips across
   all tracks. Produces `{ type: 'clips', clips: [...allClipRefs] }`. The selection
   overlay will highlight all clip rows.

2. **Escape** when `activeTarget === 'clipTimeline'`: clear selection (already works for
   range/point; verify it works for `type: 'clips'`).

3. **Alt+drag to duplicate:**
    - In `onPointerDown`, if `altKey` is held: before entering drag mode, copy the selected
      clips to clipboard and issue an immediate paste at their current position. The
      pasted copies become the new selection; the drag then moves the copies while originals
      remain in place. This matches Ableton alt-drag semantics.
    - Dispatch paste as a single command before starting drag. The new clip IDs become the
      drag targets.

**Exit criteria:**

- Cmd+A selects every clip.
- Escape clears clip selection.
- Alt+drag produces duplicates at the drag destination with a single undo step.

---

## Files Summary

| File                                                           | Change                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `src/state/selectionStore.ts`                                  | Add `type: 'clips'` variant                               |
| `src/state/timelineStore.ts`                                   | Add `_crossTrackDrag`, `moveMidiClipsBetweenTracks`       |
| `src/state/timeline/patches.ts`                                | Add `MOVE_MIDI_CLIPS_BETWEEN_TRACKS` patch                |
| `src/state/timeline/commandTypes.ts`                           | Add `timeline.moveMidiClipsBetweenTracks` id              |
| `src/state/timeline/commands/midiClipCommands.ts`              | Implement new command                                     |
| `src/workspace/panels/timeline/clipboard/midiClipClipboard.ts` | Handle `type: 'clips'` in getMidiClipsInTimelineSelection |
| `src/workspace/panels/timeline/tracks/MidiClipBlock.tsx`       | Cross-track drag, shift+click, hide during cross-drag     |
| `src/workspace/panels/timeline/tracks/TrackRowBlock.tsx`       | Pass `trackIndex`, `rowHeight` to MidiClipBlock           |
| `src/workspace/panels/timeline/tracks/TrackLanes.tsx`          | Ghost overlay, row highlight, pass trackIndex             |
| `src/workspace/panels/timeline/hooks/useTimelineNavigation.ts` | Cmd+A, update delete for clips variant                    |
| `src/state/__tests__/selectionStore.timelineClips.test.ts`     | New tests for clips variant                               |

## Out of Scope

- Audio clip cross-track drag (audio tracks have different semantics).
- Cross-document clipboard (already out of scope per original plan).
- Piano roll clip editing (separate concern).
- Clip colour / labelling beyond existing name field.
