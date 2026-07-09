# MIDI Copy/Paste Feasibility and Performance

Status: exploratory

## Context

A requested workflow is the ability to copy and paste MIDI. The risky part is not the clipboard itself; it is how pasted MIDI should be represented in the timeline.

The current timeline model is effectively one clip per track:

- `TimelineTrack` has one `offsetTicks`, optional `regionStartTick` / `regionEndTick`, and optional `midiSourceId`.
- MIDI note data lives in `midiCache[sourceId].notesRaw`, sorted during ingest with cached bounds.
- UI clip rendering in `TrackRowBlock` computes one visible block per track.
- Note queries iterate selected MIDI tracks and then query each track's associated cache.
- Content bounds, marquee selection, navigation, and timeline preview code all assume one contiguous clip-like region per track.

This means copy/paste can be implemented cheaply at first, but only if the product semantics stay close to the current model. More DAW-like clip editing is possible, but it is a larger architectural change.

## Option 1: Paste MIDI as New Tracks

Each paste creates one or more new MIDI tracks at the target time. The pasted track can either duplicate the MIDI cache or alias the original cache with a new `midiSourceId`.

### Feasibility

High for whole-clip copy/paste. The current model already supports many tracks with different `offsetTicks`. A new command could clone selected MIDI tracks, copy track settings, set a new offset, and point `midiSourceId` at the same cache.

Selected-note copy/paste is harder because the app does not appear to have a note-selection/editing model in the timeline. Implementing note-level paste as new tracks would require creating a new MIDI cache containing only the selected notes.

### Performance Impact

Memory can be low if pasted tracks share `midiSourceId`; each copy stores only track metadata. Memory becomes poor if every paste creates a full new `midiCache` entry with copied `notesRaw`.

CPU/query cost still grows with the number of pasted tracks. `selectNotesInWindow` and `noteQueryApi.getNotesInWindow` iterate per track and then scan/window-search notes in that track's cache. Even with bounds and binary-search shortcuts, 100 pasted repeats can mean 100 cache queries for visually identical material.

UI cost grows linearly with track count. Each paste adds a row in `TrackList` and `TrackLanes`; this is probably the first practical bottleneck because the timeline panel renders per-track React components and does not appear to virtualize rows.

### UX Impact

Poor for repeated phrases. A user who pastes a 4-bar loop 32 times gets 32 tracks, which is visually noisy and makes mute/solo/selection semantics awkward.

Good for quickly duplicating a MIDI file as an independent visual layer, especially if each pasted copy is meant to drive a different element or use separate mute/solo settings.

### Implementation Notes

- Add a timeline command such as `timeline.duplicateMidiTracks` or `timeline.pasteMidiTracks`.
- Ensure duplicated tracks alias `midiSourceId` rather than copying `notesRaw`.
- Clipboard payload should include source id, local region, original offset, and track metadata.
- Persistence already has `midiSourceId` support, but exported/imported scenes should be checked to ensure shared source ids round-trip correctly.

### Verdict

Good short-term implementation for whole-clip duplication if cache aliasing is enforced. Not a good long-term representation for repeated musical structure.

## Option 2: Add a Track Header "Repeat MIDI" Number

Each MIDI track gains a repeat count. The single source clip is treated as repeated end-to-end `N` times during rendering and note queries.

### Feasibility

Medium. This is smaller than multi-clip tracks because it preserves one track row and one MIDI source. It does require updating all places that currently compute a MIDI track's effective start/end and visible notes.

The simplest data model is:

```ts
repeatCount?: number; // default 1
repeatIntervalTicks?: number; // optional; default to source or region duration
```

If `repeatIntervalTicks` is omitted, repeats use the selected region duration or source bounds duration.

### Performance Impact

Memory impact is minimal because notes are not duplicated.

CPU cost depends on implementation. A naive implementation that materializes repeated notes is risky. A better implementation maps the visible timeline window back into the source clip and only expands repeats that intersect the query window.

For example, if a 4-bar clip is repeated 64 times but the viewport covers 8 bars, the query should inspect only the two or three repeat instances that overlap the viewport, not all 64.

UI cost is low because the track count stays fixed. `TrackRowBlock` would need to draw repeat divisions or ghosted repeats inside one block.

### UX Impact

Efficient for simple loops, but inelegant for arranging real MIDI sections. It cannot naturally represent:

- non-contiguous pastes,
- changed phrase order,
- different clip lengths per copy,
- deleting one middle repetition,
- overlapping repeats,
- separate names/colors per pasted region.

It also hides structure behind a number field, which may feel less direct than visible clips.

### Implementation Notes

- Update `TimelineTrack` for repeat metadata.
- Update content bounds in `timelineShared`.
- Update `selectNotesInWindow`, `selectCCInWindow`, and `noteQueryApi.getNotesInWindow` to expand repeats window-locally.
- Update `TrackRowBlock` and `MidiNotePreview` to render repeated previews.
- Decide whether repeat count applies before or after `regionStartTick` / `regionEndTick`.
- Add tests around tempo maps, negative offsets, regions, and content bounds.

### Verdict

Good as a constrained "loop this MIDI clip" feature. It is not a full copy/paste model, and the UI may feel indirect, but it is performance-friendly if implemented as virtual repeats.

## Option 3: Allow Multiple Clips Per Track

Replace the single-clip-per-track assumption with a list of MIDI clip placements on each MIDI track. Each clip references a MIDI source and has its own offset/region metadata.

Possible shape:

```ts
type MidiClip = {
    id: string;
    sourceId: string;
    offsetTicks: number;
    regionStartTick?: number;
    regionEndTick?: number;
    name?: string;
    enabled?: boolean;
};

type TimelineTrack = {
    id: string;
    type: 'midi';
    clips: MidiClip[];
    // existing track-level mute/solo/enabled remain
};
```

### Feasibility

Medium to low as an incremental change because many code paths assume track-level clip placement. It is the most correct timeline model, but it requires a broad migration.

Major areas affected:

- store types and migrations,
- add/import commands,
- offset and resize commands,
- undo/redo patches,
- content bounds,
- note and CC selectors,
- `TrackRowBlock` rendering,
- drag/resize hit testing,
- marquee selection,
- persistence validation,
- plugin/runtime APIs that refer to a timeline track,
- tests and scene templates.

Backward compatibility is manageable: old tracks can migrate to one clip whose `sourceId` is `midiSourceId ?? track.id`.

### Performance Impact

Memory remains good if clips reference shared MIDI cache sources.

CPU query cost scales with visible/intersecting clips rather than track count. If implemented with per-clip bounds and window filtering before note iteration, it can perform better than the "new track per paste" approach because the UI has fewer rows and query code can reject offscreen clips cheaply.

Rendering cost increases inside a row because multiple clip blocks are drawn, but that is usually cheaper than rendering many full rows.

There is a risk of accidental quadratic behavior if selectors flatten every clip into every note on each render. The implementation should avoid materializing all repeated/pasted notes and should query only clips intersecting the current window.

### UX Impact

Best match for user expectations. Copy/paste creates visible clips on the same track. Users can move, trim, delete, and arrange pasted MIDI in a familiar way.

It also preserves track identity: a track can mean "piano MIDI" or "drum MIDI" instead of every repeated phrase becoming a new track.

### Implementation Notes

- Start with MIDI only; do not force audio multi-clip support in the same phase unless required.
- Preserve `trackId` as the target for scene elements and plugin APIs, but update note providers to aggregate that track's clips.
- Add clip selection separately from track selection.
- Keep `midiCache` source ids deduplicated.
- Add a compatibility layer so old single-clip tracks still read as `getClipsForTrack(track)`.

### Verdict

Best long-term architecture and best UX. Highest implementation cost. Worth doing if the product direction includes DAW-like editing beyond simple clip duplication.

## Option 4: Virtual Arrangement Events

Keep `TimelineTrack` mostly as-is, but add a separate arrangement layer:

```ts
midiArrangements: Record<trackId, Array<{
    id: string;
    sourceId: string;
    offsetTicks: number;
    regionStartTick?: number;
    regionEndTick?: number;
}>>;
```

Existing single-clip fields remain as legacy/default fields, while new paste operations write arrangement events.

### Feasibility

Medium. This avoids a direct breaking change to `TimelineTrack`, but it still requires selectors, content bounds, persistence, rendering, and commands to understand arrangement events.

The main drawback is conceptual duplication: the app would have both track-level clip fields and arrangement-level clip fields. That can become confusing unless a clear migration path removes the old fields later.

### Performance Impact

Similar to multiple clips per track if implemented with windowed clip filtering and shared MIDI cache references.

Slightly more overhead and complexity because query paths must merge legacy track clip data with arrangement events.

### UX Impact

Can deliver the same visible multi-clip UX as Option 3 while reducing migration pressure. However, developers will pay for the hybrid model until the old fields are retired.

### Verdict

Good transitional architecture if multiple clips are desired but a full track schema migration is too risky in one pass.

## Option 5: Paste by Flattening Notes Into a New MIDI Source

Copy/paste creates a new MIDI source whose notes are physically shifted or trimmed into the desired arrangement. The result may be placed as one new track or replace the existing track's source.

### Feasibility

Medium for simple whole-clip or selected-note paste. It can reuse the current single-clip model because the pasted result is just a new `midiCache` entry.

### Performance Impact

Memory is poor for repeated material because each paste duplicates note arrays. It may be acceptable for small MIDI clips, but it scales badly for dense piano rolls or drum data.

Query performance can be good if many pasted notes are flattened into one cache and queried as one source, but editing becomes destructive: the app loses knowledge that these were repeated clip instances.

### UX Impact

Acceptable for "bounce/commit" workflows, not good for normal arrangement editing. Users cannot independently move or delete pasted instances unless the app also implements note-level editing.

### Verdict

Useful as an export/internal fallback, not ideal as the main copy/paste model.

## Comparative Summary

| Option | Feasibility | Memory | CPU / Query Cost | UI Cost | UX Fit |
| --- | --- | --- | --- | --- | --- |
| New track per paste | High | Good if source is shared; poor if notes copied | Grows with pasted track count | High | Weak for loops, OK for layers |
| Repeat MIDI number | Medium | Excellent | Good if repeats are virtual/windowed | Low | Good for simple loops only |
| Multiple clips per track | Medium-low | Excellent | Good if clip-windowed | Moderate | Best |
| Virtual arrangement events | Medium | Excellent | Good if clip-windowed | Moderate | Good, but hybrid complexity |
| Flatten notes into source | Medium | Poor for repeated material | Potentially good | Low/moderate | Weak for editable arrangements |

## Recommendation

Use a two-step approach.

First, implement a narrow whole-clip copy/paste using new tracks that alias the original `midiSourceId`. This gives users a working feature quickly and avoids duplicating note memory. Add guardrails such as "Duplicate as new track" wording if paste-to-same-track semantics are not ready.

Second, design a proper clip model before expanding the feature into DAW-like paste behavior. The preferred long-term design is multiple MIDI clips per track, optionally introduced through a transitional arrangement-event layer. This solves the user's actual expectation while keeping performance manageable through shared sources and windowed clip queries.

The "Repeat MIDI" option is viable as a separate loop feature, especially for motion-graphics users who often repeat motifs. It should not be treated as a replacement for copy/paste because it cannot represent general arrangement edits.

## Performance Guardrails for Any Implementation

- Do not duplicate `notesRaw` for ordinary pasted copies.
- Treat `midiCache` as immutable source data and represent paste instances as lightweight placements.
- Query only clips or repeats that intersect the requested time window.
- Never materialize all repeated notes into store state.
- Keep content bounds based on clip/repeat bounds, not full note scans when bounds are available.
- Add tests for large repeat counts, many paste instances, tempo maps, regions, and negative offsets.
- Consider row virtualization if the app keeps supporting workflows that create many tracks.

## Open Questions

- Should copy/paste mean whole timeline clips, selected notes inside a clip, or both?
- Should pasted MIDI stay linked to the original source, or should users be able to make an independent editable copy?
- Should copy/paste preserve track mute/solo/enabled state, name, and region trim?
- Where should paste occur: playhead, mouse position, original offset plus one clip length, or selected range start?
- Should visual elements bound to a MIDI track see all clips on that track or only one selected/default clip?
