# Cache System Strengths and Limitations

## Strengths

- **Single source of truth for analyzed data.** The cache pipeline analyzes audio buffers, aligns frames to the tempo map, and exposes consistent feature tracks for every scene element, so renderers pull from deterministic data rather than recomputing per frame.【F:docs/audio/audio-cache-system.md†L5-L24】
- **Shared ownership and deduplication.** Timeline state persists cache payloads, tracks status, and deduplicates descriptor requests through the analysis intent bus, eliminating redundant analyses when multiple surfaces need the same features.【F:docs/audio/audio-cache-system.md†L41-L75】【F:docs/audio/audio-cache-system.md†L101-L133】
- **Separation of analysis and presentation.** Feature descriptors describe analysis identity while sampling options tune smoothing or interpolation at render time, letting elements experiment visually without fragmenting caches.【F:docs/audio/audio-cache-system.md†L47-L120】【F:docs/audio/concepts.md†L9-L28】
- **Channel-aware routing.** Channel aliases stored with each feature track let descriptors target semantic channels such as `Left`, `Right`, `Mid`, or `Side` without guessing array indices, and runtime helpers normalize user input before sampling.【F:docs/audio/audio-cache-system.md†L77-L128】【F:src/audio/features/channelResolution.ts†L1-L104】
- **Tempo-aligned sampling utilities.** `getFeatureData` and `sampleFeatureFrame` convert playback time to ticks, fetch tempo-aware frames, cache recent samples, and record diagnostics automatically, so element code stays focused on presentation logic.【F:src/audio/features/sceneApi.ts†L197-L278】【F:src/core/scene/elements/audioFeatureUtils.ts†L21-L177】
- **Versioned, profile-aware payloads.** Feature tracks retain calculator ids, versions, analysis parameters, and optional profiles, enabling cache reuse across exports while still invalidating when algorithms change.【F:docs/audio/audio-cache-system.md†L77-L166】

## Limitations

- **Reanalysis required after tempo or calculator changes.** Tempo map edits or calculator version bumps mark caches as `stale`, forcing a full reanalysis before fresh data is available, which can delay playback-ready visuals on large projects.【F:docs/audio/audio-cache-system.md†L346-L376】【F:src/state/timelineStore.ts†L1013-L1043】
- **Sequential analysis throughput.** The scheduler processes calculators sequentially per source to prevent race conditions, but long-running jobs block later requests until the queue clears.【F:docs/audio/audio-cache-system.md†L41-L45】
- **In-memory sampling cache budget.** Runtime sampling caches only retain 128 entries per feature track; bursts of random seeks will evict older samples and trigger additional adapter work.【F:src/core/scene/elements/audioFeatureUtils.ts†L16-L176】
- **Channel alias reliance.** Descriptors using semantic channels depend on aliases embedded in the analysis payload; unknown aliases throw resolution errors, so imported material lacking alias metadata must fall back to numeric indices.【F:src/audio/features/channelResolution.ts†L54-L104】
- **Analysis prerequisites.** Scene elements receive `null` until ingest finishes, and ingest errors (missing buffers, unsupported cache versions) require manual recovery steps from the timeline store before analysis can resume.【F:docs/audio/audio-cache-system.md†L57-L75】【F:src/state/timelineStore.ts†L880-L1100】

## Walkthrough: Stereo Waveform Display

1. **Declare feature requirements.** Register the element with `registerFeatureRequirements`, requesting the waveform feature twice—once per channel—so the intent bus schedules min/max peak extraction for the bound track.【F:docs/audio/audio-cache-system.md†L261-L287】【F:docs/audio/audio-cache-system.md†L160-L166】
2. **Sample per frame with channel selectors.** In `_buildRenderObjects`, call `getFeatureData(this, trackId, { feature: 'waveform', channel: 'Left' }, time)` (and `'Right'`). `getFeatureData` resolves aliases, handles subscriptions, and returns tempo-aligned min/max pairs for the current frame.【F:src/audio/features/sceneApi.ts†L197-L278】【F:src/audio/features/channelResolution.ts†L37-L104】
3. **Render using min/max envelopes.** Each sample contains `values[0]`/`values[1]` for the channel’s minimum and maximum, so build vertical bars or polyline meshes from the buffered envelope without resampling the audio buffer yourself.【F:docs/audio/audio-cache-system.md†L160-L166】【F:src/audio/features/tempoAlignedViewAdapter.ts†L188-L217】
4. **Handle loading and fallbacks.** Return an empty render list while `getFeatureData` yields `null`, and surface cache status to users via inspector diagnostics so they can restart analysis if waveform extraction failed.【F:docs/audio/audio-cache-system.md†L57-L75】【F:src/core/scene/elements/audioFeatureUtils.ts†L112-L176】

## Walkthrough: Mid/Side Spectrum Display

1. **Request spectrogram data with aliases.** Register feature requirements for the spectrogram feature, specifying `channel: 'Mid'` and `channel: 'Side'` so the cache scheduler produces both channels if available. Built-in alias handling maps these names to channel indices or throws early if unsupported.【F:docs/audio/audio-cache-system.md†L115-L132】【F:src/audio/features/channelResolution.ts†L37-L104】
2. **Sample with presentation options.** During render, call `getFeatureData` for each descriptor at the current time, passing smoothing or interpolation preferences (e.g., `{ smoothing: 2, interpolation: 'linear' }`) to stabilize magnitude gradients without changing cache identity.【F:src/audio/features/sceneApi.ts†L197-L278】【F:docs/audio/concepts.md†L9-L28】
3. **Map frequency bins to visuals.** Each sample exposes tempo-aligned magnitudes in `values`, indexed per frequency bin. Use the shared hop metadata to position bins in time, and apply mid/side-specific color palettes or scaling before drawing bars or heatmaps.【F:docs/audio/audio-cache-system.md†L144-L166】【F:src/audio/features/tempoAlignedViewAdapter.ts†L142-L217】
4. **Detect unsupported material.** If `getFeatureData` returns `null`, inspect the timeline’s cache status or diagnostics to confirm the track exposes mid/side channels; fall back to mono (`channel: null`) or stereo (`'Left'`/`'Right'`) descriptors when aliases are missing.【F:docs/audio/audio-cache-system.md†L57-L86】【F:src/core/scene/elements/audioFeatureUtils.ts†L112-L176】
