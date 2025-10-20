# Audio Cache Lifecycle Research

**Status:** Research snapshot (2025-10-19)

## Lifecycle overview

### Ingest and scheduling
- Importing an `AudioBuffer` stores waveform metadata, binds the source to the track, marks the cache status `pending`, and, unless disabled, immediately schedules feature analysis.【F:src/state/timelineStore.ts†L880-L953】
- `scheduleAudioFeatureAnalysis` cancels prior jobs, moves the status to `pending` with progress metadata, and submits the work to the shared scheduler. Test environments can short-circuit to a `stale` status instead of running heavy analysis.【F:src/state/timelineStore.ts†L261-L360】
- The `AudioFeatureAnalysisScheduler` processes one job at a time, forwarding cancellation signals and resolving with the generated cache when `analyzeAudioBufferFeatures` finishes.【F:src/audio/features/audioFeatureScheduler.ts†L38-L102】【F:src/audio/features/audioFeatureAnalysis.ts†L590-L719】

### Storage and persistence
- When analysis completes, the store normalizes the cache payload, computes a source hash from hop timing and analysis parameters, and records a `ready` status for the audio source.【F:src/state/timelineStore.ts†L982-L1006】【F:src/state/timelineStore.ts†L185-L215】
- Scene documents load and save caches verbatim: the document gateway applies serialized caches and statuses, while the import pipeline reconstructs caches from embedded or external assets before handing them to the store.【F:src/persistence/document-gateway.ts†L118-L137】【F:src/persistence/import.ts†L190-L253】
- Exporting a scene serializes every known cache, splitting large typed arrays into standalone payloads when packaging ZIP bundles.【F:src/persistence/export.ts†L310-L420】

## Cache requests and diagnostics

- `getFeatureData` keeps a per-element descriptor map, publishes analysis intents when descriptors change, and samples frames from the cache via `sampleFeatureFrame` for the current render time.【F:src/audio/features/sceneApi.ts†L207-L277】
- `publishAnalysisIntent` deduplicates descriptor sets per element, assigns default profiles, and pushes requests onto the shared bus that drives diagnostics and tooling.【F:src/audio/features/analysisIntents.ts†L98-L169】
- The audio diagnostics store groups intents by `(trackRef, analysisProfileId)`, compares requests to cached descriptors, and classifies descriptors as missing, stale, regenerating, or extraneous. Its subscribers recompute diffs whenever caches, statuses, or track bindings change.【F:src/state/audioDiagnosticsStore.ts†L200-L323】【F:src/state/audioDiagnosticsStore.ts†L647-L665】
- Regeneration jobs resolve calculators per descriptor, enqueue work, and call back into the timeline store to rerun either targeted calculators or full-track analysis while tracking pending descriptors and history.【F:src/state/audioDiagnosticsStore.ts†L455-L643】

## Invalidation, regeneration, and deletion

- Tempo map or global BPM edits bulk-mark all cache statuses as `stale`, signalling that consumers need refreshed data aligned to the new timing context.【F:src/state/timelineStore.ts†L635-L670】
- Registering a calculator with a new version walks every cache and marks the associated audio source `stale` when a track still references the older version.【F:src/audio/features/audioFeatureRegistry.ts†L12-L34】【F:src/state/timelineStore.ts†L1013-L1042】
- Public APIs expose manual controls: callers can set explicit statuses, stop or restart analysis jobs, re-run selected calculators (merging results via `mergeFeatureCaches`), or clear caches entirely.【F:src/state/timelineStore.ts†L1046-L1144】【F:src/state/timeline/featureCacheUtils.ts†L24-L45】
- Removing tracks through timeline patches drops associated caches and statuses, while clearing or resetting the timeline removes all cached feature data.【F:src/state/timeline/patches.ts†L131-L215】【F:src/state/timelineStore.ts†L1130-L1159】

## Status tracking and surface reactions

- `buildAudioFeatureStatus` preserves prior messages and hashes while stamping update timestamps and optional progress, enabling UI surfaces to show meaningful feedback.【F:src/state/timelineStore.ts†L185-L215】
- Workspace panels read the status map to render progress badges, expose manual controls, and list calculator outputs per track, reflecting live status transitions.【F:src/workspace/layout/SceneAnalysisCachesTab.tsx†L92-L155】
- Diagnostics subscribe to store updates so status flips (for example, `pending` → `ready` or `stale`) immediately recompute descriptor diffs and banner visibility.【F:src/state/audioDiagnosticsStore.ts†L647-L665】

## Opportunities to focus evaluation on user-demanded caches

- **Gate automatic analysis on active descriptor demand.** Today every imported audio source schedules full analysis regardless of whether any element requests features.【F:src/state/timelineStore.ts†L880-L953】 Tapping the intent bus or diagnostics’ grouped descriptors to detect first-use would let the store defer work until a descriptor is actually required.【F:src/audio/features/analysisIntents.ts†L98-L169】【F:src/state/audioDiagnosticsStore.ts†L200-L323】
- **Track descriptor-level freshness to avoid broad `stale` flags.** Source-level invalidation forces users to regenerate all descriptors even when only one calculator changed.【F:src/state/timelineStore.ts†L1013-L1042】 Capturing calculator hashes per descriptor (or per feature track) would let diagnostics request only the affected tracks and skip reprocessing unrelated data.【F:src/state/audioDiagnosticsStore.ts†L253-L307】
- **Prune unused feature tracks before serialization.** Export currently writes every cached track, even ones diagnostics classify as extraneous for the active scene.【F:src/persistence/export.ts†L310-L420】【F:src/state/audioDiagnosticsStore.ts†L288-L305】 Feeding the extraneous list into export (or clearing unused tracks at runtime) would keep storage aligned with user-visible requirements.
