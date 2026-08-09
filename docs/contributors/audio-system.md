# Audio system

## Ownership model

Timeline tracks and clips own placement, gain, mute state, and immutable source IDs. `audioCache`
entries own decoded `AudioBuffer` data, waveform metadata, and references to original imported
bytes. Feature caches are keyed by source and analysis profile so clips can reuse analysis without
duplicating work.

Original bytes and decoded PCM are separate resources. Small originals may remain inline; large
ones use `AudioAssetStore` in IndexedDB. A process-local memory fallback keeps the current session
usable when IndexedDB fails, but cross-session durability comes from saving the project.

## Residency and persistence

If decoded PCM is absent, rehydration reads inline bytes or the stored asset ID and decodes them.
Missing bytes mark the source failed rather than crashing the editor. Import and export validate
asset lengths and hashes.

Export collects only referenced sources, preferring original bytes and falling back to generated
float32 WAV data. Content hashes deduplicate package assets. Waveforms and optional feature caches
are packaged separately.

## Feature analysis

Registered calculators transform decoded PCM into feature tracks such as spectrogram, RMS,
waveform, peaks, and pitch guidance. A track records its calculator/version, frame layout, hop
duration, analysis profile, format, and channel metadata.

Requirements from active element definitions and instances flow through the analysis intent bus.
The subscription controller deduplicates equivalent requests and keeps track references in sync as
clips or bindings change. The scheduler runs required calculators, reports progress, supports
cancellation, and merges completed tracks into caches.

Feature cache status is `idle`, `pending`, `ready`, `failed`, or `stale`. Calculator-version,
profile, source, or tempo-projection changes can invalidate cached tracks. The diagnostics store
owns user-facing status and reanalysis actions.

## Sampling

Descriptors identify analyzed data; interpolation and smoothing are runtime sampling options and do
not change cache identity. Sampling resolves the enabled clip under the requested timeline time,
maps it into source time, and returns silence in gaps. Feature and raw PCM reads are pre-fader.

Internal elements may use the scene audio utilities directly. External plugins use only the scoped
SDK audio facet described in the [plugin audio guide](../plugin-api/audio.md).

## Maintenance rules

- Increment a calculator version when its algorithm or output contract changes.
- Keep feature keys namespaced when they are not built-in standards.
- Report progress and honor the provided abort signal in long calculations.
- Do not expose cache instances, mutable typed arrays, or timeline store objects through plugin APIs.
- Cover analysis, serialization, tempo alignment, cancellation, and source residency changes with
  focused tests under `src/audio/` and `src/state/`.
