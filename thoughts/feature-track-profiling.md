# Plan for multi-profile feature track caching

This document outlines the plan to fix an issue where different analysis profiles for the same audio feature overwrite each other in the cache.

## 1. The Problem

The current implementation uses the `featureKey` (e.g., "spectrogram") as the unique identifier for feature tracks in the `AudioFeatureCache`. This prevents the system from caching multiple versions of the same feature with different analysis profiles. For example, a "default" spectrogram and an "odd" profile spectrogram cannot coexist.

## 2. The Solution

The plan is to change the way feature tracks are keyed in the cache. Instead of just using the `featureKey`, we will use a composite key that includes the `analysisProfileId`.

The new key will be of the format: `{featureKey}:{profileId}`.

This requires changes in several areas of the application:

1.  **Key Generation**: Update the code that generates keys for the `featureTracks` record in `AudioFeatureCache`.
2.  **Cache Logic**: Modify how caches are built and merged to handle the new key format.
3.  **Feature Retrieval**: Update all code that fetches feature tracks from the cache to use the new key format. This includes UI components and rendering logic.
4.  **Diagnostics**: Update the audio diagnostics system to correctly identify and display tracks with different profiles.

## 3. Implementation Steps

-   [ ] **Create a new thought file**: Document the plan. (Done)
-   [ ] **Introduce Profile-Specific Track Keys**: Modify `analyzeAudioBufferFeatures` in `src/audio/features/audioFeatureAnalysis.ts` to create tracks with a key that combines `featureKey` and `analysisProfileId`.
-   [ ] **Update Cache and Retrieval Logic**:
    -   Update `mergeFeatureCaches` in `src/state/timeline/featureCacheUtils.ts`.
    -   Update `resolveFeatureContext` in `src/core/scene/elements/audioFeatureUtils.ts`.
    -   Update `selectAudioFeatureTrack` in `src/state/selectors/audioFeatureSelectors.ts`.
-   [ ] **Update Diagnostic Tools**: Update `collectCachedDescriptorInfos` in `src/state/audioDiagnosticsStore.ts` to correctly parse the new track keys.
-   [ ] **Verification**: Run `npm run test`, `npm run build`, and `npm run lint` to ensure everything is working correctly.
