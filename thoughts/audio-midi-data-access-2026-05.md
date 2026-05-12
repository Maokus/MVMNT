# Audio, MIDI, and Feature Data Access — Reference Guide

## Overview

There are three separate data domains: **MIDI/timeline notes**, **raw PCM audio**, and **computed audio features** (pre-analysed signals like peaks, spectrum, RMS). Each domain has its own access path and performance characteristics.

---

## MIDI / Timeline Data

Queries the Zustand timeline store. All functions accept optional `trackIds` and time-window constraints.

### Shortcut functions (recommended for simple cases)

Import from `@mvmnt/plugin-sdk`:

```ts
import { selectNotes, selectAllNotes, getNoteRange, selectCC, getSustainState } from '@mvmnt/plugin-sdk';

const notes = selectNotes(['track-1'], startSec, endSec);
const all = selectAllNotes(startSec, endSec);
const range = getNoteRange({ trackIds: ['track-1'] }); // { min, max } | null
const cc = selectCC({ startSec, endSec, controller: 64 });
const pedal = getSustainState({ timeSec: t });
```

Returns safe defaults (empty arrays, null) when the timeline API is unavailable.

### Direct host API (when you need capability negotiation or the full state snapshot)

```ts
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
if (api && status === 'ok') {
    const notes = api.timeline.selectNotesInWindow({ trackIds, startSec, endSec });
    const allNotes = api.timeline.selectAllNotesInWindow({ startSec, endSec });
    const distinct = api.timeline.selectDistinctNoteNumbers();
    const snapshot = api.timeline.getStateSnapshot();
}
```

**All timeline queries are pure reads of pre-existing store state.** There is no background fetch; notes are available as soon as the MIDI file is loaded.

---

## Raw PCM Audio

Slices of decoded audio buffers — suitable for oscilloscope views. Window size is capped at `MAX_RAW_SAMPLES` (8192 samples). For large time ranges, use the feature pipeline instead.

### Access path

Requires `PLUGIN_CAPABILITIES.audioRawRead`. Use `getRequiredPluginApi` or `getPluginHostApi`:

```ts
import { getRequiredPluginApi, PLUGIN_CAPABILITIES, MAX_RAW_SAMPLES } from '@mvmnt/plugin-sdk';

const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioRawRead]);
if (!host.ok) return;

// Determine window from sample count + sample rate
const sampleRate = host.api.audio.getSampleRate({ trackId }); // number | null
const windowSec = sampleCount / sampleRate;
const leftRaw = host.api.audio.getRawSamples({ trackId, startSec, endSec, channel: 'left' }); // Float32Array | null
const rightRaw = host.api.audio.getRawSamples({ trackId, startSec, endSec, channel: 'right' }); // Float32Array | null

// Quick RMS amplitude without PCM (no MAX_RAW_SAMPLES limit)
const rms = host.api.audio.getRmsInWindow({ trackId, startSec, endSec }); // Float32Array | null — [rmsL, rmsR] for stereo
```

`getRawSamples` returns `null` if the window exceeds `MAX_RAW_SAMPLES`. `getRmsInWindow` has no such limit and is efficient for large windows.

---

## Audio Feature Data

Pre-computed features — peaks, spectrum, RMS envelopes, custom calculators. The feature pipeline caches results; elements subscribe to features so the analyser knows what to pre-compute.

### getFeatureDataRange (preferred for multi-frame range sampling)

**Import from `@mvmnt/plugin-sdk` (re-exported from `@audio/features/sceneApi`)**

Resolves the descriptor and subscription controller **once**, then loops `sampleFeatureFrame` internally. More efficient than any approach that re-resolves the descriptor per frame.

```ts
import { getFeatureDataRange } from '@mvmnt/plugin-sdk';

const samples: FeatureDataResult[] = getFeatureDataRange(
    this, // element reference — manages subscription lifecycle
    trackId, // string | null | undefined — returns [] on null
    PEAKS_DESCRIPTOR,
    startTime,
    endTime,
    stepSec,
    samplingOptions // optional
);
```

Returns `[]` when `trackId` is null/invalid, `stepSec <= 0`, or `endTime < startTime`. No capability check — call it directly after verifying track selection.

### host.api.audio.sampleFeatureRange (proxy layer)

Identical semantics to `getFeatureDataRange`, but goes through the plugin host API proxy:

```ts
// getRequiredPluginApi checks capability and exposes host.api
const samples = host.api.audio.sampleFeatureRange({
    element: this,
    trackId,
    feature: PEAKS_DESCRIPTOR,
    startTime,
    endTime,
    stepSec,
});
```

Internally delegates to `getFeatureDataRange(element ?? DEFAULT_AUDIO_ELEMENT_REF, ...)`. The extra layer adds a `hasAudioFeaturesRead` guard and a default element ref fallback. **Use `getFeatureDataRange` directly for better performance and less indirection.**

### sampleAudioRange (shortcut — no element tracking)

Convenience wrapper that does not require a prior capability check:

```ts
import { sampleAudioRange } from '@mvmnt/plugin-sdk';

const samples = sampleAudioRange(trackId, feature, startTime, endTime, stepSec);
```

Returns `[]` when the API is unavailable. Does **not** pass an element reference, so the subscription controller uses `DEFAULT_AUDIO_ELEMENT_REF` — subscriptions are not tied to a specific element lifecycle. Use for simple one-off samples; prefer `getFeatureDataRange(this, ...)` in SceneElement subclasses to get correct subscription management.

### getFeatureData / sampleAudio (single-frame)

For single-point sampling (current time only):

```ts
import { sampleAudio } from '@mvmnt/plugin-sdk'; // shortcut, no element
import { getFeatureData } from '@audio/features/sceneApi'; // direct, with element
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk'; // via host API
```

---

## Decision Guide

| Situation                             | Use                                                              |
| ------------------------------------- | ---------------------------------------------------------------- |
| Query MIDI notes by time window       | `selectNotes` / `selectAllNotes` shortcuts                       |
| Need full timeline state snapshot     | `api.timeline.getStateSnapshot()` via `getPluginHostApi`         |
| PCM oscilloscope (≤8192 samples)      | `host.api.audio.getRawSamples` via `audioRawRead`                |
| RMS over large window                 | `host.api.audio.getRmsInWindow` via `audioRawRead`               |
| Feature range in a SceneElement       | `getFeatureDataRange(this, ...)` — fastest, correct subscription |
| Feature range without element ref     | `sampleAudioRange(...)` — subscription uses default ref          |
| Capability guard + "not available" UI | `getRequiredPluginApi` or `getPluginHostApi` before data calls   |
| One-off single-frame feature          | `sampleAudio(...)` shortcut                                      |

---

## Capability tokens

| Capability                                     | Domain                              |
| ---------------------------------------------- | ----------------------------------- |
| `PLUGIN_CAPABILITIES.timelineRead`             | MIDI notes, CC, timing state        |
| `PLUGIN_CAPABILITIES.audioFeaturesRead`        | Pre-computed feature pipeline       |
| `PLUGIN_CAPABILITIES.audioRawRead`             | Raw PCM + RMS                       |
| `PLUGIN_CAPABILITIES.timingConversion`         | beats↔seconds↔ticks conversion      |
| `PLUGIN_CAPABILITIES.audioCalculatorsRegister` | Register custom feature calculators |
