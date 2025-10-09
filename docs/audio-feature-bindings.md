# Audio Feature Caches and Bindings

_Last reviewed: 2025-10-10_

## Overview

Audio feature caches capture precomputed analysis of imported audio so visual elements stay in sync
without repeating FFT or RMS work during playback. Each cache stores real-time aligned frames for one
audio source and one or more feature tracks (for example spectrogram magnitudes, RMS envelopes, or
oscilloscope windows). Scene bindings and the inspector UI consume these caches to animate spectrum,
volume, and oscilloscope elements.

> **Deprecation note:** The legacy `AudioFeatureBinding` subtype was removed in the 2025-10 binding
> migration documented in [`thoughts/legacybindingshiftplan.md`](../thoughts/legacybindingshiftplan.md).
> Properties now serialize neutral `{ timelineTrackRef | constantTrackId, featureDescriptor }` pairs
> so audio-driven controls align with the standard binding runtime.

Related planning notes live in [`thoughts/audio_vis_research_3.md`](../thoughts/audio_vis_research_3.md)
and the architecture is detailed in [`HYBRID_AUDIO_CACHE.md`](./HYBRID_AUDIO_CACHE.md).

## Cache structure

Audio feature caches follow the shared schema defined in `@audio/features/audioFeatureTypes`:

- `audioSourceId`: stable ID for the analyzed audio buffer.
- `frameDurationSec`: cadence between frames expressed in seconds. Legacy tempo-domain caches map to
  this value via migration.
- `frameCount`: total number of frames produced by the calculators.
- `analysisParams`: metadata describing window size, hop size, overlap, sample rate, and calculator
  versions used during analysis.
- `statistics`: optional per-track aggregates (for example min/max, RMS) precomputed for adapters.
- `featureTracks`: record keyed by feature ID (`rms`, `spectrogram`, `waveform`, or plug-in IDs).
  Each track includes:
  - `calculatorId` and `version` identifying the producing calculator.
  - `frameCount`, `channels`, and `format` (`float32`, `uint8`, `int16`, or `waveform-minmax`).
  - `data`, stored as a typed array or `{ min, max }` payload for waveform windows.

Caches are ingested through the timeline store (`ingestAudioFeatureCache`) and participate in undo,
serialization, and export snapshots alongside existing audio caches. Real-time caches are the
canonical storage. Legacy tempo-domain caches are upgraded in place during load via
`hydrateHybridAudioCache`.

## Sampling APIs

Selectors in `@state/selectors/audioFeatureSelectors` proxy to the tempo-aligned adapter in
`@audio/features/tempoAlignedViewAdapter` and expose interpolated sampling helpers:

- `selectAudioFeatureFrame(state, trackId, featureKey, tick, options)` resolves a single frame using
  tick-aligned interpolation and optional band or channel filtering. The `options` parameter accepts
  an `interpolation` profile: `'linear'` (default), `'hold'`, or `'spline'`.
- `sampleAudioFeatureRange(state, trackId, featureKey, startTick, endTick, options)` returns a dense
  `Float32Array` covering a tick range, suitable for canvas previews or export pipelines.

Both helpers honor track offsets, clip regions, and smoothing values. They are the single source of
truth for runtime bindings, inspector previews, and export rendering. Under the hood they request
tempo projections from the shared tempo mapper so tick-based callers receive tempo-aligned frames
without duplicating conversion logic.

## Tempo-aligned adapter and diagnostics

`@audio/features/tempoAlignedViewAdapter` provides the canonical entry points for consuming real-time
caches:

- `getTempoAlignedFrame(state, request)` returns a tempo-projected frame sample plus diagnostics.
- `getTempoAlignedRange(state, request)` streams a tick window of frames with aligned tick metadata.

Diagnostics report cache hits, mapper latency (nanoseconds), interpolation mode, and fallback reasons.
`TimelineState.recordTempoAlignedDiagnostics` stores the latest diagnostic per source so DevTools can
surface mapper timing, and `TimelineState.hybridCacheRollout.fallbackLog` keeps a bounded audit trail
when the adapter falls back to compatibility sampling. The rollout can be toggled at runtime with
`setHybridCacheAdapterEnabled(enabled, reason)` to stage deployments or disable the adapter for
troubleshooting. Hold interpolation keeps the previous frame value, linear interpolation matches the
pre-existing behaviour, and spline interpolation uses Catmull–Rom to smooth transitions while keeping
CPU overhead predictable.

## Property bindings and runtime consumption

Property bindings now serialize either a constant audio track ID or a `timelineTrackRef` macro
alongside a `featureDescriptor` describing the requested data (`featureKey`, channel/band selection,
and smoothing parameters). During rendering, elements resolve the binding into `{ trackRef,
featureDescriptor }` and forward those inputs to `selectAudioFeatureFrame` or
`sampleAudioFeatureRange`. The descriptor is the single source of truth for smoothing and channel
metadata; elements cache the most recent sample so repeated property reads within a frame remain
cheap.

Three built-in elements consume audio feature descriptors:

- **Audio Spectrum** draws bar rectangles for multi-channel magnitude data.
- **Audio Volume Meter** renders a single bar driven by RMS energy.
- **Audio Oscilloscope** expands waveform min and max pairs into a polyline.

Plug-in calculators can reuse the binding pipeline by registering with
`audioFeatureCalculatorRegistry` so their feature IDs appear in the inspector.

## Authoring workflow

1. Import an audio file. Once the buffer loads, trigger analysis from the inspector or the track
   context menu. Status badges reflect `pending`, `running`, `ready`, or `failed` states.
2. In the element inspector, use the shared track picker to choose an audio track, then configure the
   feature descriptor (feature key, optional band or channel, and smoothing radius). The descriptor is
   stored separately from the binding so macros remain compatible with audio-driven controls.
3. Preview sparklines update using `sampleAudioFeatureRange`, and retry controls surface if analysis
   fails.
4. Bindings serialize through the scene store so save and load, undo, and export keep the feature
   selection intact.

## Export and determinism

Exports reuse the same selectors used for live playback. Tests ensure descriptor sampling matches the
data returned by `sampleAudioFeatureRange`, guaranteeing deterministic renders even when the adapter is
toggled off. The reproducibility hash (`@export/repro-hash`) already includes normalized audio track
metadata and descriptor payloads, so feature-driven scenes stay stable across re-renders as long as
caches remain unchanged.

## Plug-in calculators

Third parties can register calculators via `audioFeatureCalculatorRegistry.registerCalculator`. A
calculator provides metadata (`id`, `name`, `channels`, optional UI parameters) and implements
`calculate(audioBuffer, timingContext)`. Results must match the cache schema so they automatically
participate in selectors, inspector previews, and exports.

When evolving calculator behavior, bump the `version` so the analysis scheduler can invalidate stale
caches and trigger re-analysis.
