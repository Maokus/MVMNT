# MIDI Multi-Clip Tracks Implementation Plan

Status: final implementation guide

## Goal

Implement MIDI copy/paste by replacing the single-MIDI-clip-per-track model with MIDI tracks that contain multiple non-overlapping clips. Scene elements and plugins remain bound to MIDI tracks, not clips; track reads aggregate all enabled clips and returned note/CC events include optional clip metadata.

This is a phased implementation plan for the current React/TypeScript/Vite codebase.

## Current Code Constraints

- `src/state/timelineStore.ts` defines MIDI `TimelineTrack` with track-level `offsetTicks`, `regionStartTick`, `regionEndTick`, and `midiSourceId`.
- `src/state/selectors/timelineSelectors.ts` and `src/core/timing/note-query.ts` query one MIDI source placement per track.
- `src/workspace/panels/timeline/tracks/TrackRowBlock.tsx` renders one clip block per row and owns MIDI drag/trim behavior.
- `src/workspace/panels/timeline/hooks/useMarqueeSelect.ts` selects tracks by intersecting one clip rectangle per row.
- `src/workspace/panels/timeline/hooks/useTimelineNavigation.ts` deletes/framing based on `SelectionTarget` from `src/state/selectionStore.ts`.
- `src/state/timeline/commandTypes.ts`, `commandRegistry.ts`, command files, and `patches.ts` form a closed command/undo system.
- `src/persistence/document-gateway.ts`, `export.ts`, and `import.ts` persist `timeline.tracks`; `src/persistence/validate.ts` currently validates only shallow track shape.
- `src/core/scene/plugins/host-api/plugin-api.ts` exposes track-oriented timeline reads used by first-party MIDI display elements.

## Required Product Semantics

- MIDI tracks do not have a new track-level offset. Old `offsetTicks` is legacy-only and migrates into the first clip.
- Empty MIDI tracks are valid and are not deleted when their last clip is deleted.
- Elements/plugins stay bound to track ids. Track reads return notes/CCs from all enabled clips on that track.
- Returned note and CC events include optional `clipId` and `sourceId` metadata.
- Clips on the same track must never overlap.
- Editing follows Ableton Arrangement View style selection behavior:
  - the clip timeline has its own time/track selection, separate from the playhead;
  - selection may be a rectangular range across one or more tracks, or a zero-width insertion point on a specific track;
  - the selected range/insertion point is highlighted in the clip lane area;
  - paste occurs at the top-left of the clip timeline selection, not at the playhead;
  - if there is no clip timeline selection, create a sensible insertion point from the current focused/selected MIDI track and current playhead only as a fallback.
- Cross-document clipboard is out of scope. Initial copy/paste references existing `midiCache` source ids within the current document.
- Use schema V8 for persisted multi-clip tracks before exposing UI editing.

## Data Model

Add a MIDI clip type. Suggested location: `src/state/timeline/midiClips.ts` or `src/state/timelineTypes.ts`.

```ts
export interface MidiClip {
    id: string;
    type: 'midi';
    sourceId: string;
    offsetTicks: number;
    regionStartTick?: number;
    regionEndTick?: number;
    name?: string;
    enabled?: boolean;
}
```

Update MIDI tracks to own inline clips:

```ts
export type TimelineTrack = {
    id: string;
    name: string;
    type: 'midi';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    clips: MidiClip[];

    // legacy import/migration only; do not use for new MIDI placement
    offsetTicks?: number;
    regionStartTick?: number;
    regionEndTick?: number;
    midiSourceId?: string;
};
```

Use inline clips for the first implementation. Do not add top-level `midiClips` maps unless profiling later proves inline clip updates are a bottleneck.

## Clip Helper Layer

Create `src/state/timeline/midiClips.ts`.

Required helpers:

- `makeMidiClipId(): string`
- `getMidiClipsForTrack(track: TimelineTrack): MidiClip[]`
- `getPrimaryMidiClip(track: TimelineTrack): MidiClip | undefined`
- `getMidiClipLocalBounds(cache, clip): { startTick: number; endTick: number } | null`
- `getMidiClipTimelineBounds(cache, clip): { startTick: number; endTick: number } | null`
- `findReferencedMidiSourceIds(state): Set<string>`
- `resolveMidiClipOverlap(track, editedClip): MidiClip[]`
- `enforceNonOverlappingMidiClips(track): MidiClip[]`

Legacy adapter:

```ts
if (!Array.isArray(track.clips)) {
    return [{
        id: `${track.id}__legacy_clip`,
        type: 'midi',
        sourceId: track.midiSourceId ?? track.id,
        offsetTicks: track.offsetTicks ?? 0,
        regionStartTick: track.regionStartTick,
        regionEndTick: track.regionEndTick,
        name: track.name,
        enabled: true,
    }];
}
```

The synthetic legacy id must be stable and deterministic.

## Non-Overlap Rules

The invariant is: within a single MIDI track, clip timeline ranges must not overlap.

Represent clip range as:

```ts
clipStart = clip.offsetTicks + effectiveRegionStart
clipEnd = clip.offsetTicks + effectiveRegionEnd
```

Where effective region bounds use explicit clip region ticks when present, otherwise source cache bounds.

Apply overlap resolution in every command that adds, pastes, moves, or resizes clips:

- If an edited clip expands/moves forward into the next clip, crop the start of the next clip to the edited clip end.
- If an edited clip expands/moves backward into the previous clip, crop the end of the previous clip to the edited clip start.
- If an edited clip fully covers another clip, remove the fully covered clip.
- If a pasted/moved block affects multiple existing clips, process tracks independently and resolve from earliest to latest timeline position.
- If cropping would make a clip zero-length or invalid, remove that clip.
- Never allow the final stored state to contain overlap.

This behavior should be implemented in the command/helper layer, not only in UI drag handlers.

## Arrangement Selection Model

Extend `src/state/selectionStore.ts` or create a timeline-specific selection store if cleaner.

Suggested types:

```ts
export interface SelectedTimelineClip {
    trackId: string;
    clipId: string;
}

export interface TimelineRangeSelection {
    startTick: number;
    endTick: number;
    trackIds: string[];
}

export interface TimelineInsertionSelection {
    tick: number;
    trackId: string;
}

export type ClipTimelineSelection =
    | { type: 'range'; range: TimelineRangeSelection }
    | { type: 'point'; point: TimelineInsertionSelection };
```

Update selection target:

```ts
export type SelectionTarget =
    | 'none'
    | 'elements'
    | 'tracks'
    | 'keyframes'
    | 'timelineClips'
    | 'clipTimeline';
```

Required behavior:

- Clicking a clip selects the clip.
- Dragging empty clip-lane space creates a range selection rectangle.
- Clicking empty clip-lane space creates a point insertion selection on that track at that tick.
- Shift/modified selection should follow familiar arrangement behavior: extend/toggle where reasonable.
- Track header selection remains track selection, separate from clip timeline selection.
- Delete removes selected clips when `activeTarget === 'timelineClips'`; it clears range/point selection when `activeTarget === 'clipTimeline'`.
- Paste uses clip timeline selection first:
  - range selection: paste at `range.startTick` on the first selected track row;
  - point selection: paste at `point.tick` on `point.trackId`;
  - no clip timeline selection: fallback to current focused/selected MIDI track and playhead.

Visual requirements:

- Range selection renders as a highlighted rectangle spanning selected tracks and ticks.
- Point selection renders as a highlighted vertical insertion line on one track.
- This selection must be visually distinct from the red playhead.

## Phased Implementation

### Phase 1: Clip Types and Helpers

Files:

- `src/state/timelineStore.ts`
- `src/state/timeline/midiClips.ts`
- `src/state/timeline/index.ts`
- tests in `src/state/timeline/__tests__/`

Tasks:

- Add `MidiClip`.
- Update `TimelineTrack` to include `clips`.
- Mark old MIDI placement fields as legacy.
- Implement clip helpers, source reference scanning, bounds helpers, and non-overlap helpers.
- Add tests for legacy conversion, real clip passthrough, bounds, source references, and overlap resolution.

Exit criteria:

- No UI changes.
- Existing single-clip tests pass.

### Phase 2: Convert Read Paths

Files:

- `src/state/selectors/timelineSelectors.ts`
- `src/core/timing/note-query.ts`
- `src/state/timeline/timelineShared.ts`
- `src/workspace/panels/timeline/utils/timelineNavUtils.ts`
- `src/workspace/panels/timeline/hooks/useTimelineNavigation.ts`
- `src/core/timing/types.ts`

Tasks:

- Query notes and CC events by iterating clips per MIDI track.
- Preserve track-level mute/solo/enabled behavior.
- Add optional `clipId` and `sourceId` to returned note/CC event types.
- Update content bounds, fit-all, and frame selection to use clip bounds.
- Reject clips outside the query window before scanning notes.
- Preserve binary-search behavior over sorted `notesRaw`.

Tests:

- Multiple clips on one track return notes at multiple placements.
- Shared source clips do not duplicate cache data.
- Region-trimmed clips query correctly.
- CC and sustain queries work across clips.
- Content bounds include all clips.

Exit criteria:

- Manually constructed multi-clip state reads correctly.
- Legacy projects still read correctly.

### Phase 3: Clip Commands, Undo, and Cache Safety

Files:

- `src/state/timeline/commandTypes.ts`
- `src/state/timeline/commandRegistry.ts`
- `src/state/timeline/patches.ts`
- new command files in `src/state/timeline/commands/`
- `src/state/timelineStore.ts`

New command ids:

- `timeline.addMidiClip`
- `timeline.removeMidiClips`
- `timeline.updateMidiClips`
- `timeline.setMultipleMidiClipOffsets`

New patch actions:

- `timeline/ADD_MIDI_CLIP`
- `timeline/REMOVE_MIDI_CLIPS`
- `timeline/RESTORE_MIDI_CLIPS`
- `timeline/UPDATE_MIDI_CLIPS`

Store actions:

```ts
addMidiClip(input): Promise<string>
removeMidiClips(input): Promise<void>
updateMidiClip(input): Promise<void>
setMultipleMidiClipOffsets(input): Promise<void>
```

Tasks:

- Apply non-overlap resolution inside commands before writing state.
- Keep empty tracks after clip deletion.
- Replace direct MIDI cache deletion with `findReferencedMidiSourceIds(state)`.
- `setTrackOffsetTicks` must not be used for new MIDI placement. Keep it for audio and legacy compatibility only.
- If legacy code moves a one-clip MIDI track, update that clip. If it targets a multi-clip MIDI track, move all clips by delta and enforce non-overlap.

Tests:

- Add/update/remove clip commands.
- Undo/redo for every clip command.
- Shared `sourceId` survives removing one of two clips.
- Final source reference removal can clean cache only when no track/clip references it.
- Commands cannot produce overlapping stored clips.

Exit criteria:

- Clip state is fully editable through commands without UI.

### Phase 4: Import/Add Track and Persistence V8

Files:

- `src/state/timeline/commands/addTrackCommand.ts`
- `src/workspace/panels/timeline/hooks/useMidiImport.ts`
- `src/workspace/panels/timeline/tracks/TrackLanes.tsx`
- `src/persistence/validate.ts`
- `src/persistence/import.ts`
- `src/persistence/export.ts`
- `src/persistence/document-gateway.ts`
- new V8 migration in `src/persistence/migrations/`
- `docs/document-state/validation-errors.md`

Tasks:

- New MIDI imports create a track with one clip.
- First clip uses `sourceId = trackId` unless a separate source id is explicitly introduced.
- Migrate legacy MIDI tracks to V8 clips:
  - `track.offsetTicks` -> first clip `offsetTicks`;
  - `track.regionStartTick` / `track.regionEndTick` -> first clip region;
  - `track.midiSourceId ?? track.id` -> first clip `sourceId`.
- Export V8 tracks with `clips`.
- Do not export legacy MIDI placement fields once all read paths are clip-based.
- Validate V8 clips:
  - clip array exists on MIDI tracks,
  - string `id`,
  - string `sourceId`,
  - finite `offsetTicks`,
  - valid optional region ticks,
  - no duplicate clip ids in a track,
  - no overlapping clips in a track,
  - `sourceId` exists in `midiCache`.

Tests:

- Import/drop creates one clip at the requested offset.
- V7 single-clip track migrates to V8.
- V8 multi-clip track round-trips.
- Validation rejects malformed, missing-source, duplicate-id, and overlapping clips.
- Shared source id exports one MIDI asset.

Exit criteria:

- Multi-clip scenes save/load through schema V8.

### Phase 5: Clip Timeline Selection

Files:

- `src/state/selectionStore.ts` or new timeline selection store
- `src/workspace/panels/timeline/hooks/useMarqueeSelect.ts`
- `src/workspace/panels/timeline/hooks/useTimelineNavigation.ts`
- `src/workspace/panels/timeline/tracks/TrackLanes.tsx`
- `src/workspace/panels/timeline/tracks/TrackRowBlock.tsx`

Tasks:

- Add selected clips and clip timeline range/point selection.
- Render range selection rectangle and point insertion line.
- Make empty lane click/drag create clip timeline selection instead of selecting tracks.
- Make clip click select clips.
- Keep track header selection unchanged.
- Update delete and frame-selection behavior for selected clips and clip timeline selection.

Tests:

- Empty lane click creates point selection on the correct track/tick.
- Empty lane drag creates range selection over correct tracks/ticks.
- Clip click selects clip.
- Delete removes selected clips but not empty tracks.
- Frame selection handles selected clips and range selection.

Exit criteria:

- The clip view has an arrangement-style selection model independent of the playhead.

### Phase 6: Clip Row Rendering and Editing

Files:

- `src/workspace/panels/timeline/tracks/TrackRowBlock.tsx`
- new `src/workspace/panels/timeline/tracks/MidiClipBlock.tsx`
- optionally new `AudioClipBlock.tsx`
- `src/workspace/components/MidiNotePreview.tsx`

Tasks:

- Make `TrackRowBlock` a row container.
- Render one `MidiClipBlock` per visible MIDI clip.
- Keep audio behavior as a single audio block.
- Move MIDI drag/trim behavior into `MidiClipBlock`.
- Use clip commands for MIDI drag/trim.
- Render only visible clips plus a small viewport padding when a track has many clips.
- Ensure resize/drag previews respect non-overlap resolution.

Tests:

- Multiple MIDI clips render on one row.
- Dragging one clip edits only that clip unless multiple clips are selected.
- Trimming into a neighbor crops the neighbor according to non-overlap rules.
- Fully covered neighboring clips are removed.

Exit criteria:

- Users can visually edit multi-clip MIDI rows.

### Phase 7: MIDI Clip Copy/Paste

Files:

- new `src/workspace/panels/timeline/clipboard/midiClipClipboard.ts`
- `src/workspace/panels/timeline/hooks/useTimelineNavigation.ts` or a dedicated keyboard hook
- clip command files

Clipboard payload:

```ts
type MidiClipClipboard = {
    kind: 'mvmnt.midi-clips';
    version: 1;
    clips: Array<{
        sourceTrackId: string;
        sourceClipId: string;
        sourceId: string;
        offsetTicks: number;
        regionStartTick?: number;
        regionEndTick?: number;
        name?: string;
    }>;
    anchorTick: number;
    sourceTrackOrder: string[];
};
```

Tasks:

- Copy selected clips on `Cmd/Ctrl+C`.
- Paste on `Cmd/Ctrl+V` at the clip timeline selection top-left.
- Preserve relative clip offsets from `anchorTick`.
- Map copied clips to destination tracks starting at the selected top track.
- If more destination tracks are needed than currently exist, create MIDI tracks or paste remaining clips into the last available selected MIDI track only if that behavior is explicit in UI. Prefer creating tracks for multi-track paste.
- Use existing source ids; do not duplicate `midiCache`.
- Apply non-overlap resolution during paste.
- Make paste one undo step.

Tests:

- Copy/paste one clip at point selection.
- Copy/paste multiple clips into a range selection.
- Paste uses selection top-left, not playhead.
- Paste across tracks preserves relative track order.
- Paste crops/removes overlapped destination clips according to non-overlap rules.
- Undo removes all pasted clips in one step.

Exit criteria:

- User-visible MIDI copy/paste is complete.

### Phase 8: Plugin API and Documentation

Files:

- `src/core/timing/types.ts`
- `src/core/scene/plugins/host-api/plugin-api.ts`
- `docs/plugin-api-v1.md`
- `docs/creating-custom-elements.md`

Tasks:

- Keep `midiTrackId` / track id API stable.
- Document that track reads aggregate all enabled clips.
- Document optional `clipId` and `sourceId` event metadata.
- Do not add clip selector properties in the first implementation.

Exit criteria:

- Existing first-party and external timeline-read elements continue working.
- Docs match the final API.

## Acceptance Criteria

- Old scenes load and migrate to V8.
- New MIDI imports create an empty-offset track with one MIDI clip at the requested clip offset.
- MIDI tracks can be empty.
- MIDI tracks can contain multiple non-overlapping clips.
- Scene elements bound to a MIDI track read all enabled clips on that track.
- Note/CC events include optional `clipId` and `sourceId`.
- Clip timeline selection supports point and range selection independent of the playhead.
- Paste occurs at the top-left of clip timeline selection.
- Commands, UI edits, and paste cannot leave overlapping clips in state.
- Extending a clip into another crops/removes the affected neighbor clips.
- Deleting the last clip does not delete the track.
- Shared MIDI sources are not deleted while referenced.
- `npm run test`, `npm run build`, and `npm run compile` pass.

