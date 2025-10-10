# Audio feature caches and bindings

_Last reviewed: 2025-10-15_

## Overview

## Glossary

- **Analysis profile:** Named set of analysis parameters.
  It covers FFT size, hop length, and window settings.
  Sample rate assumptions live in the profile so caches regenerate deterministically.
- **Feature descriptor:** Serialized request for a single analysed signal.
  It stores `featureKey`, optional band or channel indexes, and smoothing radius values.
  Calculator metadata travels with the descriptor for determinism.
- **Track reference:** Stable pointer to the audio timeline track.
  It uses `timelineTrackRef` or a constant track ID to locate the source cache for descriptors.
- **Channel alias:** Human-readable label (for example `Left`, `Right`, `Mid`, `Side`).
  It maps to a channel index so selectors and inspector UI present multi-channel data clearly.

Audio feature caches capture precomputed analysis of imported audio so visual elements stay in sync
without repeating FFT or RMS work during playback. Each cache stores real-time aligned frames for one
audio source and one or more feature tracks (for example spectrogram magnitudes, RMS envelopes, or
oscilloscope windows). Scene bindings and the inspector UI consume these caches to animate spectrum,
volume, and oscilloscope elements.

Related planning notes live in [`thoughts/audio_vis_research_3.md`](../thoughts/audio_vis_research_3.md)
and the architecture is detailed in [`HYBRID_AUDIO_CACHE.md`](./HYBRID_AUDIO_CACHE.md).

## Binding shift summary
- Legacy `AudioFeatureBinding` payloads have been replaced with neutral `{ trackRef, featureDescriptor }`
  pairs so audio-driven properties behave like other binding types.
- `PropertyBinding.fromSerialized` migrates historical documents at load time, and persistence/export
  flows read and write the new structure. See [`src/bindings/property-bindings.ts`](../src/bindings/property-bindings.ts)
  and [`src/persistence/document-gateway.ts`](../src/persistence/document-gateway.ts) for the shipping
  runtime.
- Inspector UX, macro tooling, and templates now rely on the shared track reference type introduced by
  the binding shift. Guidance in this file supersedes the retired `legacybindingshiftplan.md` notes.

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

## Cache regeneration diagnostics

- When the cache diffing pipeline detects missing or stale descriptors, the workspace surfaces a
  non-blocking banner with actions to regenerate everything or open a dedicated diagnostics panel.
- The diagnostics panel groups descriptors by track and analysis profile, lists their current status
  (Current, Missing, Stale, Extraneous, Regenerating), and provides scoped actions to rerun analysis or
  dismiss extraneous cache entries. Panel visibility is remembered in user preferences.
- Each regeneration request is queued deterministically. Results and failures are appended to the audio
  analysis history log, which is exposed via developer tools and attached to export manifests as
  `exports/<sceneId>/analysis-history.json` when the feature flag is enabled.
- History retention is bounded (1000 entries by default) so developer tooling can inspect the most
  recent regenerations without bloating project files or exports.

## Property bindings and runtime consumption

Property bindings now serialize either a constant audio track ID or a `timelineTrackRef` macro
alongside a `features[]` array describing the requested data. Each descriptor entry stores a
`featureKey`, optional band or channel selection, calculator metadata, and a smoothing radius. During
rendering, elements resolve the binding into `{ trackRef, features[], analysisProfileId }` and forward
those inputs to `selectAudioFeatureFrame` or `sampleAudioFeatureRange`. Descriptors remain the single
source of truth for smoothing and channel metadata; elements cache the most recent sample so repeated
property reads within a frame remain cheap.

Three built-in elements consume audio feature descriptors today:

- **Audio Spectrum** draws bar rectangles for multi-channel magnitude data.
- **Audio Volume Meter** renders a single bar driven by RMS energy.
- **Audio Oscilloscope** expands waveform min and max pairs into a polyline.

Plug-in calculators can reuse the binding pipeline by registering with
`audioFeatureCalculatorRegistry` so their feature IDs appear in the inspector.

## Authoring workflow

1. Import an audio file. Once the buffer loads, trigger analysis from the inspector or the track
   context menu. Status badges reflect `pending`, `running`, `ready`, or `failed` states.
2. In the element inspector, use the shared track picker to choose an audio track, then configure the
   feature descriptors. The selector groups analysed features by category, supports multi-channel
   checkboxes, and shows glossary-backed tooltips for descriptors and analysis profiles. Authors can
   add multiple descriptors per element—stereo waveform selections render as individual chips—and the
   inspector surfaces recommended `analysisProfileId` updates when cache metadata diverges from the
   current binding.
3. Preview sparklines update using `sampleAudioFeatureRange`, retry controls surface if analysis fails,
   and the "Use &lt;profile&gt;" action applies suggested profiles without leaving the inspector.
4. Bindings serialize through the scene store so save/load, undo, telemetry, and export keep the feature
   selection and profile choices intact.

## Macro assignments
### Assigning audio tracks to macros
1. Select an audio-reactive element (for example, **Audio Spectrum**) in the inspector.
2. Choose an audio track within the **Audio binding** group, configure the desired descriptors, then click
   the link icon to create or reuse a macro.
3. Newly created macros set `allowedTrackTypes: ['audio']`, so macro dialogs and timeline selectors filter
   to audio tracks automatically.
4. Reuse the macro on any element that expects an audio track reference; descriptor editing stays scoped to
   the element so creators can fine-tune smoothing and channel preferences without editing the macro.

### Inspector layout
- The inspector groups the track selector and descriptor editor together with inline guidance so creators
  understand how descriptors pair with shared track references.
- When an element is macro-bound, descriptor controls remain interactive and write changes back to the
  element while leaving macro payloads untouched.

### Validation rules
- Macro assignments validate against the timeline store. If an audio-only macro receives a MIDI track
  (or vice versa) the inspector surfaces an error describing the mismatch.
- Existing macros referencing missing tracks remain valid, preserving backward compatibility for older
  projects.

### Template spotlight
- The bundled `default.mvt` template includes an `audioSpectrumMacro` element wired to the
  `audioFeatureTrack` macro, demonstrating audio-driven macros immediately after project creation.

## Recent updates
- Audio track macros share the standard track reference model, giving parity with MIDI-driven macros while
  keeping descriptor editing local to each element.
- Inspector panels display the combined track-and-descriptor editor with glossary-aligned copy to explain
  cache regeneration workflows.
- Migration utilities convert legacy scenes automatically; macros without `allowedTrackTypes` default to
  MIDI behaviour until authors opt into audio track assignments.

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
