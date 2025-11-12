# Audio feature data flow and virtual silence handling

## Snapshot

-   Elements request audio-reactive data through `getFeatureData` in `src/audio/features/sceneApi.ts`.
-   Feature descriptors funnel through `FeatureSubscriptionController`, which publishes analysis intents and manages per-element cache bindings.
-   Audio feature caches are generated async via `sharedAudioFeatureAnalysisScheduler` and stored in the `timelineStore` under `audioFeatureCaches`.
-   Sampling happens in `sampleFeatureFrame` → `getTempoAlignedFrame`, which currently yields zeroed frames and sometimes truncated waveform vectors when the request falls outside the analysed buffer.
-   We can emulate pre/post-track silence without inflating cache size by synthesising silent frames on demand using cached shape metadata rather than storing extra frames in the cache itself.

## 1. From element requests to cached feature tracks

### 1.1 Element-level subscription setup

1. Scene elements declare feature requirements via `registerFeatureRequirements` (`src/audio/audioElementMetadata.ts`).
2. When an element mounts or its track binding changes, `BaseSceneElement` (and hooks like `useAudioFeature`) call `syncElementSubscriptions` / `getFeatureData`.
3. `getFeatureData` (scene API) is the primary entry point:
    - Builds or normalises the requested descriptor (`createFeatureDescriptor`).
    - Acquires a `FeatureSubscriptionController` keyed to the element instance.
    - Normalises the track ID; if absent, the controller is reset and the call returns `null`.

### 1.2 Subscription aggregation & intent publication

1. `FeatureSubscriptionController` maintains three descriptor pools (`static`, `explicit`, `adHoc`) and the active track.
2. Any descriptor change or track switch triggers `flush()`, which:
    - Aggregates descriptors respecting priority and profile overrides.
    - Publishes the consolidated list via `publishAnalysisIntent` (see `src/audio/features/analysisIntents.ts`).
3. Intents land on an in-memory bus consumed by diagnostics (`audioDiagnosticsStore`), allowing the UI to surface missing caches or pending analysis.

### 1.3 Timeline store cache lifecycle

1. Audio buffers enter the system through `timelineStore.ingestAudioToCache`.
2. The store schedules feature analysis with `sharedAudioFeatureAnalysisScheduler.schedule` (see `scheduleAudioFeatureAnalysis`), unless analysis is explicitly skipped.
3. The scheduler runs `analyzeAudioBufferFeatures` (`src/audio/features/audioFeatureAnalysis.ts`):
    - Applies calculators (spectrogram, RMS, waveform, etc.).
    - Produces an `AudioFeatureCache` per audio source, containing per-feature `AudioFeatureTrack`s and profile metadata.
4. On completion, `timelineStore.ingestAudioFeatureCache` normalises and stores the cache, transitions status to `ready`, and adjusts scene range if needed.

### 1.4 Cache structure and persistence

-   `AudioFeatureCache` holds:
    -   `featureTracks`: keyed by `featureKey:profileId` (cf. `buildFeatureTrackKey`).
    -   `analysisProfiles` / `defaultAnalysisProfileId`.
    -   Timing metadata (`hopSeconds`, `hopTicks`, `startTimeSeconds`, tempo projection).
-   Caches are serialised for exports/imports (`src/persistence/export.ts` & `import.ts`) and referenced by `audioFeatureCacheStatus` for progress + failure states.

### 1.5 Sampling path at runtime

1. `getFeatureData` delegates sampling to `sampleFeatureFrame` (`src/audio/audioFeatureUtils.ts`).
2. `sampleFeatureFrame` resolves the cache + track using `resolveFeatureContext` and turns the request into ticks.
3. Calls `getTempoAlignedFrame` (`src/audio/features/tempoAlignedViewAdapter.ts`), which:
    - Computes the tempo-aligned frame index (`frameFloat`).
    - Interpolates as needed, including smoothing windows.
    - Handles out-of-bounds requests by synthesising a silent frame via `buildSilentVector`.
4. `sampleFeatureFrame` memoises per-track sampling results (`featureSampleCache`) keyed by tick and sampling options to reduce recomputation.
5. The returned `AudioFeatureFrameSample` is wrapped into `FeatureDataResult`, exposing flat `values`, channel-aligned vectors, aliases, and layout metadata.

## 2. Existing out-of-bounds behaviour

-   **Spectrogram / scalar calculators**: When `frameFloat` falls before the track start or after the final frame, `buildSilentVector` emits zero-filled arrays matching the expected channel count. This yields an all-zero spectrogram column.
-   **Waveform calculators**:
    -   `waveform-minmax` generates `[min, max]` pairs per channel (length 2).
    -   `waveform-periodic` relies on metadata (`frameOffsets`, `frameLengths`, `maxFrameLength`). If frames near the tails lack complete metadata, `resolvePeriodicWaveformLength` may derive a shorter-than-typical silent vector, causing consumers expecting a uniform length to see truncated buffers.
-   Because silent frames are synthesised on the fly, cache size stays bounded, but callers observe shorter arrays or missing periodic samples when requesting pre/post-track data or when the final analysed frame is shorter than the declared max length.

## 3. Goal: behave as if silence surrounds the analysed buffer

We want elements to perceive deterministic, silence-equivalent feature data for any time outside the analysed window, without writing additional frames into the persistent caches.

Key requirements:

-   Preserve cache size: no extra frames stored in `AudioFeatureTrack.data`.
-   Maintain consistent vector shapes (lengths, channel counts) so downstream consumers can rely on fixed buffer sizes.
-   Keep synthesis fast and memoised so repeated out-of-range samples stay cheap.

## 4. Suggested implementation blueprint

1. **Capture canonical frame shapes per track**

    - Introduce an ephemeral `WeakMap<AudioFeatureTrack, FrameShape>` in `tempoAlignedViewAdapter` that records channel sizes (and periodic waveform lengths) from the first in-bounds frame encountered.
    - Fallback to metadata (`maxFrameLength`, channel counts) if no valid frame exists.

2. **Enhance `buildSilentVector`**

    - Replace the current ad-hoc length derivation with the cached `FrameShape` information.
    - Ensure `channelValues` and `flatValues` are populated to the canonical lengths, even when metadata is incomplete.
    - For `waveform-periodic`, honour `frameLength` when present; otherwise, use the cached max length so clients always receive identical-length arrays.

3. **Handle range sampling parity**

    - Mirror the same shape logic inside `getTempoAlignedRange` when expanding `data` buffers for out-of-bounds windows (padding with zeros for each requested frame rather than shrinking the frame count).

4. **Optional smoothing cache adjustments**

    - When smoothing pulls in out-of-range neighbours, ensure the silent samples returned to the smoothing window use the canonical shapes so averaging preserves array length.

5. **Testing & diagnostics**
    - Add unit tests around `tempoAlignedViewAdapter` to cover:
        - Requests before start, inside range, and after end for spectrogram and both waveform formats.
        - Consistency of `channelValues.length` and `frameLength` across boundary conditions.
    - Extend diagnostics logging (if desirable) to flag when silent samples are served, aiding future debugging.

## 5. Rollout considerations

-   **Performance**: The additional shape cache should be negligible (per-track, per-process). Memoising silent vectors for common shapes can further reduce allocations if needed.
-   **Backwards compatibility**: Since we only modify runtime sampling, existing caches and exports remain valid. Consumers expecting shorter buffers might need minor adjustments, but the new deterministic sizing simplifies their logic.
-   **Future flexibility**: By deriving shapes dynamically, new calculators can opt into the same silent-padding behaviour by populating `FrameShape` metadata or first-frame inspection, avoiding format-specific hacks.

---

This approach keeps persistent caches lean while ensuring every feature behaves as though the audio track were surrounded by silence—zero-valued spectrogram magnitudes and waveform envelopes whose shapes match in-range frames. Elements can then animate smoothly across track boundaries without special casing null results or variable-length buffers.
