# Audio Analysis Profile Usage Reference

_Status: Reference_

## Purpose of Profiles

Audio analysis profiles capture reusable parameter sets—such as window size, hop size, FFT configuration, and smoothing—that control how calculators analyze buffers. They are stored alongside caches so downstream consumers can trade off performance and fidelity without regenerating data blindly.【F:docs/audio/audio-cache-system.md†L80-L99】【F:src/audio/features/audioFeatureTypes.ts†L90-L139】 Each `AudioFeatureTrack` records the profile that generated it, allowing renderers to correlate samples with the exact analysis recipe that produced them.【F:src/audio/features/audioFeatureTypes.ts†L60-L88】 The registry exposes a canonical `default` profile identifier, ensuring callers always have a stable fallback when no explicit profile is supplied.【F:src/audio/features/audioFeatureRegistry.ts†L8-L86】

## Where Profiles Are Used

### Cache Metadata and Sampling
- Caches persist the full catalog of available profiles per audio source along with the default selection, so UI components can populate pickers and downstream code can pick compatible tracks.【F:src/audio/features/audioFeatureTypes.ts†L117-L139】【F:src/workspace/form/inputs/AudioAnalysisProfileSelect.tsx†L47-L109】
- When elements request feature data, the scene API aggregates descriptor requests, infers the shared profile, and publishes analysis intents that carry the resolved profile id. This keeps cache generation and invalidation scoped to the exact profile consumers need.【F:src/audio/features/sceneApi.ts†L93-L150】【F:src/audio/features/analysisIntents.ts†L82-L161】

### Descriptor Construction and Requirements
- Descriptor builders sanitize caller input and fall back to the registry’s default profile whenever none is supplied, preventing empty bindings from spawning profile-less requests.【F:src/audio/features/descriptorBuilder.ts†L1-L100】
- Element requirements can opt into non-default profiles, and subscription sync deduplicates descriptors while remembering the first explicit profile so a single intent covers all required features.【F:src/core/scene/elements/audioElementMetadata.ts†L1-L64】【F:src/audio/features/subscriptionSync.ts†L21-L66】

### Scene Bindings, Diagnostics, and Tooling
- Scene bindings that reference audio descriptors automatically gain a constant `default` profile binding when none is present, preserving compatibility with caches generated before profile-aware tooling shipped.【F:src/state/sceneStore.ts†L348-L420】
- Diagnostics group cache requests by track and profile, making it clear which profile variants are stale, pending, or redundant during analysis workflows.【F:src/state/audioDiagnosticsStore.ts†L240-L339】
- The property inspector’s `AudioAnalysisProfileSelect` control reads the cache’s profile catalog and surfaces default-versus-custom choices so authors can align element bindings with available variants.【F:src/workspace/form/inputs/AudioAnalysisProfileSelect.tsx†L47-L109】

## How to Specify or Edit a Profile

1. **During requirement registration:** Provide a `profile` on `AudioFeatureRequirement` entries to request a specific cache variant whenever the element is instantiated. The odd-profile example forces the `spectrogram` calculator to use an alternate profile to validate cache handling paths.【F:src/core/scene/elements/audioElementMetadata.ts†L1-L64】【F:src/core/scene/elements/audio-odd-profile.ts†L7-L105】
2. **When sampling features directly:** Pass `{ profile: 'profileId' }` through the scene API helpers (e.g., `getFeatureData`) to override the default profile at read time. The API merges repeated requests and publishes intents with the supplied profile so caches stay in sync.【F:src/audio/features/sceneApi.ts†L93-L150】
3. **Via editor bindings:** Use the inspector select control to persist a profile identifier on an element’s bindings. Behind the scenes the binding becomes a constant `analysisProfileId`, which subsequent renders and exports reuse.【F:src/workspace/form/inputs/AudioAnalysisProfileSelect.tsx†L47-L109】【F:src/state/sceneStore.ts†L348-L420】

## When to Create or Modify Profiles

Developers introduce or tweak profiles when calculators need alternative analysis parameters—for example, higher-resolution FFTs for detailed spectrograms, or smaller windows for responsive meters. Because profiles are stored in caches and referenced by intents, changing a profile definition gives the scheduler a precise signal to regenerate only the affected variants instead of all cached data.【F:docs/audio/audio-cache-system.md†L80-L99】【F:src/state/audioDiagnosticsStore.ts†L240-L339】 The odd-profile validation element demonstrates how non-default profiles ensure cache plumbing accounts for variant-specific data flows.【F:src/core/scene/elements/audio-odd-profile.ts†L7-L105】 Keep documentation in `/docs/audio` aligned with any new or renamed profiles so editor guidance and glossary links remain accurate.【F:docs/audio/audio-cache-system.md†L80-L139】

## Open Questions

_None identified in this pass._

## Related References

- [Audio Cache System](../docs/audio/audio-cache-system.md)
- [Audio Concepts Overview](../docs/audio/concepts.md)
- [Audio Feature Bindings (glossary target referenced by the inspector)](../docs/audio-feature-bindings.md)
