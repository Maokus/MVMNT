# Audio Feature Cache Invalidation Research

**Status:** Research snapshot (2024-10-07)
**Last reviewed:** 2024-10-07

## System Overview

- Audio feature data is stored per audio source ID in `timelineStore.audioFeatureCaches`, with a parallel `audioFeatureCacheStatus` map that records lifecycle state, messaging, `sourceHash`, and optional progress information. Ingestion normalizes caches and records a `ready` status via `computeFeatureCacheSourceHash`. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L982-L1006)
- Automatic analysis jobs are orchestrated by `scheduleAudioFeatureAnalysis`, which cancels any active run, marks the status `pending`, and queues work on the shared scheduler. When the promise resolves the store either ingests the new cache (optionally merged with prior results) or records a failure. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L261-L359)
- Import/undo patches inject caches and statuses via `buildReadyFeatureStatus`, which hashes a different subset of cache fields than runtime ingestion (ticks vs. seconds fields) while still populating the same `audioFeatureCacheStatus` structure. [src/state/timeline/patches.ts](../src/state/timeline/patches.ts#L130-L223)
- Diagnostics track requested descriptors through `analysisIntents`, group them by `(trackRef, analysisProfileId)`, and diff those requests against the cached descriptors for the resolved audio source. Track-level status changes (e.g., `stale`) drive descriptor-level flags, while manual regenerations enqueue jobs that call back into the timeline store. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L200-L323) and [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L455-L643)

## Lifecycle & Invalidation Triggers

1. **Initial ingest** – Adding or reloading audio buffers saves waveform metadata, marks the status `pending`, and starts automatic analysis unless explicitly skipped. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L880-L953)
2. **Analysis completion** – Successful jobs call `ingestAudioFeatureCache`, clearing scheduler state, normalizing the payload, and marking the source `ready`. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L982-L1006)
3. **Global edits** – Changing the tempo map or global BPM bulk-mark all known statuses as `stale`, without scheduling fresh analysis. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L635-L670)
4. **Calculator churn** – Registering a calculator with a new version triggers `invalidateAudioFeatureCachesByCalculator`, which scans every cache and marks the entire source `stale` if any track still carries the old version. [src/audio/features/audioFeatureRegistry.ts](../src/audio/features/audioFeatureRegistry.ts#L12-L34) and [src/state/timelineStore.ts](../src/state/timelineStore.ts#L1013-L1038)
5. **Manual regeneration** – The diagnostics job queue resolves calculator IDs per descriptor, re-runs either the specific calculators (merge mode) or a full analysis, and prunes the diagnostics `pendingDescriptors` set when the job completes. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L334-L350) and [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L556-L643)

## Potential Problems & Sources of Confusion

1. **Status granularity mismatch** – `audioFeatureCacheStatus` lives at the audio source level, but diagnostics groups requests by track reference and profile. When two tracks share the same audio source, only the group that initiated regeneration gets `pendingDescriptors`, leaving sibling groups marked as `stale` even though the shared status is `pending`. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L235-L309)
2. **Coarse stale marking** – Calculator version mismatches or tempo changes flag the whole source `stale`, and diagnostics propagates that to every requested descriptor regardless of which calculator actually changed. This prevents targeted regeneration flows and can overwhelm users with false positives. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L635-L668) and [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L253-L285)
3. **Merge-only regeneration** – `mergeFeatureCaches` overlays new feature tracks onto the existing cache without removing entries that disappeared or changed schema. Diagnostics therefore surfaces “extraneous” descriptors after a partial re-run, forcing manual dismissal or a full clear. [src/state/timeline/featureCacheUtils.ts](../src/state/timeline/featureCacheUtils.ts#L24-L45) and [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L288-L305)
4. **Inconsistent source hashing** – Runtime ingestion hashes seconds-based fields while patch-based ingestion hashes tick-based fields. The values are opaque strings, so engineers cannot easily reason about whether two hashes represent equivalent inputs, and tooling that compares hashes may misclassify caches. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L185-L192) versus [src/state/timeline/patches.ts](../src/state/timeline/patches.ts#L79-L95)
5. **Regeneration fallbacks** – `resolveCalculators` falls back to full reanalysis when a descriptor lacks a calculator ID or the cache entry is missing, because it cannot determine which calculators to run. That can surprise users who expected a targeted refresh and lengthens queues unnecessarily. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L334-L350) and [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L568-L643)
6. **UI feedback gaps** – Diagnostics treats descriptors as “regenerating” only if its internal `pendingDescriptors` set is populated, so analyses kicked off directly by the timeline store (e.g., initial ingest) still appear as “missing” until they finish even though the status is already `pending`. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts#L253-L268)
7. **Test-mode staleness** – In tests, the scheduler short-circuits to `stale` without a job, which is appropriate for skipping heavy work but makes fixture expectations tricky because the status mimics a real invalidation. [src/state/timelineStore.ts](../src/state/timelineStore.ts#L289-L301)

## Open Questions

- Should diagnostics key pending work and regenerating states by audio source instead of track reference so that shared-source tracks stay in sync?
- Can we capture descriptor-level calculator hashes alongside the cache to avoid blanket `stale` markings when only one track is outdated?
- Do we need a deletion pass in `mergeFeatureCaches`, or a separate API, so regenerated caches no longer leave “extraneous” descriptors behind?
- Would exposing structured data for `sourceHash` (or unifying the hash inputs) help debugging and automated comparisons?
