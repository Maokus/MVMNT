# Audio Cache Diagnostics – Remediation Plan

_Date:_ 2025-11-10

## Goals

-   Restore diagnostic workflows so recalculated feature caches are immediately consumable by scene elements.
-   Prevent cache cleanup utilities from removing in-use tracks tied to different analysis profiles.
-   Add guardrails (tests + instrumentation) to stop profile-awareness regressions from reoccurring.

## Issue A – Feature reads fail after "Calculate"

### Fix Strategy

1. **Profile-aware sampling**
    - Update `sampleFeatureFrame` to pass the resolved analysis profile (`descriptor.analysisProfileId || descriptor.requestedAnalysisProfileId`) into `resolveFeatureContext`.
    - Ensure downstream helpers (`resolveFeatureTrackFromCache`, `buildSampleCacheKey`) accept and use the explicit profile identifier when constructing candidate keys.
2. **Descriptor caching hygiene**
    - Audit any memoized descriptors in `audioFeatureUtils` for profile awareness. Clear or re-key caches when descriptors change profile to avoid stale references.

### Validation

-   Extend `sceneApi` feature tests to cover ad-hoc profiles: create a descriptor with custom `profileParams`, run a simulated regeneration, and confirm `sampleFeatureFrame` returns data from the profile-specific cache.
-   Add targeted unit coverage for `resolveFeatureTrackFromCache` to assert that supplying an explicit profile hits the correct key first.
-   Smoke test via diagnostics panel: run "Calculate requested feature tracks" on a scene with ad-hoc profiles and verify data appears without reloading the element.

## Issue B – "Delete extraneous caches" removes required data

### Fix Strategy

1. **Preserve profile information**
    - Modify `useAudioDiagnosticsStore.deleteExtraneousCaches` to retain `{ featureKey, analysisProfileId }` or the full request key when batching deletions.
    - Update `timelineState.removeAudioFeatureTracks` (and underlying helpers) to accept an optional `analysisProfileId`; when provided, skip default-profile fallbacks and target only the matching cache entry.
2. **Cleanup safety guards**
    - Introduce assertions/logging when a deletion removes a track still referenced by active descriptors, to catch future mismatches.

### Validation

-   Add unit tests around `audioDiagnosticsStore` extraneous cleanup verifying that deleting an ad-hoc profile entry leaves default profile caches intact.
-   Add integration coverage to ensure that when both default and ad-hoc caches exist, invoking cleanup removes only the ad-hoc entry flagged as extraneous.
-   Manual diagnostics run: create mixed-profile descriptors, mark ad-hoc as extraneous, execute cleanup, and confirm the scene continues rendering with default caches.

## Implementation Timeline

1. **Week 1**: Land core code changes for profile-aware sampling and cleanup; ensure TypeScript types cover optional profile arguments.
2. **Week 2**: Backfill automated tests and smoke through diagnostics flows; adjust instrumentation/log levels as needed.
3. **Week 3**: Monitor usage, review logs for unexpected cache misses/deletes, and prepare regression safeguards (documentation, developer overlay hints).

## Risks & Mitigations

-   **Hidden call sites ignoring profiles**: Run a global search for `resolveFeatureContext`/`removeAudioFeatureTracks` usages; update or document any that intentionally ignore profiles.
-   **Cache key churn impacting performance**: Benchmark hot paths after adding profile-aware keys; cache precomputed composite keys where necessary.
-   **Test coverage gaps**: Ensure new tests fail on the current `locked_waveform` branch to validate they protect against the regressions.

## Follow-up Ideas

-   Surface active `analysisProfileId` alongside descriptor entries in the diagnostics overlay to aid debugging.
-   Provide a one-click action to rebind descriptors to a specific profile to recover from legacy scenes lacking profile annotations.
