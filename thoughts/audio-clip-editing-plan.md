# Audio Clip Editing Implementation Plan

Status: proposal

## Goal

Expand the MIDI clip editing model to audio tracks so audio can be edited as first-class timeline clips instead of track-level placement. Audio tracks should support the same arrangement behaviours that now exist for MIDI clips:

- multiple non-overlapping clips per track;
- point/range/explicit clip selection;
- copy, cut, paste, duplicate, delete, and Cmd+A;
- horizontal drag, multi-clip group drag, and cross-track drag;
- trim handles with undo/redo;
- viewport-culled waveform rendering;
- saved projects that preserve clip-level placement.

The important product invariant is that scene elements, plugins, feature bindings, track mute/solo/enabled, and mixer gain remain track-oriented. Clip editing changes the timeline placement of audio media, not the binding model.

## Current State

MIDI has a clip model:

- `TimelineTrack` for MIDI contains `clips?: MidiClip[]`.
- `src/state/timeline/midiClips.ts` owns bounds and overlap helpers.
- `src/state/timeline/commands/midiClipCommands.ts` owns clip add/update/remove/paste/move commands.
- `useSelectionStore.clipTimelineSelection` supports `point`, `range`, and `clips` selections.
- `TrackRowBlock` delegates MIDI clip rendering and gestures to `MidiClipBlock`.
- `TrackLanes` already renders clip selection overlays and cross-track MIDI drag ghosts.

Audio is still a track-level clip:

- `AudioTrack` in `src/audio/audioTypes.ts` stores `offsetTicks`, `regionStartTick`, `regionEndTick`, and `audioSourceId` directly on the track.
- `TrackRowBlock` renders one audio block per audio track and edits it through `setTrackOffsetTicks` and `setTrackRegionTicks`.
- `audio-engine.ts`, `offline-audio-mixer.ts`, `tempoAlignedViewAdapter.ts`, timeline bounds utilities, and export paths assume one audio placement per audio track.
- `AudioWaveform` looks up the track and source internally, so it cannot yet render an arbitrary audio clip independently of the track's current placement.

## Key Design Decisions

### 1. Use first-class `AudioClip` objects, not duplicated audio tracks

Add audio clips inline on audio tracks, mirroring MIDI:

```ts
export interface AudioClip {
    id: string;
    type: 'audio';
    sourceId: string;
    offsetTicks: number;
    regionStartTick?: number;
    regionEndTick?: number;
    name?: string;
    enabled?: boolean;
    gain?: number;
}
```

Update `AudioTrack`:

```ts
export interface AudioTrack {
    id: string;
    name: string;
    type: 'audio';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    gain: number;
    clips?: AudioClip[];

    // legacy import/migration/runtime compatibility only
    offsetTicks?: number;
    regionStartTick?: number;
    regionEndTick?: number;
    audioSourceId?: string;
}
```

The track keeps mixer state (`enabled`, `mute`, `solo`, `gain`). The clip owns media placement and trim. This matches MIDI and avoids making one track per clip.

### 2. Keep audio source data in `audioCache`

Clips reference `audioCache` entries by `sourceId`. They do not copy decoded buffers, waveform peaks, original bytes, or feature caches.

This preserves the existing memory model and allows multiple clips to reuse one decoded source. It also means remove/undo commands must only remove audio cache entries when no remaining clip references that source.

### 3. Use the existing clip selection union for both MIDI and audio

Rename the selection ref concept from "MIDI clip ref" in implementation-facing helpers to a generic timeline clip ref:

```ts
type TimelineClipKind = 'midi' | 'audio';

interface TimelineClipRef {
    trackId: string;
    clipId: string;
    kind?: TimelineClipKind;
}
```

`kind` is optional during the transition because the track type can be resolved from `trackId`. New clipboard payloads should store it explicitly.

Decision: one `clipTimelineSelection` covers both MIDI and audio. Do not add a parallel `audioClipSelection` store.

### 4. Enforce non-overlap per track and per media type

Audio clips on the same audio track must not overlap. The overlap behaviour should match MIDI: inserting or moving a clip crops neighbours where possible and removes fully covered clips.

MIDI and audio clips never coexist on the same track, so the invariant is per track:

```ts
timelineStart = clip.offsetTicks + effectiveRegionStart
timelineEnd = clip.offsetTicks + effectiveRegionEnd
```

For audio, source duration comes from `audioCache[sourceId].durationTicks`.

### 5. Playback and export iterate clips

The audio engine and offline mixer should collect audible audio clips, not just audible audio tracks. Track mute/solo/enabled/gain still apply, then optional clip `enabled` and clip `gain` apply.

Effective gain:

```ts
effectiveGain = track.gain * (clip.gain ?? 1)
```

If clip-level gain is not implemented in the first UI pass, keep the field optional and always default to `1`.

### 6. Migrate persisted audio placement in a schema bump

Audio clips are a persisted model change and should use a new schema version, likely V9. V8 projects with track-level audio placement migrate each audio track into a single clip:

```ts
{
    id: `${track.id}__legacy_audio_clip`,
    type: 'audio',
    sourceId: track.audioSourceId ?? track.id,
    offsetTicks: track.offsetTicks ?? 0,
    regionStartTick: track.regionStartTick,
    regionEndTick: track.regionEndTick,
    name: track.name,
    enabled: true,
}
```

Export should strip legacy audio placement fields after migration, matching the MIDI V8 approach.

### 7. Prefer shared clip helper patterns, but avoid premature generic commands

Create `audioClips.ts` first and keep command implementations audio-specific. If duplication with `midiClipCommands.ts` becomes large and tests prove both paths are stable, factor shared overlap and selection utilities later.

Reason: audio has playback, waveform, feature cache, decoded-buffer, and source-retention semantics that MIDI does not have.

## Data Model Work

### New helper file

Create `src/state/timeline/audioClips.ts` with:

- `makeAudioClipId(): string`
- `getAudioClipsForTrack(track: AudioTrack): AudioClip[]`
- `getPrimaryAudioClip(track: AudioTrack): AudioClip | undefined`
- `getAudioClipLocalBounds(cache, clip): { startTick: number; endTick: number } | null`
- `getAudioClipTimelineBounds(cache, clip): { startTick: number; endTick: number } | null`
- `findReferencedAudioSourceIds(state): Set<string>`
- `resolveAudioClipOverlapWithCache(track, editedClip, audioCache): AudioClip[]`
- `enforceNonOverlappingAudioClips(track, audioCache): AudioClip[]`

Legacy adapter should return a deterministic synthetic clip if `track.clips` is absent.

### Type updates

Files:

- `src/audio/audioTypes.ts`
- `src/state/timelineStore.ts`
- `src/state/timeline/index.ts`
- any local type exports in timeline command modules

Tasks:

- Add `AudioClip`.
- Make `AudioTrack.clips?: AudioClip[]`.
- Mark track-level `offsetTicks`, `regionStartTick`, `regionEndTick`, and `audioSourceId` as legacy.
- Update `AnyTrack` and timeline command patch types to account for audio clips.

## Command Layer

Add commands equivalent to the MIDI command surface:

- `timeline.addAudioClip`
- `timeline.updateAudioClips`
- `timeline.setMultipleAudioClipOffsets`
- `timeline.removeAudioClips`
- `timeline.pasteAudioClips`
- `timeline.moveAudioClipsBetweenTracks`

Suggested payloads mirror MIDI:

```ts
interface AddAudioClipPayload {
    trackId: string;
    clip: Omit<AudioClip, 'id' | 'type'> & { id?: string; type?: 'audio' };
}

interface UpdateAudioClipsPayload {
    updates: Array<{
        trackId: string;
        clipId: string;
        patch: Partial<Omit<AudioClip, 'id' | 'type'>>;
    }>;
}

interface MoveAudioClipsBetweenTracksPayload {
    moves: Array<{
        sourceTrackId: string;
        clipId: string;
        destinationTrackId: string;
        newOffsetTicks: number;
    }>;
}
```

Command requirements:

- Validate that source and destination tracks are `type: 'audio'`.
- Validate that every `sourceId` exists in `audioCache`.
- Apply overlap resolution in command execution, not only in UI handlers.
- Store complete before/after clip arrays for every affected track in undo patches.
- Keep cache restoration lightweight. Undo for removed audio clips should restore missing cache metadata only when the cache entry was actually removed.
- Do not evict an `audioCache` entry if any remaining audio clip references it.
- Continue auto-adjusting scene range after add, paste, move, trim, and delete.

## Selection, Clipboard, and Navigation

### Selection resolution

Replace or broaden `midiClipClipboard.ts` concepts:

- `getMidiClipsInTimelineSelection` becomes `getTimelineClipsInSelection`.
- It returns concrete refs for both MIDI and audio.
- Range selection resolves against MIDI clip bounds and audio clip bounds.
- Explicit `clips` selection returns stored refs after filtering missing tracks/clips.

Keep MIDI-specific clipboard functions, but add an audio equivalent:

- `copySelectedTimelineClips`
- `pasteTimelineClips`
- `getAudioClipsInTimelineSelection`

### Clipboard format

Extend the current in-app clipboard payload to support mixed clip kinds:

```ts
type TimelineClipClipboard =
    | { kind: 'midi'; clips: MidiClipClipboardEntry[]; ... }
    | { kind: 'audio'; clips: AudioClipClipboardEntry[]; ... }
    | { kind: 'mixed'; clips: TimelineClipClipboardEntry[]; ... };
```

Each entry should include:

- `kind`
- `sourceTrackId`
- `sourceTrackIndex`
- `relativeTrackOffset`
- `relativeStartTick`
- full clip data except generated id
- source cache snapshot reference needed for undo/import safety

Decision: allow mixed copy/paste only when the destination has compatible track rows available. MIDI clips paste onto MIDI tracks, audio clips paste onto audio tracks. If a destination row is incompatible, create new tracks of the required kind or skip with a visible warning. The first implementation should create new tracks because that matches existing multi-track MIDI paste behaviour better than silently dropping audio.

### Keyboard behaviours

Update `useTimelineNavigation`:

- Delete removes selected MIDI and audio clips when `activeTarget === 'clipTimeline'`.
- Cmd+A selects all enabled MIDI and audio clips in visible track order.
- Escape clears point/range/explicit clip selections.
- Duplicate and paste preserve clip kind.
- Fallback paste target remains the clip timeline point/range if present, then selected/focused compatible track at playhead.

## UI Work

### Split audio block into `AudioClipBlock`

Create `src/workspace/panels/timeline/tracks/AudioClipBlock.tsx`.

It should own the same gesture responsibilities as `MidiClipBlock`:

- click selection;
- shift/cmd toggle;
- horizontal drag;
- multi-clip drag;
- cross-track drag to audio tracks only;
- left/right trim;
- double-click name edit;
- selected styling;
- pointer capture and native drag suppression.

`TrackRowBlock` should render:

- MIDI clips via `MidiClipBlock`;
- audio clips via `AudioClipBlock`;
- no track-level clip block for audio once migration helpers are in place.

### Waveform rendering

Update `AudioWaveform` so it can render a clip directly:

```ts
interface AudioWaveformProps {
    trackId: string;
    sourceId?: string;
    clipOffsetTicks?: number;
    regionStartTick?: number;
    regionEndTick?: number;
    ...
}
```

It can keep the legacy `trackId` fallback during migration, but `AudioClipBlock` should pass explicit clip/source data.

Waveform rendering should remain viewport-friendly:

- render only visible audio clips, with the same viewport padding pattern used for MIDI;
- pass visible absolute tick bounds to `AudioWaveform`;
- avoid allocating per-frame waveform arrays.

### Cross-track drag

Generalize `_crossTrackDrag` or add `_timelineClipDrag`:

```ts
interface CrossTrackClipDragState {
    kind: 'midi' | 'audio';
    previews: Array<{
        clipId: string;
        sourceTrackId: string;
        targetTrackId: string;
        previewOffsetTicks: number;
        sourceId: string;
        regionStartTick?: number;
        regionEndTick?: number;
    }>;
    targetTrackId: string;
}
```

Decision: MIDI clips may only move to MIDI tracks and audio clips may only move to audio tracks. Do not auto-convert track types during drag.

Track row targeting should skip incompatible rows or clamp to the nearest compatible row. Prefer nearest compatible row because it gives predictable drag feedback in mixed projects.

## Playback and Mixing

### Real-time audio engine

Files:

- `src/audio/audio-engine.ts`
- tests in `src/audio/__tests__/`

Tasks:

- Replace `getAudibleTracks()` with a collector that returns `{ track, clip }`.
- Apply solo/mute/enabled at track level and `clip.enabled !== false` at clip level.
- Schedule each clip independently.
- Use `clip.offsetTicks`, `clip.regionStartTick`, and `clip.regionEndTick` for timeline-to-buffer mapping.
- Keep active sources keyed by `trackId:clipId` so multiple clips on one track can play or be stopped independently.
- Preserve micro-fade behaviour.
- Preserve future-start behaviour for clips that begin after `playFromTick`.

Tests:

- two clips on one audio track schedule at separate timeline positions;
- playback from before a later clip does not start it early;
- playback from inside a trimmed clip starts at the correct buffer offset;
- muted track suppresses all clips;
- solo logic still applies at track level.

### Offline mixer and export

Files:

- `src/audio/offline-audio-mixer.ts`
- `src/export/*` tests that depend on audio mixing

Tasks:

- Mix all audible audio clips, not one placement per audio track.
- Preserve track gain, mute, solo, and clip enabled.
- Use clip-level trim and offset for intersection math.
- Keep export timing parity tests passing under tempo maps.

## Audio Features and Plugin Reads

Feature caches remain source-level (`audioFeatureCaches[sourceId]`). Track-bound audio feature reads must sample from the active clip placements for that track.

Files:

- `src/audio/features/tempoAlignedViewAdapter.ts`
- `src/audio/audioFeatureUtils.ts`
- `src/state/selectors/audioFeatureSelectors.ts`
- scene/plugin host APIs that expose audio sampling

Tasks:

- Resolve an audio track to all enabled clips.
- For timeline sampling, find clips intersecting the requested window.
- Convert timeline tick/second windows into source-local windows using clip offset and region.
- For overlapping clips on different audio tracks using the same source, sample independently.
- For no clip at a requested time, return silence/null using the existing conventions.

Decision: a track-bound feature value at time `t` should represent the sum or max of all enabled clips on that track only if overlapping clips are ever allowed. Because same-track overlap is disallowed, the implementation can select the single clip intersecting `t`.

## Persistence and Migration

Schema work:

- bump `CURRENT_SCHEMA_VERSION` to `9`;
- add `SCHEMA_TO_MIN_APP_VERSION[9]`;
- create `src/persistence/migrations/audioClipsV9.ts`;
- run V9 migration after V8 MIDI migration during import;
- update `serializeTimelineTracksV8` to `serializeTimelineTracksV9` or add an audio stripping pass.

Validation:

- audio tracks in schema V9 must have `clips: AudioClip[]`;
- clip ids must be unique per track;
- `sourceId` must exist in `timeline.audioCache` or embedded audio asset metadata;
- `offsetTicks`, `regionStartTick`, and `regionEndTick` must be finite when present;
- `regionEndTick > regionStartTick`;
- clips on the same audio track must not overlap.

Persistence tests:

- V8 audio track migrates into one V9 clip;
- V9 multi-audio-clip track round-trips;
- export strips legacy audio placement fields;
- validation catches malformed clips, missing source, duplicate id, invalid trim, and overlap.

## Import and Asset Retention

Audio file import should still create an audio track by default, but now with one initial clip:

- source id: keep the current track id as the initial source id unless a separate asset id already exists;
- track id: still represents the lane/mixer/channel;
- clip id: generated via `makeAudioClipId()`.

Drag-and-drop to the clip timeline should create an audio track plus one audio clip at the drop tick. Later, dropping onto an existing audio track can add a clip to that track instead of always creating a new track.

Cache retention:

- `removeTracksCommand` must remove audio cache entries only when no remaining audio clips reference them.
- `removeAudioClipsCommand` follows the same rule.
- audio memory diagnostics should count source references from clips, not from `track.audioSourceId`.
- crash recovery should persist source metadata exactly once per `audioCache` entry.

## Phased Implementation

### Phase 1: Audio clip model and helpers

Files:

- `src/audio/audioTypes.ts`
- `src/state/timeline/audioClips.ts`
- `src/state/timelineStore.ts`
- `src/state/timeline/__tests__/audioClips.test.ts`

Tasks:

1. Add `AudioClip` and `AudioTrack.clips`.
2. Implement legacy adapter and bounds helpers.
3. Implement audio source reference scanning.
4. Implement overlap resolution.
5. Add focused unit tests for bounds, legacy conversion, source references, and overlap cropping/removal.

Exit criteria:

- No UI behaviour changes required.
- Existing audio tracks can be represented as synthetic clips.

### Phase 2: Commands and undo

Files:

- `src/state/timeline/commandTypes.ts`
- `src/state/timeline/commandRegistry.ts`
- `src/state/timeline/patches.ts`
- `src/state/timeline/commands/audioClipCommands.ts`
- `src/state/timelineStore.ts`
- command tests

Tasks:

1. Add audio clip command payloads and registrations.
2. Add patch actions for replacing audio clip arrays per affected track.
3. Implement add/update/remove/paste/move commands.
4. Update cache reference cleanup to use audio clip refs.
5. Add undo/redo tests for each command.

Exit criteria:

- Programmatic audio clip edits work without UI changes.
- Undo/redo restores clips and cache references correctly.

### Phase 3: Read paths, playback, export, and features

Files:

- `src/audio/audio-engine.ts`
- `src/audio/offline-audio-mixer.ts`
- `src/audio/features/tempoAlignedViewAdapter.ts`
- `src/audio/audioFeatureUtils.ts`
- `src/state/timeline/timelineShared.ts`
- `src/workspace/panels/timeline/utils/timelineNavUtils.ts`
- relevant selector and export tests

Tasks:

1. Iterate audio clips in real-time playback.
2. Iterate audio clips in offline mixing/export.
3. Update feature sampling to resolve clip-local source windows.
4. Update timeline content bounds and frame/fit utilities.
5. Add tests for multi-clip scheduling, export mixing, tempo-map trim mapping, and feature sampling through clips.

Exit criteria:

- Multi-clip audio state plays, exports, and samples features correctly.
- Single legacy audio tracks still behave the same through adapters.

### Phase 4: Selection, clipboard, and keyboard workflows

Files:

- `src/state/selectionStore.ts`
- `src/workspace/panels/timeline/clipboard/*`
- `src/workspace/panels/timeline/hooks/useTimelineNavigation.ts`
- selection and clipboard tests

Tasks:

1. Generalize clip refs and selection resolution to include audio.
2. Add audio and mixed clipboard payloads.
3. Update delete/copy/cut/paste/duplicate/Cmd+A logic.
4. Ensure paste targets compatible track types or creates tracks.

Exit criteria:

- Clip timeline commands work for audio and MIDI.
- Mixed selections do not corrupt incompatible tracks.

### Phase 5: Audio clip UI

Files:

- `src/workspace/panels/timeline/tracks/AudioClipBlock.tsx`
- `src/workspace/panels/timeline/tracks/TrackRowBlock.tsx`
- `src/workspace/panels/timeline/tracks/TrackLanes.tsx`
- `src/workspace/components/AudioWaveform.tsx`
- timeline UI tests

Tasks:

1. Extract audio clip block rendering from `TrackRowBlock`.
2. Render every enabled audio clip with viewport culling.
3. Wire click, trim, drag, group drag, and cross-track drag to audio clip commands.
4. Render waveform from explicit clip/source props.
5. Preserve feature status chips at track or clip level. First implementation can keep them track-level because analysis status is source-level.

Exit criteria:

- Audio clips are edited through the same visible behaviours as MIDI clips.
- Existing single-audio-track workflows still feel unchanged except that the block is now a clip.

### Phase 6: Persistence V9

Files:

- `src/persistence/validate.ts`
- `src/persistence/import.ts`
- `src/persistence/export.ts`
- `src/persistence/document-gateway.ts`
- `src/persistence/migrations/audioClipsV9.ts`
- persistence tests and fixtures

Tasks:

1. Add schema V9.
2. Migrate V8 track-level audio placement into clips.
3. Export V9 audio clips and strip legacy placement fields.
4. Hydrate any runtime compatibility fields only where still required.
5. Add validation and round-trip tests.

Exit criteria:

- Old projects load with one audio clip per audio track.
- New projects persist multiple audio clips per audio track.

### Phase 7: Cleanup and compatibility removal

Only after V9 migration and UI are stable:

- remove direct UI dependence on `AudioTrack.offsetTicks`;
- remove direct playback/export dependence on `AudioTrack.regionStartTick` and `audioSourceId`;
- keep legacy fields optional for import compatibility only;
- consolidate shared clip helper names where doing so reduces duplication.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Tempo-map conversion bugs for audio trims | Keep tests around `secondsToTicksAt`/`ticksToSecondsAt` for clips at different offsets. |
| Source cache eviction while clips still reference a source | Centralize `findReferencedAudioSourceIds` and use it in every remove/evict path. |
| Mixed MIDI/audio selections causing invalid paste targets | Store clip kind in clipboard entries and validate destination track type before applying commands. |
| Waveform rendering becomes expensive with many audio clips | Use viewport culling and source-level peak reuse; do not slice peak arrays per render. |
| Feature sampling semantics become ambiguous | Disallow same-track overlap and resolve exactly one clip per track/time. |
| Undo snapshots retain decoded audio buffers | Reuse existing lightweight audio cache undo snapshots; do not store `AudioBuffer` in clip command history. |

## Out of Scope

- Cross-document audio clipboard with embedded audio bytes.
- Per-clip fades, crossfades, warping, stretching, or reverse playback.
- Overlapping audio clips on the same track.
- Editing audio sample data destructively.
- Clip colour/labelling beyond the optional `name` field.

## Verification

When implemented, run:

```bash
npm run test
npm run build
npm run compile
```

If tests fail due to a missing optional Rollup native dependency, run `npm install` and rerun `npm run test` before continuing.
