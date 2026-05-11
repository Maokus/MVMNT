# Raw Audio Scene Access — Design Plan (May 2026)

## Motivation

The existing audio pipeline requires all per-element computations to be registered as a named
`AudioFeatureCalculator`, pre-analysed in the background, stored in a keyed cache, and then
sampled at render time via `api.audio.sampleFeatureAtTime()` / `sampleFeatureRange()`.

For heavy, multi-frame features like the spectrogram this is exactly right — analysis happens
once and the cache pays for itself many times over.

For **lightweight, per-frame reads** like:

- Audio volume meter (RMS over a short window at current time)
- Audio waveform (min/max amplitude over a visible time window)

...the pre-analysis requirement is disproportionate. These elements currently require a full
background pass to produce a feature track that could be re-computed from raw samples in
microseconds at render time. The MIDI system avoided this same trap: MIDI notes are fetched
on demand from the timeline store via `api.timeline.selectNotesInWindow()` rather than being
pre-computed into a separate cache.

This document describes a plan to expose a similar "raw audio" API surface so elements can
pull PCM samples directly, without going through the calculator / feature pipeline.

---

## MIDI Analogy

```
MIDI (current)                          Audio (proposed)
──────────────────────────────────────  ──────────────────────────────────────────
api.timeline.selectNotesInWindow({      api.audio.getRawSamples({
    trackIds: [id],                         trackId: id,
    startSec,                               startSec,
    endSec,                                 endSec,
})                                          channel?: 'left' | 'right' | 'mono',
→ TimelineNoteEvent[]                   })
                                        → Float32Array | null
```

MIDI notes are stored in the timeline store (already in memory, already parsed). Raw audio PCM
is stored in a decoded `AudioBuffer` on the timeline track. Both are already in memory at render
time — neither requires a background pass.

---

## Proposed API Shape

### New capability: `audioRawRead`

Add `PLUGIN_CAPABILITIES.audioRawRead` alongside the existing `audioFeaturesRead`.

```typescript
// plugin-api.ts
interface PluginAudioRawApi {
    /**
     * Return a view of the decoded PCM data for a given time window.
     * Returns null if the track is not loaded or the window is invalid.
     *
     * channel: 'left' | 'right' | 0 | 1 | ... — which channel to return.
     *          'mono' (default) averages all channels.
     * maxSamples: if specified, the result is downsampled to at most this many points.
     *             When the window contains more raw samples than maxSamples, a min/max
     *             pair per bucket is returned instead (see sampleMode).
     * sampleMode: 'raw' (default) | 'minmax' — how to downsample.
     *             'raw' → single value per bucket (average).
     *             'minmax' → interleaved [min, max, min, max, ...] for waveform rendering.
     */
    getRawSamples(opts: {
        trackId: string;
        startSec: number;
        endSec: number;
        channel?: 'mono' | 'left' | 'right' | number;
        maxSamples?: number;
        sampleMode?: 'raw' | 'minmax';
    }): Float32Array | null;

    /**
     * Compute RMS amplitude over a time window on demand, without a pre-computed feature.
     * For stereo: returns [rmsL, rmsR]. For mono: returns [rms].
     */
    getRmsInWindow(opts: { trackId: string; startSec: number; endSec: number }): Float32Array | null;
}
```

### Usage in a scene element

```typescript
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.audioRawRead]);
if (api && status === 'ok') {
    const windowSec = 0.05; // 50 ms window around current time
    const samples = api.audio.getRawSamples({
        trackId,
        startSec: effectiveTime - windowSec / 2,
        endSec: effectiveTime + windowSec / 2,
        channel: 'left',
        maxSamples: width, // one sample per display pixel
        sampleMode: 'minmax',
    });
}
```

---

## Design Decisions to Make

### 1. Where does the raw AudioBuffer live at render time?

Currently `AudioBuffer` objects are accessed only inside the calculator context (background
analysis). At render time the decoded buffer is somewhere in the audio system state.

**Options:**

- A. Store a reference to the decoded `AudioBuffer` on the `AudioTrackState` in the timeline
  store, accessible at render time. (Already done for playback; need to confirm availability
  for the render path.)
- B. Re-decode on demand (expensive, wrong).
- C. Pre-slice the buffer into a separate map keyed by trackId at decode time.

**Recommendation:** Option A — confirm that the decoded `AudioBuffer` is already reachable from
the timeline state the API server reads. If it is, no new infrastructure is needed beyond the
API method.

**This is the single most critical decision** before implementation can begin. If the buffer is
not available on the timeline state at render time, the entire approach needs architectural work.

### 2. Downsampling strategy

The raw buffer for a 3-minute song at 44100 Hz is ~8 million samples. Returning that to a
scene element every frame is not acceptable.

The API should enforce a `maxSamples` cap:

- If unset, hard-cap at a reasonable default (e.g., 4096).
- For waveform rendering with `sampleMode: 'minmax'`, return interleaved [min, max] per bucket
  so the element can draw filled waveforms without seeing every sample.

**Decision:** Should `maxSamples` be required or optional with a default?

**Recommendation:** Optional with a sane default (4096) — mirrors the spirit of the MIDI API
which returns all notes in the window without a count cap (MIDI data is inherently sparse).

### 3. Return type: view vs copy

For performance, returning a slice (view) of the underlying `Float32Array` avoids allocation.
But views expose the underlying buffer to mutation by element code, which is unsafe.

**Options:**

- A. Return a copy (safe, small allocation cost for small windows).
- B. Return a view marked as read-only via TypeScript (`Readonly<Float32Array>`).
- C. Return a view, document as read-only, trust element code.

**Recommendation:** Option A for small windows (< ~8000 samples after downsampling); the copy
cost is negligible relative to render overhead. For larger slices the downsampling would reduce
the output anyway.

### 4. Thread safety

`AudioBuffer` is not transferable and cannot be shared across workers. At render time we are
on the main thread, so direct access is safe as long as the buffer is not being mutated.

**Decision:** Is the decoded buffer mutated anywhere after decode? If decoders write into a
shared buffer, reads during render could race.

**Recommendation:** Confirm decode is write-once. If true, no locking is needed.

### 5. Should lightweight elements migrate to raw access, or keep their feature registrations?

Two sub-questions:

- Should `audio-waveform` and `audio-volume-meter` drop their `registerFeatureRequirements`
  calls and use raw access exclusively?
- Or should raw access be additive, with the feature pipeline remaining for heavier use cases?

**Recommendation:** Keep the feature pipeline for elements that want it (it's opt-in, no cost
if not registered). Offer raw access as an alternative for elements where background analysis
is overkill. Elements can choose one or the other, or both for different properties.

For the two named elements:

- `audio-volume-meter`: excellent candidate for raw access — single RMS value from a tiny
  window (~50 ms) per frame. No need to cache the full track.
- `audio-waveform`: good candidate if the window shown is short (< a few seconds). For very
  long visible windows, the cached waveform feature (min/max frames) is still more efficient.
  Could use raw access for `sampleMode: 'minmax'` up to some threshold, fall back to cached.

### 6. `getRmsInWindow` as a convenience or remove in favour of `getRawSamples`?

A dedicated `getRmsInWindow` avoids the element needing to compute RMS from raw samples itself.
But it duplicates logic. Alternatively, expose `getRawSamples` only and let elements compute.

**Decision:** Include `getRmsInWindow` as a convenience for the volume meter case. It is trivial
to implement (just a loop over the slice) and avoids every element author needing to know the
RMS formula.

### 7. API namespace

Currently `api.audio` exposes `sampleFeatureAtTime` and `sampleFeatureRange` (feature-cache
reads). Raw access could live on the same `api.audio` object, or on a new `api.audio.raw`
sub-object to signal the different contract.

**Recommendation:** `api.audio.getRawSamples(...)` on the same object — consistent with the
MIDI pattern (`api.timeline.selectNotesInWindow`) and keeps the namespace flat.

---

## Implementation Steps (once design decisions are resolved)

1. **Confirm AudioBuffer availability** — grep the timeline store and audio state for where the
   decoded buffer is held at render time. If not on the state object, expose it.

2. **Add `audioRawRead` capability** — add to `PLUGIN_CAPABILITIES`, add interface, implement
   in `createPluginHostApi()`, create proxy in `plugin-sdk-capabilities.ts`, export from
   `plugin-sdk.ts`, update `_verifyCapabilityExports` map.

3. **Implement `getRawSamples`** — access the buffer from the timeline state, slice + downsample,
   return a copy.

4. **Implement `getRmsInWindow`** — slice the buffer for the given window, compute RMS per channel.

5. **Migrate `audio-volume-meter`** — replace feature-cache read with `getRmsInWindow`. Remove
   `registerFeatureRequirements` for `rms` from this element.

6. **Optionally migrate `audio-waveform`** — evaluate whether raw `minmax` access is simpler than
   the current waveform feature for the common (short-window) case.

---

## What NOT to do

- Do not expose the raw `AudioBuffer` object itself to plugin code — too large, too easy to
  misuse, leaks internal types.
- Do not make the downsampling mandatory in a way that prevents integer-pixel-aligned access
  (some elements need control over bucket boundaries).
- Do not remove the feature calculator pipeline — it is still the right tool for spectrograms,
  pitch detection, and anything that needs a full-file pass.
