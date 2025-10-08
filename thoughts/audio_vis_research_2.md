# Audio Visualization Research Notes (Precomputed Analysis Focus)

**Status:** Implementation roadmap drafted (2025-02-16).

## Context Recap

-   Audio-reactive visuals should coexist with existing MIDI-driven scene bindings so creators can add spectrograms, volume meters, or oscilloscopes without learning a new workflow.
-   The timeline currently normalizes all temporal data into canonical ticks and caches parsed MIDI per track through `ingestMidiToCache`, which also derives per-note seconds for UI affordances (see `src/state/timelineStore.ts`).
-   Scene content bounds and auto-adjust behaviors rely on the cached MIDI note envelopes and audio clip metadata, so any new audio feature caches must participate in the same bookkeeping (see `src/state/timeline/timelineShared.ts`).

## MIDI Handling Deep Dive

### Ingestion & Caching

-   MIDI sources are ingested either from an uploaded file or an in-memory payload. `buildNotesFromMIDI` normalizes PPQ to the canonical resolution before the store caches `notesRaw` (see `src/state/timeline/commands/addTrackCommand.ts`).
-   `ingestMidiToCache` enriches every note with seconds metadata (`startTime`, `endTime`) using the current tempo context, ensuring UI layers that expect seconds stay synchronized while ticks remain authoritative (`src/state/timelineStore.ts`).
-   After caching, the store triggers `autoAdjustSceneRangeIfNeeded`, which inspects all track caches to adjust scene bounds; this guarantees new audio feature tracks must integrate with the same auto-range heuristics (`src/state/timelineStore.ts`, `src/state/timeline/timelineShared.ts`).

### Track-Level Contract

-   Timeline tracks store offsets, optional regions, and references to cached sources (`midiSourceId`, `audioSourceId`). These IDs let the command gateway bundle cache payloads for undo/redo, keeping deterministic playback when commands replay (`src/state/timelineStore.ts`, `src/state/timeline/commands/addTrackCommand.ts`).
-   Content bounds calculations iterate cached MIDI notes (offset-adjusted) to determine start/end ticks for transports, exports, and auto zoom. Any precomputed analysis must expose similar metadata so these calculations remain accurate (`src/state/timeline/timelineShared.ts`).

## Precomputed Analysis Strategy

### Analysis Pipeline Overview

1. **Triggering Analysis**
    - Reuse the audio ingestion flow to kick off an offline analysis job (using `OfflineAudioContext`) when an audio buffer is imported or when the user requests re-analysis.
    - Capture timing metadata (sample rate, duration ticks) via the existing `createTimelineTimingContext` so cached feature frames align with tick-space expectations.
2. **Feature Extraction Targets**
    - **Spectrogram:** Short-time FFT magnitudes (e.g., 1024-bin window, 50% overlap) compressed into Bark or Mel bands to manage payload size.
    - **Volume Indicator:** RMS or peak envelope derived per analysis hop, quantized to UInt8 (0–255) for compact storage.
    - **Oscilloscope:** Downsampled waveform slices synchronized to feature hops; can reuse existing peak extractor infrastructure for efficient min/max pairs.
3. **Temporal Alignment**
    - Quantize analysis hops to either fixed millisecond steps convertible to ticks or directly to canonical tick subdivisions (e.g., 120 fps equivalent). Use `ticksToBeats`/`beatsToTicks` helpers to ensure mapping stays consistent with tempo changes.
4. **Cache Schema**
    - Introduce `audioFeatureCache` alongside existing `midiCache`/`audioCache`. Each entry stores:
        - `featureTracks`: map of feature names (`rms`, `bandEnergy[0..N]`, `waveformSegment`) to typed arrays.
        - `hopTicks`: integer step between frames.
        - `version` & `analysisParams` for invalidation.
        - Optional `waveform` reuse pointer referencing the audio cache to avoid duplication.
    - Persist caches for undo/redo by extending command payload packing similar to `AddTrackCommand` midi/audio cache serialization.

### Runtime Consumption Plan

-   Expose selectors/hooks mirroring `ingestMidiToCache` outputs: a runtime adapter can sample `featureTrackId` at the current tick, optionally applying interpolation.
-   Extend content-bound calculations to consider feature tracks when determining scene range—particularly for spectrogram-only elements where no MIDI notes exist.
-   Provide binding metadata referencing feature channels (e.g., `featureId`, `bandIndex`, smoothing options) so scene elements (spectrogram plane, volume bar, oscilloscope polyline) can query data consistently.

## Scene Integration Exploration

-   **Spectrogram Element:** GPU-friendly implementation using instanced quads or textures updated from precomputed magnitude arrays. Runtime uploads a time slice per frame based on playhead ticks; offline data avoids heavy FFT work during playback.
-   **Volume Indicator:** Bind RMS track to uniform driving bar height or bloom intensity. Similar to existing MIDI velocity bindings—needs normalization curve editing.
-   **Oscilloscope:** Render polyline or shader-based line strip using downsampled waveform segments keyed by tick. Precomputed waveform windows ensure deterministic export and match timeline zoom.
-   For authoring, inspector UI should mirror MIDI binding panels: user selects feature source (audio track), picks feature type (RMS, band, waveform), sets smoothing/response curve, and maps it to element properties.

## Phased Implementation Roadmap

### Phase 1 – Feature Cache Foundations

**Objectives**

- Introduce durable cache structures capable of storing waveform-derived features aligned to the canonical tick system.
- Ensure existing timeline commands can serialize/deserialize the new cache payloads for undo/redo and project persistence.

**Key Tasks**

- Define `AudioFeatureCache` TypeScript interfaces covering feature channels, hop duration in ticks, analysis parameters, and cache versioning.
- Extend `timelineStore` to track `audioFeatureTracks` keyed by audio source ID, with selectors for retrieving feature metadata.
- Update command payload packing (`addTrackCommand`, `timelineShared`) to include feature cache data during history operations.
- Document cache schema in `/docs` for future reference once stabilized.

**Dependencies**

- Alignment with existing `midiCache` and `audioCache` schemas to reuse validation and persistence utilities.

**Acceptance Criteria**

- Timeline state exposes a typed slice for audio feature caches that mirrors existing cache access patterns.
- Creating, undoing, and redoing an audio track preserves associated feature cache metadata without runtime errors.
- Project serialization/deserialization (including .mvt export/import) retains placeholder feature caches even before analysis runs.

### Phase 2 – Offline Analysis Pipeline

**Objectives**

- Generate precomputed FFT, RMS, and waveform data for audio tracks without impacting UI responsiveness.
- Normalize analysis results into the Phase 1 cache schema with consistent tick alignment.

**Key Tasks**

- Build an analysis module using `OfflineAudioContext` (or Node-based equivalent for server rendering) that computes spectrogram magnitudes, RMS envelopes, and downsampled waveform slices.
- Quantize analysis hops to tick units via `createTimelineTimingContext`, ensuring compatibility with tempo-adjusted playback.
- Implement analysis job orchestration (queueing, progress states, cancellation) and integrate with existing ingestion workflows.
- Persist analysis parameter signatures to trigger cache invalidation when audio source buffers, tempo maps, or pipeline settings change.

**Dependencies**

- Phase 1 cache schema and selectors.
- Access to audio decoding utilities used during ingest.

**Acceptance Criteria**

- Importing an audio file automatically generates feature caches containing FFT, RMS, and waveform data within acceptable processing time thresholds (target <10s for 3-minute track on baseline hardware).
- Re-ingesting or re-analyzing audio invalidates stale caches and repopulates them without manual state resets.
- Analysis completion updates cache status flags (`pending`, `ready`, `failed`) consumable by UI layers.

### Phase 3 – Runtime Consumption & Scene Binding

**Objectives**

- Make precomputed feature data accessible to scene elements in real time and during exports.
- Provide a binding surface that parallels existing MIDI-driven workflows.

**Key Tasks**

- Create selectors/utilities (e.g., `selectAudioFeatureFrame(state, sourceId, tick)`) that return interpolated feature values given a timeline tick.
- Extend scene binding schemas with `AudioFeatureBinding` types, including feature channel descriptors (RMS, band index, waveform segment) and smoothing configuration.
- Update runtime adapters to fetch feature data on each tick advance and feed it into render systems (e.g., instanced spectrogram quads, waveform polylines).
- Adjust content-bound calculations so feature-only tracks influence scene extents and auto-range logic.

**Dependencies**

- Phase 2 cache population to supply runtime data.
- Existing runtime adapters used for MIDI bindings.

**Acceptance Criteria**

- Scene elements bound to audio features respond deterministically to playback with no runtime FFT execution in the main thread.
- Exported renders (video/image sequences) match live preview outputs when driven solely by audio feature bindings.
- Content range calculations include feature tracks, preventing empty scenes when no MIDI notes are present.

### Phase 4 – Authoring Experience & QA Hardening

**Objectives**

- Deliver intuitive authoring tools for configuring waveform visualizations and ensure end-to-end reliability.

**Key Tasks**

- Add inspector UI to select an audio track, choose feature type (spectrogram, volume, waveform), and configure response curves or smoothing.
- Surface analysis job states (queued, running, failed) with retry affordances and background notifications.
- Provide preview thumbnails or lightweight sparkline renderers using cached data to aid element configuration.
- Expand automated tests (unit + integration) to cover tempo change invalidation, undo/redo flows, and export parity.
- Update documentation referencing final UX patterns and link to this research note.

**Dependencies**

- Phases 1–3 complete and stable.

**Acceptance Criteria**

- Authors can configure waveform, volume, and spectrogram elements end-to-end without referencing external tooling.
- Analysis failures surface actionable messaging and allow retry without page reloads.
- Automated test suite covers critical cache lifecycle and binding scenarios, and manual QA sign-off confirms parity between preview and export modes.
- Documentation in `/docs` reflects the shipped workflow and is cross-linked from this research note.

## Open Questions & Follow-Ups

-   How should feature caches respond to tempo edits after analysis? Need invalidation strategy similar to re-ingesting MIDI when tempo context shifts.
-   What serialization format best balances payload size vs. fidelity (JSON arrays vs. binary blobs in IndexedDB)?
-   Can the existing peak extractor be extended to generate oscilloscope-ready buffers to avoid duplicate work?

## Open question answers

-   Feature caches should invalidate and recalculate when tempo has been edited and a feature is requested, ensuring tick-to-time alignment remains accurate without manual cache resets.

## Recommendations

-   User should not need to select feature source, only the source track. The scene element should intelligently know what feature to extract from the source track (a volume indicator wouldn't need to know the FFT bins)
-   Investigate how features might be stored in the downloaded .mvt file.
