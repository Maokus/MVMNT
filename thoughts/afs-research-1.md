# Audio feature system overview
Status: Draft (2024-02-15)

## Calculators and analysis pipeline
- Audio feature descriptors capture the analysis identity (feature key plus optional calculator or band index) while runtime sampling options (smoothing, interpolation) are kept separate so caches can be shared.【F:src/audio/features/audioFeatureTypes.ts†L20-L46】
- Calculator outputs are normalized `AudioFeatureTrack` records with consistent timing metadata, channel layout hints, analysis parameters, and optional profile identifiers, all of which are cached in the timeline store for reuse across elements.【F:src/audio/features/audioFeatureTypes.ts†L55-L140】
- The calculator registry retains per-feature defaults, invalidates existing caches when new calculators register, and exposes lookup/list APIs used throughout the system.【F:src/audio/features/audioFeatureRegistry.ts†L8-L79】
- Built-in calculators (spectrogram, pitch waveform, RMS, waveform) are instantiated with shared helpers (yield controller, mono mixdown, tempo projection) and auto-registered with the global registry; analysis requests then filter the active set before computing caches.【F:src/audio/features/audioFeatureAnalysis.ts†L560-L625】
- Each calculator focuses on a specific representation: RMS envelopes average squared amplitudes across hop windows, spectrograms run FFT slices with Hann windows and log-scaling, and waveform calculators oversample mono audio into min/max spans for visualization.【F:src/audio/features/calculators/rmsCalculator.ts†L21-L85】【F:src/audio/features/calculators/spectrogramCalculator.ts†L26-L125】【F:src/audio/features/calculators/waveformCalculator.ts†L24-L112】

### Potential confusion
- Calculators default to the `'default'` analysis profile and rely on injected helpers for serialization/deserialization—mismatching helper implementations or forgetting to update the registry defaults when swapping calculators can silently invalidate caches via the registry’s invalidation hook.【F:src/audio/features/audioFeatureRegistry.ts†L16-L31】【F:src/audio/features/calculators/waveformCalculator.ts†L83-L112】 
- `AudioFeatureAnalysis` registers built-ins lazily; invoking custom analysis without calling `registerBuiltInAudioFeatureCalculators` (directly or indirectly) yields “no calculators registered” errors even though the modules exist.【F:src/audio/features/audioFeatureAnalysis.ts†L596-L624】

## Scene integration
- Scene element modules declare their audio requirements (feature key, optional calculator/profile overrides) up front so the runtime can publish the correct subscriptions automatically.【F:src/core/scene/elements/audioElementMetadata.ts†L5-L43】
- The scene API builds descriptors (merging defaults from the registry), tracks element subscriptions per object, and publishes or clears analysis intents when track bindings change; sampling requests return values plus channel metadata from the cache.【F:src/audio/features/sceneApi.ts†L93-L395】
- Practical usage can be seen in `AudioWaveformElement`, which requests waveform data, samples cache ranges via the timeline store, and renders based on cached payloads and smoothing options.【F:src/core/scene/elements/audio-waveform.ts†L9-L318】

### Potential confusion
- The scene API still accepts legacy signatures (e.g., smoothing inside descriptor options) and silently rewrites them; mixed usage can hide bugs where smoothing is unintentionally dropped or double-applied.【F:src/audio/features/sceneApi.ts†L153-L199】
- Descriptor IDs and match keys are identical strings but used for different map lookups; conflating them makes it easy to mis-handle profile-specific cache keys in diagnostics or custom tooling.【F:src/audio/features/analysisIntents.ts†L58-L142】【F:src/audio/features/audioDiagnosticsStore.ts†L117-L213】
- Element subscription state is keyed by the element object via a `WeakMap`; supplying transient POJOs instead of stable scene instances will repeatedly churn intents and can starve caches.【F:src/audio/features/sceneApi.ts†L59-L139】

## Diagnostics and cache coordination
- The audio diagnostics store mirrors published intents, computes per-track cache diffs (missing, stale, extraneous, bad requests), and tracks regeneration jobs with history and dismissal preferences.【F:src/state/audioDiagnosticsStore.ts†L19-L834】
- Diagnostics subscribe to the analysis intent bus and timeline store; any cache/status change triggers a recomputation so the UI stays aligned with background analysis jobs.【F:src/state/audioDiagnosticsStore.ts†L842-L876】
- Regeneration queues deduplicate descriptor requests, map them back to calculators or full reanalysis, and log the outcome for later review.【F:src/state/audioDiagnosticsStore.ts†L618-L839】

### Potential confusion
- Cache diffs group requests by `(trackRef, profile)` but resolve caches by `audioSourceId`; failing to keep track IDs and source IDs aligned (especially when audio tracks proxy shared sources) can mark valid caches as extraneous or missing.【F:src/state/audioDiagnosticsStore.ts†L150-L705】
- Dismissed extraneous descriptors are stored separately per profile; forgetting to clear these sets when element requirements change can hide legitimate issues until the dismissal is removed manually.【F:src/state/audioDiagnosticsStore.ts†L706-L735】
- Diagnostics rely on the calculator registry to validate descriptors; adding calculators without registering them leaves descriptors flagged as “bad request,” even though the feature key exists in code.【F:src/state/audioDiagnosticsStore.ts†L214-L399】

## Interfaces between subsystems
1. **Scene elements → Scene API → Analysis intents:** Elements request descriptors through `getFeatureData`, which updates per-element state and publishes intents on the shared bus for diagnostics and analysis coordination.【F:src/audio/features/sceneApi.ts†L211-L353】
2. **Analysis intents → Diagnostics store:** The diagnostics store listens to the bus, snapshots requirements, and compares requested descriptors to actual cache contents while surfacing requirement mismatches.【F:src/state/audioDiagnosticsStore.ts†L19-L399】【F:src/state/audioDiagnosticsStore.ts†L842-L892】
3. **Calculators/registry → Timeline cache:** Registered calculators feed the audio analysis pipeline, populating cache entries consumed by selectors such as `sampleAudioFeatureRange` used by rendering elements.【F:src/audio/features/audioFeatureAnalysis.ts†L560-L640】【F:src/core/scene/elements/audio-waveform.ts†L250-L318】
4. **Diagnostics → Timeline actions:** When cache diffs identify gaps, regeneration jobs call back into timeline actions to re-run calculators or purge extraneous tracks, closing the loop between UI, diagnostics, and analysis infrastructure.【F:src/state/audioDiagnosticsStore.ts†L618-L839】

## Follow-up ideas
- Audit third-party callers of `getFeatureData` to ensure the legacy smoothing signature is no longer used so the warning can eventually be removed.【F:src/audio/features/sceneApi.ts†L153-L199】
- Document the expectation that new calculators must register themselves (or be added to `ensureCalculatorsRegistered`) to keep diagnostics from flagging them as unknown.【F:src/audio/features/audioFeatureAnalysis.ts†L560-L624】【F:src/state/audioDiagnosticsStore.ts†L214-L399】
