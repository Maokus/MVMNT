# Audio cache system

## Overview
- The audio cache pipeline converts ingested audio buffers into reusable feature caches that power the
  timeline UI and scene surfaces. Timeline state stores the normalized caches alongside per-source
  status metadata so analysis jobs can be restarted, merged, or cleared without rebuilding the entire
  scene graph.【F:src/state/timelineStore.ts†L880-L1088】
- Analysis jobs run through a shared scheduler that executes registered audio feature calculators and
  reports progress back to the store, allowing UI components to reflect pending, ready, stale, or
  failed states for each audio source.【F:src/audio/features/audioFeatureScheduler.ts†L38-L102】【F:src/state/timelineStore.ts†L283-L375】
- Scene elements declare their feature dependencies through analysis intents and sampling helpers so
  diagnostics tools and authoring surfaces can coordinate which descriptors are required at any
  moment.【F:src/core/scene/elements/audioFeatureUtils.ts†L75-L101】【F:src/audio/features/analysisIntents.ts†L80-L133】

## Data model and storage
- Each audio feature cache contains tempo-aware metadata, per-feature tracks, and the analysis
  parameters used to generate them. Feature tracks include hop durations, optional tempo projections,
  channel aliases, calculator identifiers, and raw payloads that may be typed arrays or waveform
  min/max envelopes.【F:src/audio/features/audioFeatureTypes.ts†L19-L111】
- Cache status entries track the lifecycle of each source (idle, pending, ready, failed, stale) with
  timestamps, messages, and optional progress values. These statuses enable UI feedback and drive
  reanalysis flows when calculators change or audio buffers are updated.【F:src/audio/features/audioFeatureTypes.ts†L113-L132】【F:src/state/timelineStore.ts†L283-L375】
- When an audio buffer is ingested, the timeline store stores the decoded buffer, schedules feature
  analysis, and marks the initial status as pending. Successful analysis upgrades or merges existing
  caches and records a hash of the source input so later invalidations can detect drift.【F:src/state/timelineStore.ts†L880-L955】
- Timeline actions can stop, restart, or re-run specific calculators. Restarting ensures a buffer is
  available, while targeted reanalysis merges new tracks into the existing cache so other features
  remain intact.【F:src/state/timelineStore.ts†L1008-L1071】
- Cache invalidation occurs automatically when calculator implementations register a new version; the
  store marks affected caches as stale so diagnostics and UI can prompt the user to regenerate the
  data.【F:src/audio/features/audioFeatureRegistry.ts†L6-L33】【F:src/state/timelineStore.ts†L957-L987】
- Caches are versioned and migrated forward. Legacy payloads are normalized to the current structure
  before storage, ensuring downstream consumers always read tempo projections and track metadata in a
  consistent format.【F:src/audio/features/audioFeatureMigration.ts†L1-L37】【F:src/audio/features/audioFeatureAnalysis.ts†L569-L718】

## Analysis pipeline
- The shared scheduler serializes jobs, applies cancellation tokens, and translates optional abort
  signals from callers. Completed jobs resolve with a normalized cache, while cancellations report a
  dedicated abort error.【F:src/audio/features/audioFeatureScheduler.ts†L38-L102】
- `analyzeAudioBufferFeatures` prepares the analysis context by quantizing hop sizes, constructing a
  tempo mapper, and building an analysis profile descriptor that documents the window and FFT
  settings. Progress callbacks are invoked per calculator to update pending statuses in the store.【F:src/audio/features/audioFeatureAnalysis.ts†L980-L1109】【F:src/state/timelineStore.ts†L283-L375】
- Built-in calculators provide spectrogram, RMS loudness, and waveform min/max tracks. Each calculator
  mixes the buffer to mono, applies windowing, yields control periodically to remain responsive, and
  emits tempo-projected tracks with metadata suitable for visualization.【F:src/audio/features/audioFeatureAnalysis.ts†L736-L961】
- Additional calculators can be registered at runtime through the registry. Registration automatically
  invalidates caches created with older versions so they are reanalysed with the new implementation.【F:src/audio/features/audioFeatureRegistry.ts†L6-L33】
- Serialization helpers export caches to JSON-safe payloads and back again, attaching legacy views and
  default analysis profiles so persisted documents can be reopened without rerunning analysis.【F:src/audio/features/audioFeatureAnalysis.ts†L569-L718】

## Feature descriptors and intent bus
- Feature descriptors specify the feature key, calculator, channel selection, smoothing, and optional
  aliases. Descriptors can be grouped under match keys to deduplicate requests for the same feature or
  channel across surfaces.【F:src/audio/features/audioFeatureTypes.ts†L19-L58】【F:src/audio/features/analysisIntents.ts†L51-L70】
- Scene elements publish analysis intents describing which track, profile, and descriptors they need.
  The bus deduplicates intents per element, emits publish/clear events, and stores the last hash to
  avoid noisy updates.【F:src/audio/features/analysisIntents.ts†L80-L133】
- Diagnostics state subscribes to the intent stream, queues regeneration jobs, and records history.
  When an intent arrives, the diagnostics store groups descriptors by track/profile and triggers
  reanalysis through timeline actions when a user requests regeneration.【F:src/state/audioDiagnosticsStore.ts†L520-L635】
- Descriptor helpers normalize incoming values, resolve channel indexes by alias, and ensure intents
  are cleared when a surface disconnects or loses its track binding.【F:src/core/scene/elements/audioFeatureUtils.ts†L45-L160】

## UI integration
- The `AudioFeatureDescriptorInput` pulls available features from the timeline store, auto-sorts them
  into categories, and suggests analysis profiles when descriptors require a specific calculator
  configuration. It emits linked updates when a new descriptor implies a different analysis profile
  should be selected for the track.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L237-L391】【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L351-L375】
- Category and channel selection tools in the input enforce unique descriptors per feature, map auto
  selections to channel aliases, and update smoothing or linked form fields in tandem with the
  descriptor list.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L394-L520】
- The Scene Analysis Caches tab presents per-track cache status, progress, and available feature
  tracks. Users can stop, restart, or reanalyze individual calculators, with buttons disabled when
  buffers are missing or jobs are already running.【F:src/workspace/layout/SceneAnalysisCachesTab.tsx†L91-L200】
- Diagnostics panels (via the audio diagnostics store) surface pending descriptors, job history, and
  regeneration utilities, keeping state in sync with timeline caches and active intents.【F:src/state/audioDiagnosticsStore.ts†L520-L635】

## Scene surfaces and sampling utilities
- `audioFeatureUtils` resolves track bindings for scene elements, coerces descriptors, publishes
  intents, and caches sampled frames so repeated renders reuse values. Channel indices can be derived
  from aliases provided either by the track or the cache metadata.【F:src/core/scene/elements/audioFeatureUtils.ts†L18-L200】
- The tempo-aligned adapter maps feature frames into timeline ticks or seconds. It reuses a cached
  tempo mapper, handles interpolation strategies, and exposes range sampling helpers used by history
  visualizations and diagnostics.【F:src/audio/features/tempoAlignedViewAdapter.ts†L1-L218】
- History sampling utilities convert descriptor requests into evenly spaced time windows, query the
  tempo-aligned range adapter, and return timestamped values for visual decay effects such as peak
  meters or spectrogram trails.【F:src/utils/audioVisualization/history.ts†L1-L99】【F:src/utils/audioVisualization/history.ts†L100-L169】
- Scene elements such as the spectrum, volume meter, and oscilloscope publish intents, sample frames,
  and blend historical data to render their visuals. They respect per-descriptor analysis profiles and
  palette data derived from cache metadata so multi-layer visualizations stay in sync with analysis
  results.【F:src/core/scene/elements/audio-spectrum.ts†L903-L1019】【F:src/core/scene/elements/audio-volume-meter.ts†L378-L470】

## Extending the system
- Register new calculators through the registry before scheduling analysis to make their feature
  tracks available to UI selectors and scene surfaces. The scheduler automatically reuses the
  registry’s calculators list for future jobs.【F:src/audio/features/audioFeatureAnalysis.ts†L720-L733】
- To reanalyse features programmatically, call the timeline store’s restart or reanalysis methods; the
  scheduler merges new tracks when requested so partial updates do not discard existing data.【F:src/state/timelineStore.ts†L1008-L1071】
- When adding new surfaces, use the descriptor helpers and intent bus so diagnostics and auto-analysis
  tools stay aware of feature requirements. Sampling should go through the tempo-aligned utilities to
  respect hop spacing, tempo projections, and cache alignment.【F:src/core/scene/elements/audioFeatureUtils.ts†L75-L200】【F:src/audio/features/tempoAlignedViewAdapter.ts†L1-L218】
