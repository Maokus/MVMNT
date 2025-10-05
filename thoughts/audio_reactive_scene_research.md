# Audio-Reactive Scene Elements Research

**Status:** Investigating feasibility and implementation paths (2025-02-15).

## Motivation

-   Extend existing MIDI-driven scene elements with visuals that respond to arbitrary audio sources (rendered mixdown, live input, or imported stems).
-   Maintain parity with current scene workflows so creators can swap between MIDI and audio triggers without learning a new tooling surface.

## Feasibility Summary

-   **Core web capability:** Modern browsers expose Web Audio API primitives (e.g., `AnalyserNode`, `AudioWorklet`, `OfflineAudioContext`) that can derive real-time amplitude/frequency data with low latency.
-   **Performance considerations:** Lightweight FFT (2048–4096 bins) and RMS calculations are viable in main thread for up to ~60fps visual updates. Heavier feature extraction (beat detection, onset classification) benefits from `AudioWorklet` or WebAssembly helpers to stay below the frame budget.
-   **Determinism:** For exports and replay stability, precomputed analysis (per-buffer feature tracks) can be cached similarly to how MIDI note caches feed visual bindings today.
-   **Integration with scene architecture:** The normalized store described in [Scene Store Architecture](../docs/SCENE_STORE.md) can model audio feature bindings as a new signal source type alongside existing MIDI bindings, preserving command gateway flow and undo semantics.

Overall, shipping audio-reactive elements is feasible with incremental platform work: capture/ingest audio, derive features on an analysis timeline, and expose them through bindings compatible with the existing scene runtime.

## Implementation Approaches

### 1. Real-Time Analysis Pipeline

-   **Sources:**
    -   Transport-coupled playback of an imported audio asset (same clock as MIDI tracks).
-   **Processing graph:**
    1. Route `AudioNode` source through shared `AudioContext` (reuse transport unlocking logic from synth audition work).
    2. Fan-out to:
        - `AnalyserNode` for FFT magnitude arrays (spectral bars, peak tracking).
        - Scripted RMS envelope (time-domain energy) for waveform-driven animations.
        - Optional beat/onset detector running inside an `AudioWorkletNode` for tempo-synced triggers.
    3. Publish reduced feature vectors into a lightweight shared buffer (e.g., `SharedArrayBuffer` guarded by feature flags) or schedule updates via requestAnimationFrame callbacks.
-   **Binding layer:**
    -   Introduce `AudioFeatureBinding` records that map named features (`"band[0]"`, `"rms"`, `"onset"`) to scene element properties.
    -   Mirror the MIDI binding infrastructure so the runtime adapter can drive element uniforms/props with normalized feature values in the `[0,1]` range.
-   **Pros:** Minimal preprocessing; reacts to live improvisation. Enables VJ-style workflows.
-   **Cons:** Export determinism depends on stable sampling; long sessions may drift unless audio clock is tightly synced with tick domain.

### 2. Precomputed Analysis Tracks

-   **Workflow:**
    1. On audio import, run `OfflineAudioContext` analysis to extract per-frame features (RMS, spectral centroid, Bark-band energy, onsets) at the project frame rate or tick-aligned grid.
    2. Persist results as timeline-aligned arrays (e.g., per 10ms or per 1/PPQ tick) stored in a new `audioFeatureCache` akin to MIDI note caches.
    3. Bind scene properties to these cached tracks; playback simply samples by tick, ensuring deterministic exports and undo-friendly state.
-   **Storage:**
    -   Keep raw arrays in IndexedDB or compressed JSON within document exports. Consider quantization (UInt8) to minimize payload.
    -   Add metadata (sample rate, hop size, feature names) so runtime knows how to interpolate.
-   **Pros:** Deterministic renders, cheap runtime updates, export-ready.
-   **Cons:** Upfront preprocessing cost (seconds per minute of audio) and increased document size. Live input requires a "record analysis" step before it can drive visuals.

### 3. Hybrid Strategy

-   Cache baseline features offline, but allow optional live modifiers (e.g., mic-driven intensity overriding cached RMS). This mirrors how MIDI elements can receive live controller overrides while retaining deterministic note streams.

## Data & State Modeling

-   Extend scene bindings:
    -   `binding.type: 'midi' | 'audioFeature'` (or add `source` field that references a signal registry).
    -   `audioFeature` payload includes `featureTrackId`, `channel` (e.g., frequency band), scaling curves, and smoothing constants.
-   Introduce `audioFeatureTracks` in a dedicated store slice managed alongside scene state or a sibling store, feeding the runtime adapter.
-   Align with the tick-based time domain described in [Time Domain Architecture](../docs/TIME_DOMAIN.md) by sampling features at canonical PPQ multiples to reuse conversion helpers.
-   Command gateway updates:
    -   New commands for creating/removing feature tracks, binding scene properties, and refreshing analysis.
    -   Hook into undo middleware identically to existing scene commands for parity.

## Runtime Integration

-   Scene runtime adapter subscribes to both MIDI and audio feature sources, resolving bindings per frame.
-   Rendering loop obtains current tick → seconds → audio buffer index. For real-time pipelines, maintain a ring buffer keyed by `AudioContext.currentTime` and interpolate to the requested tick.
-   Provide throttled selectors (e.g., `useAudioFeature(featureId, smoothing)`) for editor UI previews without overwhelming React components.

## Tooling & UX Considerations

-   **Calibration UI:** Visual meters to help users set gain/threshold when using external audio.
-   **Analysis inspector:** Display waveforms/spectrogram overlays, allow selecting bands or derived metrics when configuring a binding.
-   **Fallback behavior:** If audio permissions are denied or buffers are missing, gracefully disable bindings and surface warnings in the inspector.
-   **Testing:** Add fixtures covering deterministic playback by snapshotting feature arrays and validating runtime interpolation.

## Open Questions

-   How should audio feature tracks be stored inside documents to balance size and precision? (Quantized arrays vs. compressed binary attachments.)
-   What export pipeline changes are required so offline renders can reproduce real-time audio-reactive animations when live input is involved?
-   Do we need tempo alignment (warp markers) to lock external audio to the tick grid, or is free-running analysis acceptable for VJ cases?
-   Which baseline feature set is essential for v1 (RMS, spectral energy bands, onset) versus nice-to-have (mel-frequency cepstral coefficients, pitch detection)?

## Next Steps

1. Prototype a standalone Web Audio analysis module that mirrors transport control (play, pause, seek) and emits normalized feature envelopes.
2. Design the `AudioFeatureBinding` schema and update the scene command gateway contract to accept new binding types.
3. Spike an offline analysis worker using `OfflineAudioContext` to benchmark preprocessing time and storage footprint for a 3-minute track.
4. Draft UI wireframes for the binding inspector, ensuring parity with existing MIDI binding UX.
5. Decide on synchronization guarantees (tick-locked vs. free-running) and document them alongside the runtime adapter contract.

## References & Related Work

-   [Scene Store Architecture](../docs/SCENE_STORE.md)
-   [Time Domain Architecture](../docs/TIME_DOMAIN.md)
-   Web Audio API specifications: `AnalyserNode`, `AudioWorklet`, `OfflineAudioContext` (MDN docs).
-   VJ tooling precedent: TouchDesigner audio analysis CHOPs, Resolume FFT/audio FFT effects, which map band energy to visual parameters.
