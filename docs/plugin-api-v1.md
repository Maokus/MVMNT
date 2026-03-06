# Plugin API v1

_Last Updated: 5 March 2026_

This document defines the stable host API available to plugins at runtime.

## Contract

- Global namespace: `globalThis.MVMNT.plugins`
- API version: `1.0.0`
- Semver compatibility rule for plugins: require `^1.0.0` for v1 hosts
- Capability model: plugins request capabilities and degrade gracefully when unavailable

Use `getPluginHostApi(requiredCapabilities?)` from `@core/scene/plugins` instead of reading host internals directly.

## Capabilities

Exported constants:

- `PLUGIN_CAPABILITIES.timelineRead` → `timeline.read`
- `PLUGIN_CAPABILITIES.audioFeaturesRead` → `audio.features.read`
- `PLUGIN_CAPABILITIES.timingConversion` → `timing.conversion`
- `PLUGIN_CAPABILITIES.midiUtils` → `midi.utils`

## Access Pattern

```ts
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@core/scene/plugins';

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

## Compatibility Rules

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