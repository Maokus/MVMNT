# Plan to fix Audio Diagnostics Issues

This document outlines a plan to address three known issues in the audio diagnostics and caching system.

## 1. Cache Diffing Mismatch (`trackRef` vs `audioSourceId`)

### Problem

The current cache diffing logic groups analysis requests by `(trackRef, analysisProfileId)`. However, audio feature caches are keyed by `audioSourceId`. When multiple tracks (`trackRef`s) share a single audio source, the system can incorrectly identify descriptors as "extraneous". A descriptor required by one track may be flagged as extraneous for another track sharing the same source if the second track doesn't explicitly need it. This leads to confusing diagnostic reports and encourages unnecessary cache deletions.

### Solution

The proposed solution is to change the grouping of analysis intents. Instead of grouping by `(trackRef, analysisProfileId)`, we will group them by `(audioSourceId, analysisProfileId)`. This aligns the request grouping with the cache structure.

This involves the following changes in `src/state/audioDiagnosticsStore.ts`:

1.  **Update `computeCacheDiffs` grouping:** Modify the initial loop that builds request groups. It should resolve the `audioSourceId` for each intent and use that for grouping instead of `trackRef`.
2.  **Update `CacheDiff` interface:** The `trackRef` field in the `CacheDiff` interface should be changed to `trackRefs` (a string array) to accommodate multiple tracks being associated with a single diff entry.
3.  **Update consumers of `CacheDiff`:** All UI components and logic that consume `CacheDiff` objects will need to be updated to handle the new `trackRefs` array instead of a single `trackRef`. This includes files like `CacheDiagnosticsPanel.tsx` and `AudioDiagnosticsSection.tsx`.
4.  **Adjust regeneration logic:** Functions like `regenerateDescriptors` and `dismissExtraneous` are called with a `trackRef`. The logic needs to be adapted to handle the new grouping. It might involve looking up the `audioSourceId` from the `trackRef` and then finding the correct diff object.

## 2. Persistent Dismissed Extraneous Descriptors

### Problem

When a user dismisses an "extraneous" descriptor, that dismissal is stored and persists. If the project's requirements change later (e.g., an element is added that now requires this descriptor), the dismissal can hide what is now a legitimate "missing" descriptor warning. The user would have to manually find and clear the dismissal to see the new warning.

### Solution

The fix is to automatically clear dismissals for descriptors that become required by any element.

This can be implemented in `src/state/audioDiagnosticsStore.ts`:

1.  **Track required descriptors:** In `computeCacheDiffs`, while iterating through all analysis intents, build a set of all `requestKey`s for all required descriptors across all elements.
2.  **Clear relevant dismissals:** Before calculating the final diffs, iterate through the `dismissedExtraneous` records. If a dismissed descriptor's `requestKey` is present in the set of currently required descriptors, remove it from the `dismissedExtraneous` set.
3.  This ensures that as soon as a previously dismissed descriptor becomes needed, the dismissal is automatically revoked, and it will correctly show up as "missing" if not present in the cache.

## 3. Unregistered Audio Calculators

### Problem

The diagnostics system flags descriptors as "bad request" if their associated calculator is not registered in the `audioFeatureCalculatorRegistry`. Developers can add new calculators to the codebase, but if they forget to register them, any features relying on them will fail diagnostics, which can be confusing.

### Solution

To make this more developer-friendly, we can introduce a mechanism to automatically register calculators that are part of the project but might have been missed.

1.  **Create a central registry for scene elements:** Similar to how note animations are registered, we can create a registry for all `SceneElement` classes.
2.  **Auto-register calculators on startup:** We can leverage this registry to inspect all registered scene elements. By calling a static method like `getAudioRequirements()` on each element class, we can gather all audio feature requirements, including any custom `calculatorId`s.
3.  **Pre-populate the calculator registry:** Before the main application initializes, we can use the list of `calculatorId`s to ensure the corresponding calculators are registered. This could involve a dynamic import mechanism that maps calculator IDs to their modules.
4.  **Documentation:** Update developer documentation to clearly state that new calculators must either be added to this auto-registration system or be registered manually at startup. This makes the process less error-prone.

This approach ensures that as long as a calculator is referenced by a scene element, it will be registered, and its descriptors will be validated correctly by the diagnostics system.
