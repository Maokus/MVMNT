## Requirements checklist

-   New core/timing data structures: Timeline and TimelineTrack (with TimelineMidiTrack now; future TimelineAudioTrack later).
-   New MIDI property type: dropdown to select a loaded timeline MIDI track (replacing file upload).
-   Move and expand TimingManager into @core/timing:
    -   Multiple tempo maps (per track + optional master).
    -   Relative timing with track offsets.
    -   Cross-track synchronization.
-   Update scene element build/render logic to use the new timeline/timing system.
-   Update render queries to handle:
    -   Track offsets in note retrieval.
    -   Per-track start/end boundaries.
    -   Multiple concurrent MIDI sources.

Status: all covered below with concrete APIs, file-level edits, and a migration path.

## High-level approach

-   Introduce a central Timeline model and service to own tracks, tempo maps, offsets, and queries.
-   Keep existing MidiManager as a compatibility layer initially; route it to timeline-backed queries when a midiTrackId is present.
-   Add a MidiTrackRef property type + UI dropdown, and deprecate file-based midiFile properties with an auto-import shim.
-   Migrate scene elements incrementally to pull notes from the TimelineService by track id(s).
-   Preserve existing imports with a shim while relocating TimingManager.

## Phase 1 — Core timing model and shims

Files to add

-   index.ts
    -   Barrel exports for new timing module.
-   timing-manager.ts
    -   Move from src/core/timing-manager.ts; unchanged public API, then expand in Phase 2.
-   src/core/timing/timeline.ts
    -   Types and classes:
        -   Timeline: id, name, masterTempoMap?: TempoMapEntry[], tracks: TimelineTrack[], currentTimeSec (for editor sync).
        -   Base TimelineTrack: id, name, offsetSec, enabled, mute, solo, regionStartSec?, regionEndSec?
        -   TimelineMidiTrack extends TimelineTrack:
            -   midiData: MIDIData
            -   notesRaw: parsed notes as-is
            -   ticksPerQuarter
            -   tempoMap?: TempoMapEntry[] (seconds) for this track
-   src/core/timing/timeline-service.ts
    -   Core APIs:
        -   addMidiTrack({file|midiData, name, offsetSec}): trackId
        -   getTracks(): TimelineTrack[]
        -   getTrack(id): TimelineTrack | undefined
        -   setMasterTempoMap(map)
        -   map.timelineToTrackSeconds(trackId, timelineSec): number | null (offset + region clipping)
        -   map.trackBeatsToTimelineSeconds(trackId, beats): number (uses track tempoMap)
        -   getNotesInWindow({trackIds, startSec, endSec}): NoteEvent[] with added trackId, startSec mapped to timeline time
        -   getNotesNearTimeUnit({trackId, centerSec, bars}): convenience for bar-aligned windows
        -   crossSync.align({fromTrackId, toTrackId, timeInFromTrack}): timeInToTrack (via timeline seconds)
-   src/core/timing/tempo-utils.ts
    -   Shared helpers for seconds<->beats given a tempo map.

Shims for compatibility

-   timing-manager.ts (old path) stays as a re-export from @core/timing/timing-manager for now.
-   src/core/index.ts: export new timing/timeline types/services.

Notes

-   Use existing TempoMapEntry and TimingManager beats/seconds methods to implement the track-level conversions.
-   Canonical time domain is timeline seconds. Track time = timelineSec - offsetSec; clamp to [regionStartSec, regionEndSec] when set.

## Phase 2 — TimingManager expansion

Additions to TimingManager (in new location)

-   New methods:
    -   beatsToSecondsWithMap(beats, tempoMap)
    -   secondsToBeatsWithMap(seconds, tempoMap)
    -   getBarAlignedWindow(centerSec, bars): {start, end}
-   Keep existing setTempoMap(map, unit) and internal segment caches.
-   No breaking changes for existing users; these are additive.

Master tempo support

-   Add optional masterTempoMap in Timeline; TimingManager utilities can accept map parameter, preferring track map, else master, else fixed tempo.

## Phase 3 — MIDI ingestion into timeline

Files to add/extend

-   src/core/midi/midi-library.ts (new)
    -   Small helper to parse MIDI with MIDIParser and normalize to TimelineMidiTrack inputs.
-   TimelineService.addMidiTrack uses MIDIParser and stores:
    -   midiData: including midiData.tempoMap (seconds)
    -   notesRaw: keep original fields (startTick/endTick, startBeat/endBeat if already computed)
    -   ticksPerQuarter: from MIDIData
    -   tempoMap: from midiData.tempoMap

Backward-compat shim

-   For elements still setting a File to midiFile:
    -   Auto-create a TimelineMidiTrack via TimelineService and store the new trackId on the element (see Phase 4).
    -   Keep legacy path working if timeline not initialized.

## Phase 4 — Scene elements and property system

New property type

-   Add PropertyType 'MidiTrackRef':
    -   shared/types/components.d.ts: extend property typing to include 'midiTrackRef' with value string | null (trackId).
-   UI control
    -   ui/form/MidiTrackSelect.tsx: dropdown pulling options from TimelineService.getTracks() filtered to MIDI tracks.
    -   Wire into existing form registry so elements can declare type: 'midiTrackRef'.
-   Update config schemas of MIDI-using elements to replace or accompany midiFile:
    -   TimeUnitPianoRollElement: add midiTrackId?: string.
    -   NotesPlayedTrackerElement: add midiTrackId?: string.
    -   MovingNotesPianoRoll, NotesPlayingDisplay, ChordEstimateDisplay likewise.
    -   Mark midiFile as deprecated; on change, auto-add a track and set midiTrackId.

Element build/render changes (incremental)

-   Inject TimelineService (via VisualizerContext or a new TimelineContext):
    -   VisualizerContext.tsx can own a Timeline instance and provide a singleton TimelineService.
-   In \_buildRenderObjects or equivalent:
    -   If midiTrackId is set:
        -   Use TimelineService.getNotesInWindow({trackIds:[id], startSec, endSec}) to fetch mapped NoteEvents.
    -   Else fallback to existing MidiManager logic (ensures non-breaking migration).
-   Remove per-element MidiManager usage in a second pass once most elements are migrated.

## Phase 5 — Render query changes

Centralize note queries

-   Prefer TimelineService for:
    -   Track offsets: handled in map.timelineToTrackSeconds.
    -   Per-track boundaries: enforced in TimelineTrack.regionStartSec/regionEndSec.
    -   Multiple sources: allow trackIds: string[] in getNotesInWindow, merge and sort results, annotating each with trackId.
-   ModularRenderer need not change if elements deliver already-mapped NoteEvents.

Optional type additions

-   Extend NoteEvent to include optional trackId in your local domain (ui/render won’t break if optional).
-   Or define TimelineNoteEvent extends NoteEvent with trackId.

## Phase 6 — Scene builder and contexts

-   SceneContext/VisualizerContext: add timeline: Timeline and timelineService: TimelineService.
-   HybridSceneBuilder:
    -   Accept an optional initial timeline spec (tracks + offsets) to seed the timeline (useful for tests and presets).
-   SceneSelectionContext:
    -   Include midi track pickers if UI needs selection outside elements.

## Phase 7 — Tests and verification

Add tests

-   src/math/midi/**tests**/timeline-mapping.test.ts
    -   beatsToSecondsWithMap with changing tempos.
    -   timelineToTrackSeconds with offsets and region clipping.
    -   crossSync.align across different tempo maps.
-   src/core/timing/**tests**/timeline-service.test.ts
    -   addMidiTrack; getNotesInWindow with per-track boundaries and multiple tracks.
-   Smoke test in a page (AnimationTestPage.tsx):
    -   Create a timeline with two MIDI tracks (different offsets).
    -   Render PianoRoll using midiTrackId for each; verify visually that offsets are applied.

Quality gates

-   Build/typecheck: ensure @core/timing exports are wired in tsconfig paths and vite aliases.
-   Unit tests: new tests green; existing continue to pass.
-   Minimal manual smoke in dev server.

## Data contracts (concise)

-   Timeline
    -   id: string; name: string
    -   masterTempoMap?: TempoMapEntry[]
    -   tracks: TimelineTrack[]
    -   currentTimeSec: number
-   TimelineTrack
    -   id: string; name: string; type: 'midi' | 'audio'
    -   offsetSec: number
    -   enabled: boolean; mute: boolean; solo: boolean
    -   regionStartSec?: number; regionEndSec?: number
-   TimelineMidiTrack extends TimelineTrack
    -   ticksPerQuarter: number
    -   tempoMap?: TempoMapEntry[]
    -   midiData: MIDIData
    -   notesRaw: Array<{ startTick?, endTick?, startBeat?, endBeat?, startTime?, endTime?, note, velocity, channel }>
-   TimelineService
    -   addMidiTrack({file|midiData, name, offsetSec}): string
    -   getTracks(): TimelineTrack[]
    -   getTrack(id): TimelineTrack | undefined
    -   getNotesInWindow({trackIds: string[], startSec: number, endSec: number}): Array<NoteEvent & {trackId: string}>
    -   map.timelineToTrackSeconds(trackId, timelineSec): number | null
    -   map.trackBeatsToTimelineSeconds(trackId, beats): number
    -   crossSync.align({fromTrackId, toTrackId, timeInFromTrack}): number
-   Property: MidiTrackRef
    -   value: string | null (trackId)
    -   UI: dropdown fed by TimelineService.getTracks().filter(t => t.type === 'midi')

## Migration plan

-   Step A: Land new timing/timeline modules and shims; keep old TimingManager exports.
-   Step B: Introduce MidiTrackRef property + UI; add midiTrackId to elements; do not remove midiFile yet.
-   Step C: Update elements to use TimelineService when midiTrackId is set.
-   Step D: Auto-import: on setting midiFile, create TimelineMidiTrack and set midiTrackId.
-   Step E: After adoption, remove midiFile property and per-element MidiManager uses.
-   Step F: Remove old shim file and update imports to @core/timing.

## Edge cases to cover

-   No track selected: elements render nothing; warn in dev.
-   Track muted/disabled: TimelineService should respect enabled=false or mute=true in queries.
-   Overlapping regions and offsets: ensure clipping within per-track boundaries.
-   Mixed tempo sources: prefer track tempoMap; fall back to master; finally fixed tempo.
-   Large files: memoize segment maps; avoid per-frame recompute.

## File-level changes summary

-   New: src/core/timing/{index.ts,timing-manager.ts,timeline.ts,timeline-service.ts,tempo-utils.ts}
-   New: src/core/midi/midi-library.ts
-   Update: timing-manager.ts (re-export shim)
-   Update: index.ts (export timing/timeline)
-   Update: ui/form registry + new MidiTrackSelect
-   Update: shared/types/components.d.ts (add MidiTrackRef)
-   Update: Elements using MIDI: add midiTrackId, use TimelineService
-   Optional: AnimationTestPage.tsx (smoke usage)

## Acceptance criteria

-   Elements can select a MIDI source via dropdown of timeline tracks.
-   Offsets and per-track boundaries affect note queries and rendering.
-   Multiple MIDI tracks can be queried concurrently and render correctly.
-   Cross-track sync helpers map times consistently using timeline seconds as canonical.
-   No regressions when elements still use legacy midiFile property (auto-import path).

## Next steps

-   Create the @core/timing module and re-export shim.
-   Add Timeline, TimelineService, and unit tests for tempo/offset mapping.
-   Wire TimelineService into VisualizerContext and expose to elements.
-   Add MidiTrackRef property + UI and upgrade one element (TimeUnitPianoRollElement) first as a pilot.
