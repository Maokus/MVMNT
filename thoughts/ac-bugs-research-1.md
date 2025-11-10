# Audio Cache Diagnostics – Bug Research

_Date:_ 2025-11-10

## Summary

-   Reproduced two cache diagnostics regressions reported via the developer overlay.
-   Root cause for missing feature data after "Calculate requested feature tracks" is a profile-aware cache resolution bug in `getFeatureData` → `sampleFeatureFrame`.
-   Root cause for "Delete extraneous caches" removing needed data is profile-blind cleanup logic in `useAudioDiagnosticsStore.deleteExtraneousCaches`.
-   Both issues stem from ignoring the analysis profile when resolving cache entries.

## 1. Feature reads fail after running "Calculate"

### What happens

1. A scene element calls `getFeatureData(element, trackId, featureKey, time)`.
2. `getFeatureData` builds or reuses a descriptor whose `analysisProfileId` may be a non-default ad-hoc profile (e.g. when the element supplies `profileParams`).
3. When the diagnostics panel runs "Calculate requested feature tracks", it queues `regenerateAll`, which restarts analysis jobs for every missing/stale descriptor. The resulting cache often stores tracks under composite keys such as `spectrogram:adhoc-1234`.
4. Once analysis finishes, `sampleFeatureFrame` tries to read the cached frame but calls `resolveFeatureContext(trackId, descriptor.featureKey)` **without passing the profile**. (`src/core/scene/elements/audioFeatureUtils.ts`, lines 173-182.)
5. `resolveFeatureTrackFromCache` (`@audio/features/featureTrackIdentity.ts`) then probes only the bare feature key and a default-profile variant (e.g. `spectrogram:default`). It never probes the ad-hoc profile variant, so the lookup misses and we return `null` even though the cache is warm.

### Evidence in code

-   `sampleFeatureFrame` ignores `descriptor.analysisProfileId` entirely when selecting a track.
-   `resolveFeatureTrackFromCache` builds its candidate list from the provided key; because we pass only `featureKey`, the candidate list never contains the ad-hoc profile key (`featureKey:adhoc-…`).
-   Logging the diagnostics store confirms that the regenerated cache entry exists, but the scene element keeps receiving `null` samples until a full element reset occurs (which clears the descriptor map and forces a re-publish).

### Expected vs actual

-   Expected: Once analysis jobs finish, `sampleFeatureFrame` should resolve the exact profile that was requested and return the cached frame immediately.
-   Actual: Profile-specific cache entries are treated as missing, leaving elements without feature data until they re-request descriptors under a default profile.

### Fix ideas

-   Pass the descriptor's resolved profile into `resolveFeatureContext`, e.g. `resolveFeatureContext(trackId, descriptor.featureKey, descriptor.analysisProfileId ?? descriptor.requestedAnalysisProfileId ?? null)` before sampling.
-   Consider updating `buildSampleCacheKey` to include the profile identifier to avoid cross-profile reuse if the same `AudioFeatureTrack` instance is ever shared.
-   Add a regression test in `src/audio/features/__tests__/sceneApi.test.ts` that exercises an ad-hoc profile descriptor to ensure sampling succeeds once a cache entry with that profile exists.

## 2. "Delete extraneous caches" drops required tracks

### What happens

1. Diagnostics diffs mark descriptor request keys (match key + profile) as `extraneous` when no scene element currently owns them (`audioDiagnosticsStore.computeCacheDiffs`).
2. The cleanup action batches these extraneous entries by audio source. (`useAudioDiagnosticsStore.deleteExtraneousCaches`.)
3. For each extraneous descriptor request key, it derives only `detail?.descriptor?.featureKey` (falls back to parsing the key) and calls `timelineState.removeAudioFeatureTracks(sourceId, featureKey)`.
4. Inside `removeAudioFeatureTracks`, we again resolve tracks without profile context. (`timelineStore.removeAudioFeatureTracks`, `resolveFeatureTrackFromCache`.) The resolver prefers the default profile variant (`featureKey:default`).
5. Result: if an extraneous entry was for `featureKey` under a **different** profile (e.g. an ad-hoc profile from an experiment), the cleanup call deletes the default-profile track that is still required by the scene, leaving the app without necessary cache data.

### Evidence in code

-   `deleteExtraneousCaches` discards the descriptor's `analysisProfileId` entirely (lines 957-983 in `audioDiagnosticsStore.ts`).
-   The request key stored in `diff.extraneous` already encodes the profile (`match:…|profile:adhoc-1234`), but we throw that away and reduce it to `featureKey`.
-   `resolveFeatureTrackFromCache` will happily match `spectrogram:default` when asked for `spectrogram`, so the default cache is removed even though it was never marked extraneous.

### Fix ideas

-   Preserve the full descriptor request key, or at least the pair of `{ featureKey, analysisProfileId }`, when batching extraneous deletions so we call `removeAudioFeatureTracks` with an explicit profile.
-   Alternatively, extend `removeAudioFeatureTracks` to accept the request keys verbatim (composite keys) and skip fallback resolution when a profile-specific key is provided.
-   Add unit coverage in `audioDiagnosticsStore` tests to confirm that deleting an extraneous ad-hoc cache leaves default-profile caches untouched.

## Next steps

-   Implement profile-aware lookups both when sampling feature frames and when pruning caches.
-   After code changes, run the diagnostics end-to-end (calculate, delete extraneous) to confirm elements continue receiving data and required caches persist.
-   Consider surfacing the active profile alongside descriptor IDs in the diagnostics UI to make it easier to spot mixed-profile scenarios.
