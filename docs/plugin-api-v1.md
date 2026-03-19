# Plugin API v1

_Last Updated: 5 March 2026_

This document defines the stable host API available to plugins at runtime.

## Contract

- Global namespace: `globalThis.MVMNT.plugins`
- API version: `1.0.0`
- Semver compatibility rule for plugins: require `^1.0.0` for v1 hosts
- Capability model: plugins request capabilities and degrade gracefully when unavailable

Use `getPluginHostApi(requiredCapabilities?)` from `@mvmnt/plugin-sdk` instead of reading host internals directl.

Plugin code should treat internal aliases (`@core/*`, `@audio/*`, `@state/*`, etc.) as private implementation details.

## Capabilities

Exported constants:

- `PLUGIN_CAPABILITIES.timelineRead` → `timeline.read`
- `PLUGIN_CAPABILITIES.audioFeaturesRead` → `audio.features.read`
- `PLUGIN_CAPABILITIES.timingConversion` → `timing.conversion`
- `PLUGIN_CAPABILITIES.midiUtils` → `midi.utils`

## Access Pattern

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

## API Surface

### `timeline`

- `getStateSnapshot(): TimelineState | null`
- `selectNotesInWindow({ trackIds, startSec, endSec }): TimelineNoteEvent[]`
- `getTrackById(trackId): Track | null`
- `getTracksByIds(trackIds): Track[]`

Example:

```ts
const state = api.timeline.getStateSnapshot();
const bpm = state?.timeline.globalBpm ?? 120;
```

### `audio`

- `sampleFeatureAtTime({ element?, trackId, feature, time, samplingOptions? }): FeatureDataResult | null`
- `sampleFeatureRange({ element?, trackId, feature, startTime, endTime, stepSec, samplingOptions? }): FeatureDataResult[]`

Example:

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

- `secondsToTicks(seconds): number | null`
- `ticksToSeconds(ticks): number | null`
- `secondsToBeats(seconds): number | null`
- `beatsToSeconds(beats): number | null`
- `beatsToTicks(beats): number`
- `ticksToBeats(ticks): number`

Example:

```ts
const beats = api.timing.secondsToBeats(targetTime) ?? 0;
```

### `utilities`

- `midiNoteToName(noteNumber): string`

Example:

```ts
const label = api.utilities.midiNoteToName(60); // C4
```

## Simplified Access Patterns (v1.2+)

In addition to the status-based pattern above, the SDK provides several simplified access patterns for common use cases.

### Shorthand Methods (3B)

Top-level convenience functions reduce nesting and improve readability:

```ts
import {
    selectNotes,
    sampleAudio,
    timeToBeats,
    noteName,
} from '@mvmnt/plugin-sdk';

// Instead of:
const notes = api.timeline.selectNotesInWindow({ trackIds, startSec, endSec });
// Write:
const notes = selectNotes(trackIds, startSec, endSec);

// Instead of:
const beats = api.timing.secondsToBeats(10) ?? 0;
// Write:
const beats = timeToBeats(10);

// Works great in templates:
const label = noteName(60); // 'C4'
```

Available shortcuts:
- `selectNotes(trackIds, startSec, endSec)` - Select notes in time window
- `sampleAudio(trackId, feature, time, options?)` - Sample at a time
- `sampleAudioRange(trackId, feature, startTime, endTime, stepSec, options?)` - Sample range
- `timeToBeats(seconds)` - Convert seconds to beats
- `beatsToTime(beats)` - Convert beats to seconds
- `timeToTicks(seconds)` - Convert seconds to ticks
- `ticksToTime(ticks)` - Convert ticks to seconds
- `noteName(noteNumber)` - Get MIDI note name

### Direct Capability Imports (3A)

Import specific API domains directly for clearer dependency declaration:

```ts
import { timelineApi, audioApi, timingApi, utilitiesApi } from '@mvmnt/plugin-sdk';

// These throw if the capability is unavailable:
const notes = timelineApi.selectNotesInWindow({...});
const rms = audioApi.sampleFeatureAtTime({...});
const beats = timingApi.secondsToBeats(10);
const name = utilitiesApi.midiNoteToName(60);
```

**Error handling:** These throw `MissingCapabilityError` if the capability is not available. Use try/catch for explicit error handling:

```ts
try {
    const notes = timelineApi.selectNotesInWindow({...});
} catch (e) {
    if (e instanceof MissingCapabilityError) {
        // Handle gracefully
    }
}
```

### Capability Discovery (8B)

Check which capabilities are available before using them:

```ts
const { api } = getPluginHostApi();
const available = api.getAvailableCapabilities();

if (available.includes(PLUGIN_CAPABILITIES.timelineRead)) {
    // Show timeline-dependent UI
} else {
    // Show fallback UI
}
```

### Unified Error Handling (2C)

Register a single error handler for all capability errors:

```ts
const { api } = getPluginHostApi();

if (api) {
    api.onError((error, capability) => {
        console.warn(`Capability ${capability} unavailable: ${error.message}`);
    });
}
```

### Exception-Based Error Handling (2A)

Use exceptions instead of status codes for more idiomatic error handling:

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

Available exception classes:
- `PluginApiError` - Base error class
- `MissingHostError` - API not installed
- `UnsupportedVersionError` - Version mismatch
- `MissingCapabilityError` - Required capability unavailable



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