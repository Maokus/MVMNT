# Audio-reactive elements with audio clips

## Purpose

Make scene elements continue to target an **audio track**, while resolving the
audio heard/visualised at a given timeline time from that track's enabled
`AudioClip`s.  This brings cached feature reads and raw PCM reads in line with
the clip-aware playback and export paths.

This is a read-path change.  Feature analysis remains source-level:
`audioFeatureCaches[sourceId]` contains a single immutable-source analysis and
must not be duplicated for each clip or track placement.

## What is implemented already

- `AudioTrack.clips` and the legacy `getAudioClipsForTrack()` adapter provide
  clip collections, including source-second trims.
- `getAudioClipSourceBounds()` and `getAudioClipTimelineBounds()` define the
  canonical trim and tempo-map-aware placement rules.
- The real-time engine and offline mixer already iterate enabled clips and
  obtain audio from `clip.sourceId`.
- Scene elements select an audio track through `audioTrackId`.  The public host
  API exposes feature reads (`sampleFeatureAtTime` / `sampleFeatureRange`) and
  raw reads (`getRawSamples` / `getRmsInWindow`).

## Current gap

The scene-element read paths still assume that an audio track owns one source
and one legacy region:

- `tempoAlignedViewAdapter.resolveAudioSourceTrack()` resolves
  `track.audioSourceId ?? trackId` and maps ticks using `offsetTicks` and
  `regionStartTick`.
- `resolveFeatureContext()` uses the same source fallback before feature
  sampling starts.
- The raw host API methods use that fallback and make the same legacy
  tick-to-file-local conversion.

A modern `AudioTrack` can have no `audioSourceId`, can contain several clips,
and those clips can refer to different sources.  Consequently a new clip-only
track currently misses its cache, while a multi-clip track cannot select the
right source or source-local time.  Existing sampling memoization also keys
only by feature track and timeline tick, which becomes unsafe once one source
is reused by clips at different placements or on different tracks.

## Target contract

Keep `audioTrackId` as the element-facing property.  A track is the intended
playlist-like target; changing saved elements to point at transient clip IDs
would make them fragile when clips are edited.

For a requested timeline time/window:

1. Consider enabled clips on the selected enabled audio track.
2. Use the clip helpers and the current timeline timing context to find clips
   that intersect the request.  Do not calculate clip bounds from deprecated
   track fields.
3. Map each intersecting timeline instant to its source-local seconds using
   the same source-time/placement rule used by playback and export.
4. Read that source's decoded PCM or feature cache.
5. Return silence inside track gaps and outside a clip trim.  Preserve `null`
   for invalid input, a missing track/source/cache, or unavailable decoded PCM.

Same-track clip overlap is already disallowed.  The resolver should still be
deterministic if malformed legacy state overlaps (choose the first clip in
stable track order, record a diagnostic) rather than silently summing features.
Cross-track overlap is independent: every selected track resolves only its own
clips.  Raw and feature APIs remain **pre-fader** by default, matching their
current raw-PCM/source-analysis meaning; track mute/solo/gain and clip gain are
not folded into the values unless a later, explicitly named post-mix API is
introduced.

For raw windows that cross a clip edge or a gap, return a timeline-length,
zero-padded buffer when decoded audio is available.  That lets oscilloscopes
and meters see the same silence/transition as playback instead of receiving a
shortened source slice.  `getRmsInWindow()` should calculate from this resolved
window so it shares the exact edge behaviour.

## Implementation plan

### 1. Introduce one clip-aware read resolver

Create a small, pure resolver near `src/state/timeline/audioClips.ts` (or a
dedicated `audioClipSampling.ts`) with no rendering or plugin dependencies.

- Input: `TimelineState`, `trackId`, requested timeline tick or second range.
- Output: stable clip/source segments containing `trackId`, `clipId`,
  `sourceId`, timeline bounds, source-local start/end seconds, and a sampling
  identity/version.
- Build its timing context with `createTimelineTimingContext`; do not use the
  global fixed-tempo `TimingManager` for conversion.
- Reuse `getAudioClipsForTrack`, `getAudioClipSourceBounds`, and
  `getAudioClipTimelineBounds` so legacy synthetic clips continue to work.
- Expose focused helpers for a single instant and a time range.  The instant
  helper is the only place allowed to choose the defensive overlap winner.

Unit-test this resolver first: sequential clips, one source repeated at two
placements, two sources on one track, trims, gap silence, disabled clips, legacy
tracks, and a clip that spans a tempo-map change.

### 2. Make feature sampling resolve clips, not tracks-as-sources

Refactor `src/audio/features/tempoAlignedViewAdapter.ts` to resolve the active
clip before loading `audioFeatureCaches[sourceId]`.

- For `getTempoAlignedFrame`, convert the requested timeline tick to the
  selected clip's source-local seconds, then sample that source feature track.
  Retain the adapter's existing interpolation, smoothing, channel metadata and
  shaped silent-vector behaviour.
- Replace the legacy `offsetTicks`/`regionStartTick` arithmetic with the
  resolver's mapping.  Return a correctly shaped silent sample when the track
  exists but no enabled clip intersects the tick; retain existing `undefined`
  diagnostics for missing track/cache/feature.
- Rework `getTempoAlignedRange` to segment the requested range by intersecting
  clips and gaps, then concatenate feature frames in timeline order with silent
  frames for gaps.  It must not assume one `sourceId`, one feature track, or
  one continuous tempo projection for the whole range.
- Include `sourceId`, `clipId`, and a placement/trim revision in adapter
  diagnostics so misses can be understood when the same source is reused.
- Simplify `audioFeatureUtils.resolveFeatureContext()` so it does not make a
  premature single-source decision.  Let the adapter own clip resolution.
- Fix `sampleFeatureFrame` memoization: key by track and resolved clip mapping
  (or invalidate on clip-edit revision), not merely `AudioFeatureTrack` and
  timeline tick.  A safe initial implementation may bypass the memo for
  clip-backed tracks until the resolver exposes a stable identity.

`sceneApi`, selectors, SDK shortcuts, and `PluginAudioApi.sampleFeature*` can
keep their track-ID signatures; they should delegate to the clip-aware adapter.

### 3. Make raw PCM APIs use the same resolver

Extract raw-window assembly from `src/core/scene/plugins/host-api/plugin-api.ts`
into a testable audio utility, then implement it with the range resolver.

- Allocate output at the selected source sample rate only after determining
  that there is one usable decoded source.  For a window spanning clips with
  different sample rates, either resample to a documented canonical rate or,
  preferably, add an API result that carries `sampleRate` and use a common
  timeline sample rate (for example 48 kHz).  Do not concatenate incompatible
  PCM frame rates without conversion.
- Copy each intersecting clip segment to its timeline-correct position and
  zero-fill gaps.  Reads should never escape `sourceStartSeconds` /
  `sourceEndSeconds`.
- Preserve the current `MAX_RAW_SAMPLES` guard after calculating the assembled
  output length.  Return `null` for absent decoded assets or an oversized/invalid
  window, and a zeroed array for a valid silent gap.
- Implement `getRmsInWindow` on the assembled PCM path; `getSampleRate` should
  report the resolver's documented output rate rather than the legacy track
  source rate.

This directly fixes `AudioWaveformElement`, `AudioLockedOscilloscopeElement`,
and `AudioVolumeMeterElement`.  Feature-path elements (`AudioSpectrumElement`,
`AudioPeaksElement`, and pitch-guide displays) are fixed by phase 2.

### 4. Update source-derived UI and diagnostics

Replace remaining `track.audioSourceId ?? track.id` reads where a modern track
can have multiple clip sources.  In particular, update analysis-profile UI,
feature-cache status chips, cache diagnostics, and scene analysis cache rows.

- For controls tied to an element's `audioTrackId`, present the union of
  profiles/statuses from that track's referenced sources, or require an
  explicit source/clip choice if the UI operation is inherently source-scoped
  (such as reanalysis).
- Keep diagnostics grouped by `sourceId`, but map one track intent to every
  referenced clip source so required calculators are scheduled for all clips
  the element can encounter.
- Deduplicate requirements by `(sourceId, analysis profile, descriptor)` so a
  repeated source is analysed once.

### 5. Test and document the public behaviour

Add integration tests at all three seams:

- Resolver and adapter: two clips from different sources, repeated source at
  different placements, trimmed clips, gap/disabled-clip silence, and tempo-map
  crossings.
- Plugin API: raw data and RMS windows within a clip, across a boundary, and
  entirely in a gap; verify no samples leak from outside a trim.
- Elements: waveform, meter, spectrum/peaks, and locked oscilloscope respond
  to a later clip on the same selected track without changing `audioTrackId`.

Include cache/memoization regression coverage: sample the same source at the
same timeline tick through two differently placed tracks and prove the results
do not cross-contaminate.  Retain existing legacy-track tests as compatibility
fixtures.

Update `docs/audio-features/concepts.md`, `docs/audio-features/quickstart.md`,
and the plugin API reference to state that `audioTrackId` resolves clip content
at the requested timeline time, feature caches are source-level, values are
pre-fader, and gaps produce silence.

## Delivery order and exit criteria

1. Land the pure resolver and tests.
2. Land feature-frame/range sampling plus memoization correctness tests.
3. Land raw PCM/RMS assembly and element integration tests.
4. Land diagnostics/UI source fan-out and documentation.

The work is complete when one audio-reactive element can remain bound to a
single multi-clip audio track and correctly follows each enabled clip's source,
trim, placement, and silence gaps in preview and export-time rendering, while
legacy single-source tracks remain unchanged.
