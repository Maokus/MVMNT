# Plugin API v1

_Last Updated: 19 March 2026_

This document defines the stable host API available to plugins at runtime.

## Contract

- Global namespace: `globalThis.MVMNT.plugins`
- API version: `1.0.0`
- Semver compatibility rule for plugins: require `^1.0.0` for v1 hosts
- Capability model: plugins request capabilities and degrade gracefully when unavailable

Use `getPluginHostApi()` from `@mvmnt/plugin-sdk` instead of reading host internals directly.

Plugin code should treat internal aliases (`@core/*`, `@audio/*`, `@state/*`, etc.) as private implementation details.

## Development Setup

`@mvmnt/plugin-sdk` is **not published to npm**. It is a TypeScript path alias defined in the project's `tsconfig.json` that resolves to `src/core/scene/plugins/plugin-sdk.ts` at compile time, and to a live module injected via `PLUGIN_RUNTIME_MODULES` at runtime.

**To author plugins, you must either:**

- Work inside this repository (recommended for first-party elements).
- Build your plugin against the repo as a peer and configure the same path alias in your own `tsconfig.json`:

  ```json
  {
    "paths": {
      "@mvmnt/plugin-sdk": ["path/to/MVMNT/src/core/scene/plugins/plugin-sdk"]
    }
  }
  ```

Do **not** attempt to `npm install @mvmnt/plugin-sdk` — no such package exists. The bundle produced by your build tool must not include the SDK source; the host injects it at load time.

## Capabilities

Exported constants:

- `PLUGIN_CAPABILITIES.timelineRead` → `timeline.read`
- `PLUGIN_CAPABILITIES.audioFeaturesRead` → `audio.features.read`
- `PLUGIN_CAPABILITIES.timingConversion` → `timing.conversion`
- `PLUGIN_CAPABILITIES.midiUtils` → `midi.utils`

`timingConversion` and `midiUtils` are always available. `timelineRead` and `audioFeaturesRead` are conditionally available depending on host resources.

## Access Patterns

### Status-Based (default)

The default pattern returns a resolution object for explicit status handling:

```ts
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

const { api, status, missingCapabilities } = getPluginHostApi([
    PLUGIN_CAPABILITIES.timelineRead,
    PLUGIN_CAPABILITIES.midiUtils,
]);

if (!api || status !== 'ok') {
    const message = status === 'unsupported-version'
        ? 'Plugin API version unsupported'
        : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
            ? 'Timeline API unavailable (requires timeline.read)'
            : 'Plugin host API unavailable';
    return [/* render fallback message object(s) */];
}

const notes = api.timeline.selectNotesInWindow({
    trackIds: ['my-track-id'],
    startSec: 10,
    endSec: 10.1,
});
```

`status` values:

- `ok`
- `missing-host`
- `unsupported-version`
- `missing-capabilities`

### Exception-Based

Pass `{ throwOnError: true }` to get the API directly and use typed exception classes for error discrimination:

```ts
import {
    getPluginHostApi,
    MissingCapabilityError,
    UnsupportedVersionError,
} from '@mvmnt/plugin-sdk';

try {
    const api = getPluginHostApi({ throwOnError: true });
    const notes = api.timeline.selectNotesInWindow({...});
} catch (e) {
    if (e instanceof MissingCapabilityError) {
        console.error(`Capability "${e.capability}" not available`);
    } else if (e instanceof UnsupportedVersionError) {
        console.error('Plugin API version incompatible');
    }
}
```

Available exception classes (all extend `PluginApiError`):

- `MissingHostError` — API not installed
- `UnsupportedVersionError` — Version mismatch
- `MissingCapabilityError` — Required capability unavailable (`e.capability` holds the capability string)

### Direct Capability Imports

Import specific API domains directly. These throw `MissingCapabilityError` if the capability is unavailable:

```ts
import { timelineApi, audioApi, timingApi, utilitiesApi } from '@mvmnt/plugin-sdk';

const notes = timelineApi.selectNotesInWindow({...});
const rms = audioApi.sampleFeatureAtTime({...});
const beats = timingApi.secondsToBeats(10);
const name = utilitiesApi.midiNoteToName(60);
```

### Shorthand Helpers

Top-level convenience functions that degrade silently (return empty/fallback values when unavailable):

```ts
import { selectNotes, sampleAudio, timeToBeats, noteName } from '@mvmnt/plugin-sdk';

const notes = selectNotes(trackIds, startSec, endSec);
const beats = timeToBeats(10);
const label = noteName(60); // 'C4'
```

Available helpers:

- `selectNotes(trackIds, startSec, endSec)` — Select notes in time window
- `sampleAudio(trackId, feature, time, options?)` — Sample feature at a time
- `sampleAudioRange(trackId, feature, startTime, endTime, stepSec, options?)` — Sample feature over a range
- `timeToBeats(seconds)` — Convert seconds to beats
- `beatsToTime(beats)` — Convert beats to seconds
- `timeToTicks(seconds)` — Convert seconds to ticks
- `ticksToTime(ticks)` — Convert ticks to seconds
- `noteName(noteNumber)` — Get MIDI note name (e.g. `'C4'`)

## API Surface

### `timeline`

Requires `timeline.read` capability.

- `getStateSnapshot(): TimelineState | null`
- `selectNotesInWindow({ trackIds, startSec, endSec }): TimelineNoteEvent[]`
- `getTrackById(trackId): Track | null`
- `getTracksByIds(trackIds): Track[]`

```ts
const state = api.timeline.getStateSnapshot();
const bpm = state?.timeline.globalBpm ?? 120;
```

### `audio`

Requires `audio.features.read` capability.

- `sampleFeatureAtTime({ element?, trackId, feature, time, samplingOptions? }): FeatureDataResult | null`
- `sampleFeatureRange({ element?, trackId, feature, startTime, endTime, stepSec, samplingOptions? }): FeatureDataResult[]`

```ts
const rms = api.audio.sampleFeatureAtTime({
    element: this,
    trackId: props.audioTrackId,
    feature: 'rms',
    time: targetTime,
    samplingOptions: { smoothing: props.smoothing },
});

const volume = rms?.values?.[0] ?? 0;
```

### `timing`

Requires `timing.conversion` capability (always available).

- `secondsToTicks(seconds): number | null`
- `ticksToSeconds(ticks): number | null`
- `secondsToBeats(seconds): number | null`
- `beatsToSeconds(beats): number | null`
- `beatsToTicks(beats): number`
- `ticksToBeats(ticks): number`

```ts
const beats = api.timing.secondsToBeats(targetTime) ?? 0;
```

### `utilities`

Requires `midi.utils` capability (always available).

- `midiNoteToName(noteNumber): string`

```ts
const label = api.utilities.midiNoteToName(60); // C4
```

## Capability Discovery

`getAvailableCapabilities()` returns a typed boolean map of all capabilities:

```ts
const { api } = getPluginHostApi();
const available = api.getAvailableCapabilities();

if (available.timelineRead) {
    // Show timeline-dependent UI
} else {
    // Show fallback UI
}
```

The map shape matches the keys of `PLUGIN_CAPABILITIES`:

```ts
{
    timelineRead: boolean;
    audioFeaturesRead: boolean;
    timingConversion: boolean;
    midiUtils: boolean;
}
```

## Error Hook

Register a single handler to observe all capability errors emitted by the direct capability imports (`timelineApi`, `audioApi`, etc.):

```ts
const { api } = getPluginHostApi();

if (api) {
    api.onError((error, capability) => {
        console.warn(`Capability ${capability} unavailable: ${error.message}`);
    });
}
```

## Compatibility

- Same major version (`1.x.x`) is backward-compatible for existing methods.
- New methods/capabilities are additive in minor releases.
- Breaking changes require a major version bump.
- Plugins should always use `getPluginHostApi()` and handle non-`ok` statuses.

## Troubleshooting

### `status === 'missing-host'`

Host API was not installed into `globalThis.MVMNT.plugins`.

Check:

- App bootstrap calls `installPluginHostApi(...)`.
- Plugin is running inside an MVMNT runtime (not a standalone harness).

### `status === 'unsupported-version'`

Plugin requires a different major API version.

Check:

- Host `apiVersion` and plugin expectations.
- Version range logic in plugin (`^1.0.0` for v1).

### `status === 'missing-capabilities'`

Host exists but specific capabilities are unavailable.

Check:

- Requested capabilities list.
- Fallback logic for unavailable domains (timeline/audio).
- `missingCapabilities` to drive user-facing error text.

## Related

- [Plugin API Migration Guide](plugin-api-migration-guide.md)
- [Creating Custom Elements](creating-custom-elements.md)
- [Runtime Plugin Loading API](runtime-plugin-loading.md)
