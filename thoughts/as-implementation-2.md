# Audio Cache Simplification Implementation Plan v2

_Status: Planning_

This plan refines the original [Audio Cache Simplification Implementation Plan](./as-implementation-1.md) by advocating for a more direct refactoring approach. Instead of creating temporary shims and compatibility layers, this plan prioritizes immediate migration of the codebase to the new, simplified APIs. This will reduce complexity and avoid the overhead of maintaining transitional code.

## Revised Implementation Roadmap

### 1. Unify Channel Identifiers Directly

The goal is to replace `channelIndex` and `channelAlias` with a single `channel` field in `AudioFeatureDescriptor`. We will achieve this by directly modifying all dependencies.

-   **Update `AudioFeatureDescriptor`**: In `src/audio/features/audioFeatureTypes.ts`, modify the `AudioFeatureDescriptor` interface to use a single `channel: number | string | null` field, and remove `channelIndex` and `channelAlias`.

-   **Refactor Dependent Logic**:
    -   `src/audio/features/analysisIntents.ts`: Update `buildDescriptorId` and `buildDescriptorMatchKey` to use the new `channel` field.
    -   `src/core/scene/elements/audioFeatureUtils.ts`: Refactor `resolveChannelIndexFromDescriptor` into a new `resolveChannel` function that handles both numeric and string channel identifiers. Update `buildSampleCacheKey` and `sampleFeatureFrame` to use the new `channel` field.
    -   `src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx`: Modify the component to work with the unified `channel` field. This will involve updating how channel selections are managed and how descriptors are created and updated.
    -   `src/state/audioDiagnosticsStore.ts`: Update `collectCachedDescriptorInfos` to work with the new descriptor format.

### 2. Consolidate Descriptor Creation and Normalization

Instead of just centralizing defaults, we will create a single, authoritative function for creating and normalizing `AudioFeatureDescriptor` objects.

-   **Create `createFeatureDescriptor`**: In `src/audio/features/audioFeatureTypes.ts`, introduce a builder function `createFeatureDescriptor(options)`. This function will handle all logic for creating descriptors, including setting defaults from the feature registry.

-   **Eliminate `coerceFeatureDescriptor`**: Remove `coerceFeatureDescriptor` and `coerceFeatureDescriptors` from `src/core/scene/elements/audioFeatureUtils.ts` and replace all usages with the new `createFeatureDescriptor` builder. This will enforce the new, simplified descriptor creation pattern across the codebase.

### 3. Implement a Clean Scene Consumption API

We will proceed with creating a façade module, but with a clear mandate to replace, not just supplement, the old methods of interacting with the audio feature system.

-   **Create Façade Module**: Create a new module, for example at `src/audio/features/sceneApi.ts`, which will export:

    -   `requestFeatures(element, trackRef, descriptors)`: A function that handles publishing analysis intents.
    -   `useFeatureSample(trackId, descriptor, time)`: A React hook that provides feature samples and automatically manages analysis intents and component lifecycle.

-   **Migrate Scene Elements**: Refactor all scene elements (`audio-spectrum`, `audio-oscilloscope`, `audio-volume-meter`, etc.) to exclusively use the new `sceneApi`. This will involve removing all direct calls to `publishAnalysisIntent`, `clearAnalysisIntent`, and manual descriptor manipulation.

### 4. Execute a One-Time State and Configuration Migration

To avoid long-term compatibility shims, we will perform a one-time migration of all persisted state and configurations.

-   **Migration Utility**: Create a migration script or utility within the persistence layer (`src/persistence`) that can read the old `AudioFeatureDescriptor` format and convert it to the new format.

-   **State Hydration**: In `src/state/sceneStore.ts`, integrate the migration utility into the state hydration process. When the application loads, any legacy descriptors in the persisted state will be automatically migrated to the new format in memory before being used by the application. The state will then be persisted in the new format.

-   **Update Tests**: Update all relevant tests, especially those for `AudioFeatureDescriptorInput`, to reflect the new API and data structures. Remove tests for legacy behavior.

-   **Update Documentation**: Revise `docs/audio/audio-cache-system.md` to describe the new, simplified workflow. Remove documentation related to the old APIs.

## Acceptance Criteria

1.  The `AudioFeatureDescriptor` interface contains only the `channel` field for channel identification. `channelIndex` and `channelAlias` are completely removed from the codebase.
2.  All scene elements use the new `sceneApi` for audio feature consumption. Direct calls to the analysis intent bus are eliminated from scene elements.
3.  Persisted scenes with the old descriptor format are successfully migrated to the new format upon loading.
4.  Developer documentation is updated to reflect the new, simplified APIs and workflows.
