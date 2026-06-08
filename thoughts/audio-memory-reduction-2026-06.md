# Audio Memory Reduction — Investigation & Proposals

**Date:** June 2026  
**Context:** The app is memory intensive with many audio-reactive elements and audio tracks. This document investigates root causes and proposes concrete improvements.

---

## Findings

### 1. Dual PCM Storage: Decoded Buffer + Compressed Bytes

**Location:** `src/state/timeline/commands/addTrackCommand.ts:101–108`, `src/audio/audioTypes.ts:17–23, 31–40`

When an audio file is loaded, both the decoded `AudioBuffer` (PCM) and the original compressed `Uint8Array` are stored indefinitely in the `audioCache` Zustand entry.

- A 4-minute stereo 44.1 kHz track → ~84.7 MB decoded PCM
- The original compressed file (MP3/AAC) → 5–20 MB additional

With 5 tracks loaded: the `originalFile.bytes` fields alone add **25–100 MB** beyond what is needed during playback. These persist as long as the track exists.

**Reason compressed bytes are stored:** Presumably needed to re-embed audio in project exports/saves. However, they are held in RAM permanently even when no export is in progress.

---

### 2. Spectrogram Feature Cache: ~85 MB Per 4-Minute Track

**Location:** `src/audio/features/calculators/spectrogramCalculator.ts:41–48`, `src/audio/features/audioFeatureAnalysis.ts:96–97`

The spectrogram calculator computes the entire track upfront and stores it as one large `Float32Array`:

```
frameCount × binCount × 4 bytes
= ~20,621 × 1025 × 4
= ~84.5 MB per 4-minute track
```

This is stored in `audioFeatureCaches[sourceId].featureTracks['spectrogram'].data` and is never evicted while the track exists.

With 5 tracks: **~425 MB** for spectrogram data alone.

---

### 3. Undo History Retains Full PCM + Spectrogram on Track Removal

**Location:** `src/state/timeline/commands/removeTracksCommand.ts:61–75`, `src/state/undo/patch-undo.ts:40`

When a track is removed, the undo command captures the full `AudioCacheEntry` (with `AudioBuffer`) and the full `AudioFeatureCache` (with all spectrogram data) into the undo stack payload. The undo stack depth is 100 (hard cap 200).

- Each removed 4-minute track pins ~175–190 MB in the undo stack
- Repeated add/remove operations accumulate multiple full PCM + spectrogram buffers in undo history

---

### 4. Per-Frame Float32Array Allocation in getRawSamples

**Location:** `src/core/scene/plugins/host-api/plugin-api.ts:507–525`

`getRawSamples` always allocates a new `Float32Array` (or calls `.slice()` which also allocates):

```ts
const result = new Float32Array(count); // new allocation every call
return audioBuffer.getChannelData(ch).slice(startSample, endSample); // also copies
```

`AudioWaveformElement._buildRenderObjects` calls this **twice per frame** (L + R channels). At `sampleCount = 4096` and 10 waveform elements at 60 fps:

- 60 × 10 × 2 × (4096 × 4 bytes) = **~18 MB/s** of Float32Array allocation pressure

---

### 5. Waveform Display Pipeline Allocates ~10 Arrays Per Frame

**Location:** `src/core/scene/elements/audio-displays/audio-waveform.ts:634–688`

After fetching the raw samples, the display pipeline creates a chain of intermediate `number[]` arrays (each up to 4096 or `width` elements) through: `rawToNumberArray` → `computeRawMid/Side` → `normalizeForDisplay` → `upsampleLinear`/`downsampleAveraged` → `applyDamp` → `applyGain` → `applySideSelection` → `buildPolylinePoints`.

Per frame per waveform element: ~**160–250 KB** of short-lived heap allocation, all immediately garbage.

---

### 6. Serialization Doubles Spectrogram Memory During Save

**Location:** `src/audio/features/audioFeatureAnalysis.ts:242–249, 394–395`

`serializeTypedArray` converts the spectrogram `Float32Array` to a plain `number[]` via `Array.from`. A `Float32Array` uses 4 bytes/element; a `number[]` in V8 uses 8 bytes/element. During save, this creates a temporary ~170 MB `number[]` per track while the original Float32Array is still live.

With 5 tracks saving simultaneously: **~850 MB temporary spike** on top of the baseline.

---

### 7. Per-Frame Allocations in tempoAlignedViewAdapter

**Location:** `src/audio/features/tempoAlignedViewAdapter.ts:305–316, 593–619`

The hot path called every frame by all spectrum elements allocates new `number[]` objects at several points: `interpolateVectors` returns a new `number[1025]` per call, `buildFrameVectorInfo` creates new `number[][]` per frame, and the smoothing path calls `getVectorInfo` for `2*radius+1` frames, each producing new allocations.

At 60 fps with 10 spectrum elements reading a 1025-bin spectrogram: **~4.8 MB/s** from `interpolateVectors` alone.

The `featureSampleCache` in `audioFeatureUtils.ts` (MAX_FEATURE_CACHE_ENTRIES = 128) does deduplicate same-tick reads, but the cache fills and evicts rapidly at 60 fps.

---

### 8. Duplicate Peaks Storage Per Track

**Location:** `src/audio/audioTypes.ts:25–28`, `src/audio/features/calculators/peaksCalculator.ts:69–70`

For each track, peaks data exists in two separate independent allocations:

- `audioCache[id].waveform.channelPeaks`: Float32Array, ~20 KB (timeline preview)
- `audioFeatureCaches[id].featureTracks['peaks'].data`: `{min, max}` Float32Array pair, ~2.6 MB (per-channel min/max at 8× oversample)

These serve overlapping purposes and neither is derived from the other.

---

### 9. Feature Subscription Controller: Leak Risk for Non-Disposing Elements

**Location:** `src/audio/features/featureSubscriptionController.ts:36–38`

Controllers are held in a module-level `Set<FeatureSubscriptionController>` (strong refs). They are removed only when `releaseFeatureSubscriptionController(element)` is called via `dispose()`. Any element (especially third-party plugins) that does not call `dispose()` leaks its controller and the element reference indefinitely.

---

## Proposals

### P1 — Release Compressed Bytes After Save (High Impact, Low Risk)

**Targets Finding 1**

After a project save/export completes, null out `originalFile.bytes` in the audio cache entry (or replace the `Uint8Array` with just a content hash or filename for identity). Only re-read the file from disk if a new export is triggered.

If the export path cannot re-read from disk (e.g. the File object is gone after the session), consider storing compressed bytes in IndexedDB or the project zip directly rather than in the Zustand store. The heap is not the right place for multi-megabyte blobs that are only needed infrequently.

**Estimated saving:** 5–20 MB per track during normal playback.

---

### P2 — Windowed/On-Demand Spectrogram Instead of Full Precompute (High Impact, Moderate Complexity)

**Targets Finding 2**

Instead of computing and holding the entire spectrogram in memory, compute spectrogram frames on demand with a bounded sliding cache (e.g. ±10 seconds around the current playhead, ~few MB total). When elements request spectrogram data at a given time, compute the relevant window if not cached and evict frames outside the window.

Alternatively, as a simpler intermediate step:

- Reduce the default `windowSize` from 2048 to 1024 (halves the buffer to ~42 MB per track)
- Reduce `binCount` by using mel-scale binning before storage (e.g. 256 mel bins instead of 1025 linear FFT bins) — reduces to ~5 MB per track with negligible quality loss for most visual use cases

**Estimated saving:** 42–80 MB per 4-minute track (up to ~400 MB with 5 tracks).

---

### P3 — Store Only Track Metadata in Undo for Audio Track Removal (High Impact, Low Risk)

**Targets Finding 3**

The undo entry for "remove audio track" should store:

- Track configuration and metadata (track ID, name, position, automation data, etc.)
- `sourceId` reference (string)
- Possibly the `originalFile.bytes` reference (pointer, not a copy)

It should **not** store the decoded `AudioBuffer` or the spectrogram `Float32Array`. On undo, if the audio source is still in the cache, reuse it. If not (e.g. it was GC'd), re-decode from `originalFile.bytes` (which itself could be re-read from the project zip).

Re-decoding a 4-minute audio file takes ~200–500 ms — acceptable for an undo operation.

**Estimated saving:** Up to 175 MB freed per removed 4-minute track from the undo stack.

---

### P4 — Pre-Allocate Reuse Buffers in getRawSamples (Medium Impact, Medium Complexity)

**Targets Finding 4**

Introduce a per-track reusable scratch buffer for raw sample reads. `getRawSamples` can write into this buffer instead of allocating a new `Float32Array` each call. The caller (waveform element) owns the buffer from its initialization and passes it in:

```ts
// In AudioWaveformElement init:
this._leftScratch = new Float32Array(MAX_SAMPLE_COUNT);
this._rightScratch = new Float32Array(MAX_SAMPLE_COUNT);

// In getRawSamples (modified signature):
getRawSamples(options, outputBuffer?: Float32Array): Float32Array
// If outputBuffer provided: write into it and return a view, no allocation
```

This eliminates ~18 MB/s of Float32Array GC pressure with 10 waveform elements.

Alternatively, if modifying the API is undesirable, cache the last-returned buffer and only reallocate when the sample count changes.

---

### P5 — Reuse Display Pipeline Buffers in AudioWaveformElement (Medium Impact, Low Risk)

**Targets Finding 5**

Pre-allocate fixed-size scratch `number[]` or `Float32Array` buffers in the waveform element for each stage of the display pipeline, and mutate them in-place rather than returning new arrays. The pipeline functions (`applyDamp`, `applyGain`, etc.) should accept an `out` parameter.

Since `_buildRenderObjects` runs at 60 fps, eliminating ~200 KB/frame of short-lived allocation saves significant GC overhead:

```ts
// Instead of:
const damped = applyDamp(normalized, this.props.damp.value, this._prevLeft);
// Use:
applyDamp(normalized, this.props.damp.value, this._prevLeft, this._dampScratch);
```

---

### P6 — Use Typed Array Streaming Serialization During Save (Medium Impact, Medium Complexity)

**Targets Finding 6**

Replace `Array.from(float32Array)` with a streaming approach during save that encodes the Float32Array to base64 directly without creating an intermediate `number[]`:

```ts
function serializeFloat32AsBase64(arr: Float32Array): string {
    return btoa(String.fromCharCode(...new Uint8Array(arr.buffer)));
    // Or use a chunked approach for large arrays
}
```

This avoids the 2× memory spike during save. For the spectrogram (~84.5 MB), this is the difference between a ~170 MB transient allocation and ~113 MB (base64 string is 4/3 size of binary, but far less than a full number[]).

Alternatively, consider not serializing the spectrogram at all — it can be recomputed from the AudioBuffer on load (which is already done when loading a project).

---

### P7 — Increase featureSampleCache Size and Key Stability (Low-Medium Impact, Low Risk)

**Targets Finding 7**

The `featureSampleCache` at `MAX_FEATURE_CACHE_ENTRIES = 128` is the main deduplication mechanism for same-tick reads across multiple elements. If more than 128 unique (tick, descriptor, options) combinations are queried in a short window, entries evict and later elements pay re-allocation costs.

Options:

- Increase to 512–1024 entries (cache overhead is small relative to the allocations it avoids)
- Change the cache key strategy so all elements reading the same track/feature at the same tick share one entry regardless of other options differences

Additionally, consider mutable result objects (pool or preallocate `TempoAlignedFrameSample`) so the per-frame return object doesn't require heap allocation.

---

### P8 — Unify Peaks Storage (Low Impact, Code Quality)

**Targets Finding 8**

Remove `audioCache[id].waveform.channelPeaks` and replace the timeline waveform preview renderer to read from `audioFeatureCaches[id].featureTracks['peaks'].data` instead. This eliminates ~20 KB per track and removes a conceptual duplication.

---

### P9 — Spectrogram Mel-Scale Downsampling Before Storage (High Impact, Low Risk)

**Targets Finding 2, alternative approach**

Most audio-reactive visual effects do not need full linear FFT bins — human-perceptual mel scale with 128–256 bands is more than sufficient for visual use cases and matches how most spectrum visualisers work. Post-processing the spectrogram to mel scale before storage:

- 1025 linear bins → 256 mel bins = **~4× reduction** in spectrogram size
- ~84 MB → ~21 MB per 4-minute track
- With 5 tracks: ~425 MB → ~105 MB

This change is transparent to most element authors since mel-scale mapping is perceptually more intuitive anyway. The main downside is that elements needing precise Hz-domain analysis (rare) would require a separate feature type.

---

## Priority Order

| Priority | Proposal                                           | Estimated Saving           | Effort |
| -------- | -------------------------------------------------- | -------------------------- | ------ |
| 1        | **P3** — Trim undo history for audio track removal | 175 MB per removed track   | Low    |
| 2        | **P1** — Release compressed bytes after save       | 5–20 MB per track (always) | Low    |
| 3        | **P9** — Mel-scale spectrogram downsampling        | 60 MB per 4-min track      | Medium |
| 4        | **P2** — Windowed on-demand spectrogram            | 42–84 MB per track         | High   |
| 5        | **P4** — Reuse buffers in getRawSamples            | ~18 MB/s GC pressure       | Medium |
| 6        | **P5** — Reuse display pipeline buffers            | ~200 KB/frame GC           | Medium |
| 7        | **P6** — Streaming serialization for save          | ~850 MB save spike         | Medium |
| 8        | **P7** — Larger featureSampleCache                 | ~5 MB/s GC pressure        | Low    |
| 9        | **P8** — Unify peaks storage                       | ~20 KB per track           | Low    |

P3 and P1 are the highest-value, lowest-risk changes and should be addressed first. P9 (mel-scale) is the most impactful structural change if full spectrogram detail is not required by existing elements.
