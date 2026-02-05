# Audio Analysis Chip States

## UI Surfaces

-   Track lanes render the chip inside each audio clip using `featureStatusLabel`, mapping store states to colors and text in [src/workspace/panels/timeline/TrackLanes.tsx#L286-L339](src/workspace/panels/timeline/TrackLanes.tsx#L286-L339).
-   Scene analysis diagnostics mirror the same labels inside the cache inspector tab via `getStatusMeta` in [src/workspace/layout/SceneAnalysisCachesTab.tsx#L27-L57](src/workspace/layout/SceneAnalysisCachesTab.tsx#L27-L57).

## State Matrix

| Store state     | Chip label                      | Primary setter                       | Trigger summary                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| undefined entry | Not analysed                    | Track UI default                     | When no `audioFeatureCacheStatus[sourceId]` exists (e.g., brand-new audio track or cache entry deleted) the UI falls through to the default label, so users still see "Not analysed" even though no request ever ran [src/workspace/panels/timeline/TrackLanes.tsx#L286-L339](src/workspace/panels/timeline/TrackLanes.tsx#L286-L339).                                                |
| idle            | Not analysed                    | `ingestAudioToCache`                 | Importing audio resets/creates the status to `idle` with message "analysis not started" unless we intentionally preserve an existing ready cache via `skipAutoAnalysis` [src/state/timelineStore.ts#L882-L934](src/state/timelineStore.ts#L882-L934).                                                                                                                                 |
| pending         | Analysing… (+ optional percent) | `scheduleAudioFeatureAnalysis`       | Any analysis run (auto or manual) marks the source `pending`, attaches progress labels such as "preparing" and updates completion via scheduler callbacks; status text defaults to "analyzing audio" or "reanalysing selected features" [src/state/timelineStore.ts#L281-L379](src/state/timelineStore.ts#L281-L379).                                                                 |
| ready           | Analysed                        | `ingestAudioFeatureCache`            | Successful analyzer completion ingests the produced cache, stores the source hash, and flips the chip to "Analysed" [src/state/timelineStore.ts#L974-L1012](src/state/timelineStore.ts#L974-L1012).                                                                                                                                                                                   |
| stale           | Queued                          | Tempo / calculator invalidations     | Any change that jeopardizes cache correctness (tempo map edit, BPM change, calculator version mismatch) bulk-updates statuses to `stale` with descriptive messages such as "tempo map updated", prompting a re-run [src/state/timelineStore.ts#L620-L671](src/state/timelineStore.ts#L620-L671) and [src/state/timelineStore.ts#L1006-L1045](src/state/timelineStore.ts#L1006-L1045). |
| failed          | Failed                          | Error handlers in scheduler & ingest | Import failures, analyzer crashes, or attempts to restart without an audio buffer set `failed` messages like "ingest failed" or "no audio buffer available" [src/state/timelineStore.ts#L352-L389](src/state/timelineStore.ts#L352-L389) and [src/state/timelineStore.ts#L1075-L1125](src/state/timelineStore.ts#L1075-L1125).                                                        |

## Detailed State Narratives

### Implicit "Not analysed"

-   Because the chip rendering does not guard against a missing status record, any audio track without `audioFeatureCacheStatus` entries shows the same gray "Not analysed" badge as a track that explicitly opted out of analysis.
-   `SceneAnalysisCachesTab` behaves similarly by falling back to "Not analysed" in `getStatusMeta` when `status` is undefined [src/workspace/layout/SceneAnalysisCachesTab.tsx#L27-L57](src/workspace/layout/SceneAnalysisCachesTab.tsx#L27-L57).
-   This is the confusing case raised by users: "Not analysed" conflates "analysis never requested" with "user cancelled" or "analysis finished but results removed".

### `idle` → "Not analysed"

-   Importing audio via `ingestAudioToCache` cancels any running job, seeds cache metadata, and then sets `idle` with the explicit message "analysis not started" [src/state/timelineStore.ts#L882-L934](src/state/timelineStore.ts#L882-L934).
-   If `skipAutoAnalysis` is true _and_ a ready cache already exists, we preserve that ready state; otherwise the chip reverts to idle (gray). This is the only branch that tries to respect deliberate opt-outs, but the UI can't distinguish it from "analysis pending".
-   Stopping an active job (`stopAudioFeatureAnalysis`) also forces `idle` and surfaces "analysis stopped", yet the chip label still reads "Not analysed" [src/state/timelineStore.ts#L1048-L1074](src/state/timelineStore.ts#L1048-L1074).

### `pending` → "Analysing…"

-   Scheduling analysis (automatic after ingest, manual restart, or selective reanalysis) cancels older jobs, stamps a `pending` status with message ("analyzing audio" vs "reanalysing selected features"), and seeds progress `{ value: 0, label: 'preparing' }` [src/state/timelineStore.ts#L281-L379](src/state/timelineStore.ts#L281-L379).
-   Incremental progress updates propagate from the scheduler via `onProgress`, generating percentages on the chip (`Analysing… 42%`) [src/workspace/panels/timeline/TrackLanes.tsx#L286-L339](src/workspace/panels/timeline/TrackLanes.tsx#L286-L339).
-   When analysis runs during automated tests, `pending` is skipped altogether and the status jumps straight to `stale` with message "analysis skipped in tests" so chips never show progress in that environment [src/state/timelineStore.ts#L281-L330](src/state/timelineStore.ts#L281-L330).

### `ready` → "Analysed"

-   Once the scheduler promise resolves, `ingestAudioFeatureCache` normalizes the payload, saves it, and marks the source `ready`. The chip flips to the green "Analysed" badge immediately afterwards [src/state/timelineStore.ts#L974-L1012](src/state/timelineStore.ts#L974-L1012).
-   Ready states cache a `sourceHash` so downstream invalidations know whether the stored features still match the audio buffer.

### `stale` → "Queued"

-   Any tempo-domain change (new master tempo map, BPM change) bulk-updates every tracked source to `stale` with meaningful messages like "tempo map updated" or "tempo updated" so the chip turns blue and the diagnostics tab lists the affected tracks [src/state/timelineStore.ts#L620-L671](src/state/timelineStore.ts#L620-L671).
-   `invalidateAudioFeatureCachesByCalculator` marks specific sources as `stale` when a calculator version mismatch is detected, using the message "calculator updated" [src/state/timelineStore.ts#L1006-L1045](src/state/timelineStore.ts#L1006-L1045).
-   Re-run requests (`restartAudioFeatureAnalysis`, selective reanalysis) start from `stale` and immediately move into `pending`.

### `failed` → "Failed"

-   Analyzer errors and ingest issues both set the status to `failed` with explanatory text. Examples include cache ingest exceptions ("analysis ingest failed"), runtime errors bubbled from the worker ("analysis failed: …"), and absence of an audio buffer when the user tries to trigger analysis ("no audio buffer available") [src/state/timelineStore.ts#L352-L389](src/state/timelineStore.ts#L352-L389) and [src/state/timelineStore.ts#L1075-L1125](src/state/timelineStore.ts#L1075-L1125).
-   Failed states remain until the user restarts analysis; the chip stays red and the tooltip relays the detailed message assembled in `featureStatusTitle` [src/workspace/panels/timeline/TrackLanes.tsx#L320-L334](src/workspace/panels/timeline/TrackLanes.tsx#L320-L334).

## Typical Lifecycle

1. **Import** – track enters `idle` → "Not analysed" immediately after buffering audio.
2. **Auto analysis (optional)** – if auto analysis is enabled, status jumps to `pending` and shows progress until completion.
3. **Result** – a successful run transitions to `ready`/"Analysed"; errors drop into `failed`/"Failed".
4. **Invalidation** – environment changes mark caches `stale`/"Queued". Users must re-run, which routes back through `pending`.
5. **Manual stop or opt-out** – user cancels analysis or imports with `skipAutoAnalysis`, leaving the chip on the same gray "Not analysed" badge despite very different intent.

## Observations & UX Risk

-   Multiple root causes (`undefined`, `idle`, or explicit cancellation) collapse into the same gray badge, so users cannot tell whether analysis will start automatically or whether they need to request it.
-   Messages attached to statuses (`analysis not started`, `analysis stopped`) only show on hover via the tooltip, making the ambiguity worse on touch devices.
-   Consider splitting the chip into at least two gray variants (e.g., "Analysis off" vs "Ready to analyse") or hiding it entirely when no analysis was requested. Doing so would align the visual language with actual store states rather than the current one-size-fits-all "Not analysed" label.
