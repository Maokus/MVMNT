# Audio clips and tempo automation: time-domain correction plan

## Objective

Make an audio file play for its intrinsic media duration regardless of the
tempo at its placement or of tempo changes it crosses.  Tempo automation must
only determine the musical-tick interval occupied by that fixed-duration audio,
not change the source duration, trim point, or playback speed.

## Investigation summary

### The domains in use today

The project correctly treats timeline positions as musical ticks:

- `AudioClip.offsetTicks` is the clip's musical placement.
- The tempo map maps absolute timeline ticks to wall-clock seconds.
- An `AudioBuffer` has an intrinsic `duration`/`length` in seconds/samples.

However, audio source-local data is also represented as ticks:

- `AudioCacheEntry.durationTicks` is derived from `AudioBuffer.duration` with
  `secondsToTicksAt`.
- `AudioClip.regionStartTick` and `regionEndTick` are source-local trim
  positions expressed against that cached duration.
- Timeline bounds are currently calculated by addition:
  `offsetTicks + regionStartTick/endTick`.

This creates a source-local tick coordinate system. Such a coordinate system
has no stable meaning: the number of ticks in one real second depends on the
tempo segment and, when an interval crosses an automation boundary, on the
whole interval.

### Concrete failure path

`ingestAudioToCache` and decoded-buffer rehydration calculate
`durationTicks = secondsToTicksAt(timing, buffer.duration, offsetTicks)`.
`setMasterTempoMap`, `setGlobalBpm`, and track-offset patches mutate the same
cached `durationTicks` again.  The cache is keyed by `sourceId`, but the
calculation requires a clip placement; it uses a legacy track-level offset
(`tracks[id].offsetTicks`), which is not necessarily the placement of any
modern clip that references that source.

Playback (`AudioEngine`) and export (`offlineMix`) then use source-local ticks
as if they were linearly addable to the timeline.  The engine converts them
back with `ticksToSecondsAt`; the offline mixer subtracts absolute
`ticksToSeconds` calls.  Those compensations only work for the one anchor used
to calculate the cache value.  They cannot be correct for duplicate clips,
clips moved independently, or a source trim spanning multiple tempo segments.

The UI, overlap resolution, scene auto-range, validation, and waveform layout
all consume the same tick-local bounds, so this is a model issue rather than a
single rendering bug.

### Desired invariant

For every audio clip, preserve these identities (within tick rounding):

```
sourceDurationSeconds = audioBuffer.duration
clipStartSeconds     = ticksToSeconds(clip.offsetTicks)
clipEndSeconds       = clipStartSeconds + sourceEndSeconds
clipEndTick          = secondsToTicks(clipEndSeconds)
```

`sourceStartSeconds` and `sourceEndSeconds` are offsets into the audio file;
they are never recalculated when BPM, tempo automation, or clip placement
changes.  The visual timeline width is allowed to change in *ticks* as tempo
changes, because a fixed number of seconds genuinely occupies fewer beats at
60 BPM than at 120 BPM.  Its wall-clock/audio duration must not change.

## Proposed representation

1. Keep `AudioClip.offsetTicks` as the canonical musical placement.
2. Replace audio-only `regionStartTick`/`regionEndTick` with
   `sourceStartSeconds`/`sourceEndSeconds` (or, preferably for exact edit
   persistence, integer `sourceStartSample`/`sourceEndSample` plus the source
   sample rate).  Use seconds in the first implementation unless the editing
   API already works naturally in frames; the decoded buffer and persisted
   metadata already provide duration in seconds.
3. Retain `AudioCacheEntry.durationSeconds`, `durationSamples`, and
   `sampleRate` as the source authority. Remove `durationTicks` from the audio
   model once all consumers have moved.  Do not cache a tempo-dependent source
   length.
4. Provide one pure audio-clip timing helper module. Given a clip, cache entry,
   and `TimelineTimingContext`, it returns:

   - source bounds in seconds;
   - timeline start/end ticks computed with the tempo map;
   - timeline start/end seconds;
   - conversion of a timeline tick at this clip into a source offset in
     seconds.

   All UI, scheduling, export, overlap, and range calculations must call this
   module instead of doing `offsetTicks + localTick` arithmetic.

## Implementation plan

### Phase 1 — Establish the new, explicit time contract

1. Update `src/audio/audioTypes.ts` and audio-clip command payload types with
   the source-time trim fields. Keep temporary read compatibility for the old
   region-tick fields only during migration.
2. Implement pure helpers near `src/state/timeline/audioClips.ts` (or a small
   `audioClipTiming.ts`) using `createTimelineTimingContext` /
   `ticksToSeconds` / `secondsToTicks`:

   ```ts
   startTimelineSeconds = ticksToSeconds(ctx, clip.offsetTicks)
   endTimelineTick = secondsToTicks(ctx, startTimelineSeconds + sourceEndSeconds)
   ```

   Clamp source bounds to `[0, cache.durationSeconds]`, reject empty ranges,
   and round only at the public tick boundary.
3. Make source duration independent of the tempo map: delete all
   `durationTicks` recomputation from ingestion, buffer rehydration,
   `setMasterTempoMap`, `setGlobalBpm`, and offset-change patches. Tempo edits
   should invalidate only genuinely tempo-projected caches (for example audio
   feature projections), never mutate media metadata.

### Phase 2 — Migrate persisted scenes safely

1. Add schema version 9 and an import migration, following the existing V8
   migration pattern. Apply it before validation/runtime hydration.
2. For every legacy audio clip, derive source seconds using the scene's tempo
   context and that clip's own `offsetTicks`:

   ```ts
   sourceStartSeconds = ticksToSeconds(ctx, offset + legacyRegionStartTick)
                      - ticksToSeconds(ctx, offset)
   sourceEndSeconds   = ticksToSeconds(ctx, offset + legacyRegionEndTick)
                      - ticksToSeconds(ctx, offset)
   ```

   If the legacy end is omitted, use `audioCache.durationSeconds` (or the
   packaged asset metadata) as the end. This preserves the audible portion of
   the existing scene under its saved tempo map.
3. Handle legacy track-level audio placement by first normalizing it to the
   synthetic/clip representation, then applying the same conversion.
4. If duration metadata is unavailable during import, preserve the legacy
   record as a clearly marked deferred compatibility case; convert it after the
   asset is decoded, using the *saved* migration tempo context. Emit an import
   warning rather than silently guessing a flat BPM.
5. Export only V9 source-time fields. Validate finite source bounds and source
   references; remove validation based on audio-local ticks.

### Phase 3 — Use the helper at every runtime boundary

1. Playback (`src/audio/audio-engine.ts`): schedule the source at
   `ticksToSeconds(clip.offsetTicks + rendered start relationship)` but pass
   Web Audio `source.start()` an offset/duration directly in source seconds.
   Determine whether the playhead is inside the clip by comparing absolute
   timeline seconds to the clip's computed start/end seconds, not by comparing
   against an added tick duration.
2. Offline export (`src/audio/offline-audio-mixer.ts`): compute the clip/export
   intersection in absolute seconds; map the intersecting start to source
   seconds; write exactly that real-time interval. Keep tick conversions only
   to obtain the export range's absolute start/end seconds and the clip's
   placement.
3. Timeline UI (`AudioClipBlock`, `AudioWaveform`, track row/navigation): get
   visual start/end ticks from the helper. A clip crossing a tempo boundary can
   have a non-uniform seconds-per-pixel relationship, but its endpoints and
   waveform crop remain correct.
4. Editing: when a resize handle is dropped at timeline tick `T`, set the
   corresponding source trim to
   `ticksToSeconds(ctx, T) - ticksToSeconds(ctx, clip.offsetTicks)`, clamped to
   the media duration. Moving a clip changes only `offsetTicks`; it must not
   rewrite its source trim.
5. Overlap resolution and automatic scene bounds: use the tempo-aware computed
   timeline bounds. Because tempo changes can change those bounds, derive them
   at query time rather than persisting them.
6. Update scheduler bridge/plugin timeline views only if they expose audio
   region values; expose source seconds or already-derived absolute seconds,
   never source-local ticks.

### Phase 4 — Test the behavioral contract

Add focused tests that assert audio sample/time outcomes, not merely cached tick
values:

1. A 1-second full clip at 120 BPM and 60 BPM occupies exactly 1 second of
   audio both times, while its computed tick widths are 1920 and 960 (PPQ 960).
2. A 3-second clip beginning before a 120→60 BPM step has an end tick equal to
   `secondsToTicks(ticksToSeconds(startTick) + 3)` and plays/renders 3 seconds.
3. Two clips referencing one source at different offsets have independent,
   correct tick endpoints and identical source playback durations.
4. Moving a clip across a tempo step preserves its source trim and rendered
   waveform/audio content.
5. Resize a clip on either side of and across a tempo step; assert its saved
   source trim and the Web Audio/export source offsets.
6. Migration fixtures cover a flat-tempo legacy scene, a stepped-tempo legacy
   scene, a crossing clip, and an unavailable/rehydrated asset.
7. Replace `audioBpmScaling.test.ts`: tempo changes should no longer mutate
   `AudioCacheEntry`; only derived timeline endpoints change.
8. Keep existing delay and export-position tests, but update their fixtures to
   source-time clip fields and add an assertion for exact media duration.

### Phase 5 — Documentation and cleanup

1. Amend `docs/time-domain.md`: ticks are authoritative for musical timeline
   placement; decoded audio and trims are authoritative in media time. Remove
   the claim that audio clip duration is a persisted/cached tick value.
2. Document the tempo-map rule for audio clips and the migration in the audio
   asset/timeline documentation.
3. Remove the deprecated tick-local audio fields and compatibility helpers only
   after V9 import coverage is established and no plugin/public API exposes
   them.
4. Run the required verification suite: `npm run test`, `npm run build`, and
   `npm run compile`.

## Acceptance criteria

- Changing BPM or tempo automation never changes an `AudioBuffer` duration,
  source trim, source sample offset, or Web Audio playback duration.
- A clip's end tick is always derived from its start tick plus its real media
  duration through the current tempo map, including across map boundaries.
- The same source may be used by clips at different offsets without shared
  placement-dependent state.
- Preview playback and offline export select the same source samples for the
  same timeline range.
- Legacy scenes retain their audible audio regions after import and resave as
  V9.
