## 1. Executive Summary

Scene elements can now request **ad-hoc, inline overrides** for audio analysis profiles without first registering named variants. Provide partial profile parameters through `profileParams` on `AudioFeatureRequirement` and the runtime will merge the overrides with the base preset, hash the result deterministically, and publish the resolved descriptor. The implementation lives across:

-   `src/core/scene/elements/audioElementMetadata.ts` – exposes `profileParams` alongside existing requirement fields.
-   `src/audio/features/descriptorBuilder.ts` – merges overrides, hashes the canonical payload via `stableProfileHash`, and emits `profileOverridesHash` plus a `profileRegistryDelta` entry so downstream consumers see the resolved profile.
-   `src/audio/features/analysisProfileRegistry.ts` – sanitizes overrides (`sanitizeProfileOverrides`) and creates deterministic ad-hoc IDs (`buildAdhocProfileId`).

The rest of this doc captures how to use the system day-to-day and keeps the original implementation notes as historical context.

## 2. Quick Usage Guide

1. **Register feature requirements with inline overrides.** Call `registerFeatureRequirements` at module scope and add a `profileParams` object wherever you previously referenced a custom profile ID:

    ```ts
    import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';

    registerFeatureRequirements('audioAdhocProfile', [
        {
            feature: 'spectrogram',
            profileParams: {
                windowSize: 4096,
                hopSize: 1024,
                window: 'hann',
            },
        },
    ]);
    ```

    The overrides are type-checked against `AudioAnalysisProfileOverrides` (see
    `src/audio/features/audioFeatureTypes.ts`). Unsupported fields are ignored by `sanitizeProfileOverrides`, so this call site stays resilient.

2. **Sample features as usual.** `getFeatureData` and `syncElementFeatureIntents` automatically publish the merged profile information. Each descriptor now carries:

    - `analysisProfileId`: the synthetic `adhoc-<hash>` identifier returned by `buildAdhocProfileId`.
    - `profileOverrides`: the sanitized overrides used for hashing.
    - `profileOverridesHash`: a deterministic 64-bit FNV-1a digest produced by `stableProfileHash`.

    These fields let diagnostics and caches distinguish otherwise identical descriptors that only differ by override payload.

3. **Inspect ad-hoc payloads in tooling.** Diagnostics (see `src/state/audioDiagnosticsStore.ts`) persist both the hash and the merged descriptor in `profileRegistryDelta`. Panels can render the full profile by looking up the generated ID inside the delta map without touching global registries.

4. **Mind the guardrails.**

    - Overrides are best for a small, static set of variants. Binding `profileParams` to highly dynamic UI (sliders, animations) can explode cache size.
    - Sampling-only settings such as smoothing remain part of `AudioSamplingOptions` so they don’t affect cache identity.
    - You can still provide a named `profile` alongside overrides. The base profile ID is recorded in `requestedAnalysisProfileId` before hashing.

### Example: Demo element

`src/core/scene/elements/audio-adhoc-profile.ts` shows the full loop: registering `profileParams`, sampling via `getFeatureData`, and rendering the resolved descriptor name for debugging.
