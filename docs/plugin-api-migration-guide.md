# Plugin API Migration Guide

_Last Updated: 5 March 2026_

This guide migrates plugin-facing code from internal host imports to the stable public Plugin API.

## Rule 1: Do Not Import App Internals

Plugin and template code must not import internal host modules such as:

- `@state/*`
- `@selectors/*`
- `@audio/features/sceneApi`
- other app-internal state/selectors used only by the host

Use `getPluginHostApi()` and `PLUGIN_CAPABILITIES` from `@core/scene/plugins`.

## Old Pattern → New Pattern

### Timeline note window lookup

Old:

```ts
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@state/selectors/timelineSelectors';

const notes = selectNotesInWindow(useTimelineStore.getState(), {
    trackIds: [trackId],
    startSec,
    endSec,
});
```

New:

```ts
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@core/scene/plugins';

const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
const notes = status === 'ok' && api
    ? api.timeline.selectNotesInWindow({ trackIds: [trackId], startSec, endSec })
    : [];
```

### Audio feature sampling

Old:

```ts
import { getFeatureData } from '@audio/features/sceneApi';

const sample = getFeatureData(this, trackId, 'rms', targetTime, { smoothing: 0.5 });
```

New:

```ts
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@core/scene/plugins';

const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead]);
const sample = status === 'ok' && api
    ? api.audio.sampleFeatureAtTime({
          element: this,
          trackId,
          feature: 'rms',
          time: targetTime,
          samplingOptions: { smoothing: 0.5 },
      })
    : null;
```

### MIDI note number formatting

Old:

```ts
const name = customMidiFormat(noteNumber);
```

New:

```ts
const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.midiUtils]);
const name = status === 'ok' && api ? api.utilities.midiNoteToName(noteNumber) : 'C-1';
```

### Time conversion

Old:

```ts
import { secondsToTicks } from '@state/timelineTime';
```

New:

```ts
const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timingConversion]);
const ticks = status === 'ok' && api ? api.timing.secondsToTicks(seconds) : null;
```

## Migration Checklist

1. Replace internal state/selector imports with `@core/scene/plugins` API access.
2. Request required capabilities with `getPluginHostApi([...])`.
3. Handle all non-`ok` statuses with user-facing fallback rendering.
4. Keep plugin logic working without timeline/audio data when unavailable.
5. Verify plugin behavior in both development and packaged runtime.

## Reference Elements

These built-in elements intentionally use the public API pattern and are safe copy references:

- `midi`:
  - `moving-notes-piano-roll`
  - `time-unit-piano-roll`
  - `notes-played-tracker`
- `audio`:
  - `audio-spectrum`
  - `audio-volume-meter`
  - `audio-waveform`
  - `audio-locked-oscilloscope`

Template references:

- `src/core/scene/elements/_templates/midi-notes.ts`
- `src/core/scene/elements/_templates/audio-reactive.ts`

## Capability/Version Mismatch Troubleshooting

### Timeline unavailable

Symptoms:

- `status` is `missing-capabilities`
- `missingCapabilities` includes `timeline.read`

Action:

- Render fallback text and skip timeline-dependent rendering.

### Audio API unavailable

Symptoms:

- `status` is `missing-capabilities`
- `missingCapabilities` includes `audio.features.read`

Action:

- Use default values (`0`, empty array) and keep rendering stable.

### Unsupported API version

Symptoms:

- `status` is `unsupported-version`

Action:

- Show a clear message (`Plugin API version unsupported`) and avoid host calls.

## Related

- [Plugin API v1](plugin-api-v1.md)
- [Creating Custom Elements](creating-custom-elements.md)