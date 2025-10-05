# Audio Visualization Research Notes (Precomputed Analysis Focus)

**Status:** Drafting implementation approach (2025-02-16).

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

## High-Level Implementation Plan

1. **Data Model Extension**
    - Add `audioFeatureTracks` store slice adjacent to `midiCache`/`audioCache`, keyed by audio source ID.
    - Define TypeScript types for feature frames, hop sizes, and channel descriptors.
    - Update timeline commands and undo payloads to persist feature caches.
2. **Analysis Worker**
    - Build an offline analysis module leveraging `OfflineAudioContext`. Pipeline: decode buffer → segment into hops → compute FFT/RMS → quantize/serialize.
    - Consider Web Worker or Worklet to avoid blocking UI during long analyses.
3. **Selector & Binding Surface**
    - Introduce selectors like `selectAudioFeatureFrame(state, sourceId, tick)` returning interpolated values.
    - Extend scene binding schema with `AudioFeatureBinding` referencing feature tracks and channels.
4. **Runtime Adapter Enhancements**
    - Update scene runtime to subscribe to feature tracks and hydrate elements with relevant time slices.
    - Implement sampling utilities converting current tick to feature frame index (`frame = floor((tick - offset) / hopTicks)`).
5. **UI/UX Additions**
    - Create analysis status indicators (pending, failed, stale).
    - Provide inspector widgets for spectrogram/volume/oscilloscope bindings, including preview thumbnails sourced from cached data.
6. **Testing & Validation**
    - Unit tests: verify hop alignment with tempo changes; ensure undo/redo preserves caches.
    - Integration tests: confirm runtime sampling yields deterministic outputs compared to offline computations.

## Open Questions & Follow-Ups

-   How should feature caches respond to tempo edits after analysis? Need invalidation strategy similar to re-ingesting MIDI when tempo context shifts.
-   What serialization format best balances payload size vs. fidelity (JSON arrays vs. binary blobs in IndexedDB)?
-   Can the existing peak extractor be extended to generate oscilloscope-ready buffers to avoid duplicate work?

## Open question answers

## Recommendations

-   User should not need to select feature source, only the source track. The scene element should intelligently know what feature to extract from the source track (a volume indicator wouldn't need to know the FFT bins)
-   Investigate how
