# Ad-Hoc Audio Analysis Profile Overrides

_Status: Proposed_

## 1. Executive Summary

This document outlines a plan to enhance the audio analysis system by allowing scene element developers to specify **ad-hoc, inline parameter overrides** for audio feature requests. Currently, developers must select from a list of pre-defined, named `AudioAnalysisProfile`s, which is inflexible and leads to boilerplate for custom analysis needs. The proposed solution introduces a `profileParams` property to `AudioFeatureRequirement`, enabling developers to provide partial profile configurations directly. The system will then dynamically generate, cache, and utilize these custom profiles, making the process more intuitive and scalable.

## 2. The Problem: Inflexible, Boilerplate-Heavy Profiles

The current audio analysis system requires that any variation in analysis parameters (e.g., `windowSize`, `hopSize`) be defined as a complete, named `AudioAnalysisProfile` in the central `audioFeatureRegistry`. While this ensures consistency, it creates significant friction for developers who need slightly different parameters for a specific use case.

For example, if a scene element requires a `loudness` feature with a non-default `windowSize` of 4096, the developer must:

1.  Define a new, complete profile (e.g., `loudness-4096`) in the registry.
2.  Explicitly reference this named profile in the element's `AudioFeatureRequirement`.

This approach has several drawbacks:

-   **Global Namespace Pollution:** The registry becomes cluttered with one-off, highly specific profiles.
-   **High Boilerplate:** Developers must modify a central registry file for minor, localized changes.
-   **Poor Discoverability:** It's difficult to know if a suitable non-default profile already exists.
-   **Discourages Experimentation:** The overhead of creating a new profile discourages developers from tweaking parameters.

The core issue is that profiles are treated as monolithic, audio-source-level configurations rather than granular, feature-request-level parameter sets.

## 3. Proposed Solution: Inline Profile Overrides

I propose allowing `AudioFeatureRequirement`s to include an optional `profileParams` object. This object would contain a partial `AudioAnalysisProfile` that overrides the base profile (e.g., `default`).

### How It Works

1.  **Modified Requirement:** An element developer can now write a requirement like this:

    ```typescript
    const requirements: AudioFeatureRequirement[] = [
        {
            feature: 'loudness',
            // No need for a named profile, just override what's needed.
            profileParams: {
                windowSize: 4096,
                smoothingTimeConstant: 0.2,
            },
        },
    ];
    ```

2.  **Dynamic Profile Generation:** When the system processes this requirement, it will:
    a. Select a base profile (either the one specified in `profile` or the system `default`).
    b. Merge the `profileParams` overrides into the base profile to create a final, concrete profile configuration.
    c. Generate a **deterministic, unique ID** for this ad-hoc profile by hashing the final configuration object (e.g., `sha1(JSON.stringify(finalProfile))`).

3.  **Integration with Existing Systems:** This dynamically generated profile ID will be used throughout the rest of the pipeline:
    -   **Analysis Intents:** The intent will carry the dynamic ID, signaling to the analysis engine which parameters to use.
    -   **Caching:** The resulting `AudioFeatureTrack` will be stored in the cache under the dynamic ID, ensuring that subsequent requests with the exact same overrides hit the cache.

This approach provides the flexibility of custom parameters while seamlessly integrating with the existing, robust caching and analysis infrastructure.

## 4. Implementation Plan

The implementation will touch several key files in the audio feature system.

1.  **`src/audio/features/audioFeatureTypes.ts`**:

    -   Add `profileParams?: Partial<AudioAnalysisProfile>` to the `AudioFeatureRequirement` interface.

2.  **`src/audio/features/descriptorBuilder.ts`**:

    -   This is where the core logic will reside. The builder will be updated to:
        -   Detect the presence of `profileParams`.
        -   Merge the base profile with `profileParams`.
        -   Generate the deterministic hash for the resulting profile.
        -   Use this hash as the `analysisProfileId` in the created `AudioFeatureDescriptor`.
        -   Potentially register this ad-hoc profile dynamically in the registry for the current session if needed by downstream consumers.

3.  **`src/audio/features/subscriptionSync.ts`**:

    -   The logic for deduplicating descriptors needs to be updated to account for `profileParams`. Two requirements for the same feature are only identical if their `profileParams` are also structurally identical.

4.  **`src/core/scene/elements/`**:
    -   Create a new test element (e.g., `audio-adhoc-profile.ts`) or modify an existing one (`audio-odd-profile.ts`) to validate the new functionality by requesting a feature with `profileParams`.

## 5. Potential Issues & Sources of Confusion

### a. Cache Bloat

-   **Issue:** Allowing arbitrary parameter combinations could lead to a large number of cached feature tracks, consuming significant disk space. An element that, for example, binds `windowSize` to a slider could generate hundreds of cache entries.
-   **Mitigation:** This is an inherent trade-off for flexibility. We should:
    -   Document this behavior clearly for developers.
    -   Emphasize that `profileParams` is intended for defining a small number of static variations, not for highly dynamic, user-driven parameter changes.
    -   Continue to recommend using named profiles for common, shared configurations.

### b. UI and Tooling Complexity

-   **Issue:** How do we represent these ad-hoc profiles in developer tools and diagnostics? They don't have friendly, human-readable names.
-   **Mitigation:**
    -   **Diagnostics:** The diagnostics view can display the short hash of the profile ID. On hover or selection, it could show a tooltip or panel detailing the full set of parameters that were overridden.
    -   **Property Inspector:** The `AudioAnalysisProfileSelect` control will not be able to represent these ad-hoc profiles. This is acceptable, as the intention is for these overrides to be defined in code by the element developer, not configured by the end-user in the inspector. The control will continue to show and manage named profiles only.

### c. Determinism of Profile IDs

-   **Issue:** The hashing function must be perfectly deterministic. The order of keys in the profile object, for instance, could affect the output of a naive `JSON.stringify` call.
-   **Mitigation:**
    -   Before stringifying the profile object for hashing, we must implement a function that sorts the keys of the object alphabetically at all levels. This ensures that `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the same hash. A small, stable stringify library or a custom recursive function can solve this.

### d. Backward Compatibility

-   **Issue:** The changes must not break existing elements or caches.
-   **Mitigation:** The proposed changes are fully backward-compatible. If `profileParams` is not provided, the system's behavior remains unchanged. The logic in `descriptorBuilder` will only activate when the new property is present.

## 6. Next Steps

1.  **Implement Type Changes:** Modify `audioFeatureTypes.ts`.
2.  **Implement Core Logic:** Update `descriptorBuilder.ts` with profile merging and hashing.
3.  **Update Subscription Sync:** Adjust deduplication logic in `subscriptionSync.ts`.
4.  **Add Test Case:** Create or update a scene element to serve as a live test.
5.  **Verify and Document:** Run tests, verify cache behavior, and add documentation for developers explaining the new feature and its trade-offs.
