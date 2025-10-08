# Audio Feature Caches and Bindings

_Last reviewed: 2025-02-17_

## Overview

Audio feature caches capture precomputed analysis of imported audio so visual elements can stay in
sync with the timeline without repeating FFT or RMS work during playback. Each cache stores aligned
frames for one audio source and one or more feature tracks (e.g. spectrogram magnitudes, RMS
envelope, oscilloscope waveform windows). Scene bindings and the inspector UI consume these caches to
animate spectrum, volume, and oscilloscope elements.

Related planning notes live in [`thoughts/audio_vis_research_3.md`](../thoughts/audio_vis_research_3.md).

## Cache structure

Audio feature caches follow the shared schema defined in `@audio/features/audioFeatureTypes`:

- `audioSourceId`: stable ID for the analyzed audio buffer.
- `hopTicks` / `hopSeconds`: cadence between frames expressed in timeline ticks and seconds.
- `frameCount`: total number of frames produced by the calculators.
- `analysisParams`: metadata describing window size, hop size, overlap, sample rate, and calculator
  versions used during analysis.
- `featureTracks`: record keyed by feature ID (`rms`, `spectrogram`, `waveform`, or plug-in IDs).
  Each track includes:
  - `calculatorId` and `version` identifying the producing calculator.
  - `frameCount`, `channels`, `hopTicks`, and `format` (`float32`, `uint8`, `int16`, or
    `waveform-minmax`).
  - `data`, stored as a typed array or `{ min, max }` payload for waveform windows.

Caches are ingested through the timeline store (`ingestAudioFeatureCache`) and participate in undo,
serialization, and export snapshots alongside existing audio caches.

## Sampling APIs

Selectors in `@state/selectors/audioFeatureSelectors` expose interpolated sampling helpers:

- `selectAudioFeatureFrame(state, trackId, featureKey, tick, options)` resolves a single frame using
  tick-aligned interpolation and optional band/channel filtering.
- `sampleAudioFeatureRange(state, trackId, featureKey, startTick, endTick, options)` returns a dense
  `Float32Array` covering a tick range, suitable for canvas previews or export pipelines.

Both helpers honor track offsets, clip regions, and smoothing values. They are the single source of
truth for runtime bindings, inspector previews, and export rendering.

## Property bindings and runtime consumption

`AudioFeatureBinding` extends the property binding system so scene elements can request feature
frames on demand. During rendering, `SceneElement` supplies a `PropertyBindingContext` containing the
target playback time. The binding converts that time into ticks with the shared `TimingManager`, then
invokes `selectAudioFeatureFrame` to obtain the frame vector. Elements cache the most recent sample
so repeated property reads within a frame remain cheap.

Three built-in elements consume audio feature bindings:

- **Audio Spectrum** draws bar rectangles for multi-channel magnitude data.
- **Audio Volume Meter** renders a single bar driven by RMS energy.
- **Audio Oscilloscope** expands waveform min/max pairs into a polyline.

Plug-in calculators can reuse the binding pipeline by registering with
`audioFeatureCalculatorRegistry` so their feature IDs appear in the inspector.

## Authoring workflow

1. Import an audio file. Once the buffer loads, trigger analysis from the inspector or the track
   context menu. Status badges reflect `pending`, `running`, `ready`, or `failed` states.
2. In the element inspector, choose **Audio Feature** for the relevant property. The control lets you
   pick the source track, feature key, optional band/channel, and smoothing radius.
3. Preview sparklines update using `sampleAudioFeatureRange`, and retry controls surface if analysis
   fails.
4. Bindings serialize through the scene store so save/load, undo, and export keep the feature
   selection intact.

## Export and determinism

Exports reuse the same selectors used for live playback. Tests ensure `AudioFeatureBinding`
samples match the data returned by `sampleAudioFeatureRange`, guaranteeing deterministic renders.
The reproducibility hash (`@export/repro-hash`) already includes normalized audio track metadata, so
feature-driven scenes stay stable across re-renders as long as caches remain unchanged.

## Plug-in calculators

Third parties can register calculators via `audioFeatureCalculatorRegistry.registerCalculator`. A
calculator provides metadata (`id`, `name`, `channels`, optional UI parameters) and implements
`calculate(audioBuffer, timingContext)`. Results must match the cache schema so they automatically
participate in selectors, inspector previews, and exports.

When evolving calculator behavior, bump the `version` so the analysis scheduler can invalidate stale
caches and trigger re-analysis.
