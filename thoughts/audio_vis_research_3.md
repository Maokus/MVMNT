# Audio Visualization Implementation Plan (Audio Feature Cache)

**Status:** Phase 1–2 complete in mainline (2025-02-16); remaining work tracks Phase 3–4 delivery

## Objectives

- Deliver precomputed audio feature caches (spectrogram, volume envelope, oscilloscope waveform) aligned to canonical timeline ticks.
- Enable runtime scene bindings and authoring tools to consume cached features with parity to existing MIDI workflows.
- Support extensibility via plug-in calculators so bespoke features can participate in the shared cache schema (`featureTracks`, `hopTicks`).
- Establish verification steps covering cache lifecycle, runtime consumption, and export determinism.

## Scope Overview

- Audio sources imported into projects gain optional feature cache generation using offline analysis.
- Timeline state retains feature caches alongside MIDI/audio caches, participating in undo/redo, serialization, and auto-range logic.
- Scene elements can bind to audio feature channels through new binding metadata and inspector controls.
- Third-party or bespoke features integrate through a calculator registration interface that outputs cache-compatible data.

## Phase 1 – Cache Schema & State Integration

### Deliverables

- TypeScript definitions for `AudioFeatureCache`, `AudioFeatureTrack`, and `AudioFeatureCalculator` with alignment metadata (`hopTicks`, `analysisParams`, `version`).
- Timeline store slice managing feature caches keyed by audio source ID, including selectors for retrieval and status flags (`pending`, `ready`, `failed`).
- Command payload updates (`addTrackCommand`, related undo/redo helpers) to persist feature cache data.
- Plug-in calculator registry allowing feature calculators to register metadata and produce cache entries that conform to the shared schema.

### Implementation Notes

- Reuse existing tempo helpers (`createTimelineTimingContext`, `beatsToTicks`, `ticksToBeats`) to compute `hopTicks` and cache alignment.
- Extend auto-range utilities to reference feature cache bounds when MIDI data is absent.
- Calculator registry should expose hooks for lifecycle events: `prepare(params)`, `calculate(audioBuffer, timing)`, `serializeResult()`, enabling future server/offline execution.

### Verification

- Unit tests for timeline selectors confirming caches are stored/retrieved with correct `hopTicks` and metadata.
- Undo/redo regression test ensuring audio track creation with feature cache maintains state across history operations.
- Serialization test verifying `.mvt` export/import preserves cache payloads and calculator identifiers.
- Contract test for calculator registry: registering a mock calculator produces cache entries recognized by timeline state and auto-range logic.

## Phase 2 – Offline Analysis Pipeline

### Deliverables

- Worker/offline module using `OfflineAudioContext` (browser) and Node fallback to generate:
  - Bark/Mel-reduced spectrogram magnitudes.
  - RMS envelope (UInt8 or Float32 quantization).
  - Oscilloscope waveform windows (downsampled min/max pairs).
- Scheduler orchestrating analysis jobs during audio ingest or manual re-analysis requests, exposing progress and cancellation.
- Cache invalidation triggered by changes in audio buffer hash, tempo map, or calculator version.

### Implementation Notes

- Quantize analysis hops into ticks via tempo helpers, storing `hopTicks` and frame count in the cache.
- Pipeline should route results through the calculator interface: built-in calculators register internally but use the same callback pattern as external ones.
- Persist `analysisParams` including window size, overlap, and smoothing to support future recalculation comparisons.

### Verification

- Integration tests ingesting sample audio verify caches populate within target latency and expose expected track keys (`spectrogram`, `rms`, `waveform`).
- Performance benchmark (automated or documented manual) confirming 3-minute track analysis completes under target threshold.
- Invalidation test editing tempo map and confirming caches mark stale and regenerate on next request.
- Calculator plug-in test injecting a custom calculator (e.g., zero-crossing rate) ensures results feed into cache and align with `hopTicks` metadata.

## Phase 3 – Runtime Consumption & Scene Binding

### Deliverables

- Selectors/utilities (`selectAudioFeatureFrame`, `sampleAudioFeatureRange`) providing interpolated feature values for a given tick range.
- Scene binding schema updates with `AudioFeatureBinding` referencing source track, feature key, optional band index, smoothing, and calculator ID.
- Runtime adapters for spectrogram, volume bar, and oscilloscope elements that consume cached data without performing live FFT work.
- Export pipeline updates ensuring renders access cached data deterministically.

### Implementation Notes

- Align sampling with existing timeline tick progression to maintain sync between MIDI and audio-driven elements.
- Implement caching/memoization for frequent lookups, reusing arrays to minimize GC pressure during playback.
- Expose runtime hooks allowing plug-in calculators to define post-processing (e.g., value normalization) while keeping cache storage canonical.

### Verification

- Automated scene playback test asserting feature-driven elements update per tick and remain synchronized after seeking.
- Export vs. live parity test comparing sampled frames or checksums for a feature-driven scene across preview and render outputs.
- UI integration tests (or Storybook interactions) verifying inspector binding configuration surfaces available features and handles missing cache states gracefully.
- Manual QA checklist covering seek, loop, tempo change, and project reload scenarios for feature-driven elements.

## Phase 4 – Authoring UX & Documentation

### Deliverables

- Inspector panels for selecting audio track, feature type/band, smoothing, and calculator plug-in options.
- Analysis status UI (queued/running/failed) with retry actions and background notifications.
- Lightweight preview components (sparklines, spectrogram thumbnails) driven from cached data.
- Developer documentation in `/docs` detailing cache schema, calculator API, and integration examples.

### Implementation Notes

- Default binding presets infer common feature-channel mappings (e.g., volume indicator auto-selects `rms`).
- Ensure calculator plug-ins can supply metadata (display name, parameter controls) consumed by the inspector.
- Link finalized documentation back to this plan for traceability.

### Verification

- UX acceptance walkthrough validating end-to-end authoring flow from audio import to binding and export.
- Accessibility audit (focus order, ARIA labeling) for new inspector controls.
- Documentation review ensuring examples compile and align with shipped API signatures.
- Regression tests for calculator metadata serialization/deserialization through project save/load.

## Rollout & Monitoring

- Stage feature caches behind a feature flag toggled per-project until performance and UX stabilize.
- Instrument logging for analysis durations, calculator failures, and cache size metrics.
- Gather beta feedback from power users focusing on plug-in calculator extensibility and scene binding workflows.

## Risks & Mitigations

- **Tempo Mutations Post-Analysis:** Implement automatic cache invalidation and queued recalculation; warn users if recalculation is pending.
- **Large Cache Payloads:** Compress spectrogram tracks (e.g., delta encoding + gzip) and allow calculator-specific storage optimizations.
- **Third-Party Calculator Stability:** Require versioned manifests and sandboxed execution (workers) to isolate failures; provide fallbacks to disable faulty calculators without corrupting cache state.

## Exit Criteria

- All built-in features (spectrogram, volume, oscilloscope) and at least one plug-in calculator operate through the shared cache pipeline with tick-accurate alignment.
- Automated and manual verification steps above complete without regressions in existing MIDI workflows.
- Documentation published and cross-referenced from relevant `/docs` implementation guides.
