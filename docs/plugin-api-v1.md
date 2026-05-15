# Plugin API v1

_Last Updated: 16 April 2026_

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
- Build your plugin against the repo as a peer and configure the same path aliases in your own `tsconfig.json`:

    ```json
    {
        "paths": {
            "@mvmnt/plugin-sdk": ["path/to/MVMNT/src/core/scene/plugins/plugin-sdk"],
            "@mvmnt/plugin-sdk/*": ["path/to/MVMNT/src/core/scene/plugins/sdk/*"]
        }
    }
    ```

Do **not** attempt to `npm install @mvmnt/plugin-sdk` — no such package exists. The bundle produced by your build tool must not include the SDK source; the host injects it at load time.

## SDK Submodules

The SDK is organised into domain submodules. You can import everything from the top-level barrel, or import only what you need from a specific submodule for clarity:

```ts
// Top-level barrel — always works, includes everything
import { selectNotes, clamp, remap, easings } from '@mvmnt/plugin-sdk';

// Domain submodule — explicit and tree-shake friendly
import { clamp, remap, easings, FloatCurve } from '@mvmnt/plugin-sdk/animation';
import { selectNotes, timelineApi } from '@mvmnt/plugin-sdk/timeline';
import { audioApi, sampleAudio } from '@mvmnt/plugin-sdk/audio';
import { timingApi, beatsToSeconds } from '@mvmnt/plugin-sdk/timing';
import { Rectangle, BezierPath, Arc } from '@mvmnt/plugin-sdk/render';
import { SceneElement, prop } from '@mvmnt/plugin-sdk/scene';
import { getPluginHostApi, PLUGIN_CAPABILITIES, MissingCapabilityError } from '@mvmnt/plugin-sdk/api';
import { withRenderSafety, limitRenderObjects } from '@mvmnt/plugin-sdk/safety';
import { noteName, loadBundledAsset } from '@mvmnt/plugin-sdk/utils';
```

| Submodule   | Contents                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `animation` | `clamp`, `lerp`, `invLerp`, `remap`, `FloatCurve`, `EasingFn`, `easings` (31 named easing functions) |
| `render`    | `Rectangle`, `Text`, `Line`, `Image`, `Arc`, `BezierPath`, `Poly`, `GlowLayer`, `CompositeLayer`, …  |
| `scene`     | `SceneElement`, property descriptors, `prop` factory, `insertElementConfig`, config schema types     |
| `api`       | `PLUGIN_CAPABILITIES`, `getPluginHostApi`, `PluginApiError`, `MissingCapabilityError`, …             |
| `timeline`  | `timelineApi`, `selectNotes`, `selectAllNotes`, `getMidiTracks`, `TimelineNoteEvent`, …              |
| `audio`     | `audioApi`, `sampleAudio`, `registerFeatureRequirements`, `FeatureDataResult`, …                     |
| `timing`    | `timingApi`, `timeToBeats`, `beatsToSeconds`, `quantizeSettingToBeats`, …                            |
| `safety`    | `withRenderSafety`, `limitRenderObjects`, `checkCapability`, `PluginSafetyError`                     |
| `utils`     | `noteName`, `groupNotesByPitch`, `loadBundledAsset`, color helpers, font loader                      |

## Capabilities

Exported constants:

- `PLUGIN_CAPABILITIES.timelineRead` → `timeline.read`
- `PLUGIN_CAPABILITIES.audioFeaturesRead` → `audio.features.read`
- `PLUGIN_CAPABILITIES.audioRawRead` → `audio.raw.read`
- `PLUGIN_CAPABILITIES.timingConversion` → `timing.conversion`

`timingConversion` is always available. `timelineRead`, `audioFeaturesRead`, and `audioRawRead` _should_ be available depending on host resources.

## Access Patterns

### Required API (recommended for elements)

`getRequiredPluginApi` returns a discriminated union keyed on `ok`. TypeScript narrows `api` to non-null after the guard, and the `renderFallback()` helper returns `[]` so you can use it inline:

```ts
import { getRequiredPluginApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
if (!host.ok) return host.renderFallback();

const notes = host.api.timeline.selectNotesInWindow({ trackIds: [...], startSec, endSec });
```

The element reference (`this`) is required — it is used for future manifest-driven capability resolution.

### Status-Based (default)

The default pattern returns a resolution object for explicit status handling:

```ts
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

if (!api || status !== 'ok') {
    const message =
        status === 'unsupported-version'
            ? 'Plugin API version unsupported'
            : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
              ? 'Timeline API unavailable (requires timeline.read)'
              : 'Plugin host API unavailable';
    return [
        /* render fallback message object(s) */
    ];
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
import { timelineApi, audioApi, timingApi } from '@mvmnt/plugin-sdk';

const notes = timelineApi.selectNotesInWindow({...});
const rms = audioApi.sampleFeatureAtTime({...});
const beats = timingApi.secondsToBeats(10);
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

- `selectNotes(trackIds, startSec, endSec)` — notes from specific tracks in a window
- `selectAllNotes(startSec, endSec)` — notes from all tracks in a window
- `selectDistinctNotes(args?)` — sorted unique note numbers
- `selectNotesByPitch(note, args?)` — all events for a single pitch
- `getNoteRange(args?)` — `{ min, max }` pitch range, or null
- `getTimelineDuration()` — scene duration in seconds
- `getMidiTracks()` — all MIDI tracks
- `groupNotesByPitch(notes)` — pure utility; groups a note array into a `Map<number, TimelineNoteEvent[]>` sorted by pitch
- `selectCC(args)` — CC events in a window: `{ trackIds?, controller?, startSec, endSec }`
- `getSustainState(args)` — sustain pedal state at a time: `{ trackIds?, timeSec }`
- `sampleAudio(trackId, feature, time, options?)` — sample feature at a time
- `sampleAudioRange(trackId, feature, startTime, endTime, stepSec, options?)` — sample feature over a range
- `timeToBeats(seconds)` — convert seconds to beats
- `beatsToTime(beats)` — convert beats to seconds
- `timeToTicks(seconds)` — convert seconds to ticks
- `ticksToTime(ticks)` — convert ticks to seconds
- `beatToTicks(beats)` — convert beats to ticks
- `ticksToBeat(ticks)` — convert ticks to beats
- `noteName(noteNumber)` — get MIDI note name (e.g. `'C4'`)

## API Surface

### `timeline`

Requires `timeline.read` capability.

- `getStateSnapshot(): TimelineState | null` — raw timeline store state snapshot
- `selectNotesInWindow({ trackIds, startSec, endSec }): TimelineNoteEvent[]` — notes from specific tracks in a time window
- `selectAllNotesInWindow({ startSec, endSec }): TimelineNoteEvent[]` — notes from all MIDI tracks in a time window
- `selectDistinctNoteNumbers(args?): number[]` — sorted unique MIDI note numbers; omit args for all tracks/time
- `selectNotesByPitch(note, args?): TimelineNoteEvent[]` — all events for a single pitch; omit args for all tracks/time
- `getNoteRange(args?): { min: number; max: number } | null` — min/max pitch in the given window; null if no notes
- `getTimelineDuration(): number` — scene duration in seconds
- `getTrackById(trackId): Track | null`
- `getTracksByIds(trackIds): Track[]`
- `getMidiTracks(): Track[]` — all MIDI tracks
- `selectCCInWindow({ trackIds?, controller?, startSec, endSec }): TimelineCCEvent[]` — MIDI CC events in a window, optionally filtered by controller number
- `getSustainStateAtTime({ trackIds?, timeSec }): boolean` — whether sustain pedal (CC 64) is held

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

For range windows (oscilloscope traces, waveform histories), prefer `sampleFeatureRange` over calling `sampleFeatureAtTime` in a loop — it resolves the descriptor and subscription controller once and is significantly faster:

```ts
const frames = host.api.audio.sampleFeatureRange({
    element: this,
    trackId: props.audioTrackId,
    feature: 'waveform',
    startTime: targetTime - windowSec * startOffset,
    endTime: targetTime + windowSec * (1 - startOffset),
    stepSec: windowSec / sampleCount,
});
const values = frames.map((f) => f.values?.[0] ?? 0);
```

### `audioRaw`

Requires `audio.raw.read` capability. Use for short, sample-accurate time windows (oscilloscopes, waveform detail views) where the temporal quantisation of hop-aligned feature frames is unacceptable.

- `getSampleRate({ trackId }): number | null`
- `getRawSamples({ trackId, startSec, endSec, channel }): Float32Array | null`
- `getRmsInWindow({ trackId, startSec, endSec }): [number, number] | null`

`channel` accepts `'left'`, `'right'`, `'mono'`, or a channel index number.

`getRawSamples` returns `null` if the track is not loaded, the window is invalid, or the sample count exceeds `MAX_RAW_SAMPLES` (8192). For longer windows switch to `sampleFeatureRange` with feature `'waveform'`.

```ts
const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioRawRead]);
if (!host.ok) return host.renderFallback();

const sampleRate = host.api.audioRaw.getSampleRate({ trackId });
const left = host.api.audioRaw.getRawSamples({ trackId, startSec, endSec, channel: 'left' });
const right = host.api.audioRaw.getRawSamples({ trackId, startSec, endSec, channel: 'right' }) ?? left;
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

MIDI note name utilities are available as plain SDK imports — no capability declaration required.

- `midiNoteToName(noteNumber): string`

```ts
const label = api.utilities.midiNoteToName(60); // C4
```

Or use the shorthand directly:

```ts
import { noteName } from '@mvmnt/plugin-sdk';

const label = noteName(60); // 'C4'
```

## SDK Utilities

These helpers are exported from `@mvmnt/plugin-sdk` (or the corresponding submodule) and do not require a capability access call.

### Animation math (`animation` submodule)

```ts
import { clamp, lerp, invLerp, remap, FloatCurve, easings } from '@mvmnt/plugin-sdk/animation';
```

- `clamp(v, min, max)` — clamp a number to a range
- `lerp(a, b, t)` — linear interpolation between two values
- `invLerp(a, b, v)` — inverse lerp; returns the `t` that produces `v`
- `remap(inMin, inMax, outMin, outMax, v)` — map a value from one range to another (clamped)
- `FloatCurve` — piecewise linear interpolation with per-segment easing; pass `[factor, value, easingFn?]` tuples
- `easings` — dictionary of 31 named easing functions (`easeOutQuad`, `easeInElastic`, `easeInOutBack`, etc.)

Example — fade-out alpha over a ripple lifetime:

```ts
const alpha = remap(fadeFrom, 1, 1, 0, progress);
```

Example — custom curve with easing:

```ts
const curve = new FloatCurve([
    [0, 0, easings.easeOutCubic],
    [0.6, 1],
    [1, 0, easings.easeInQuad],
]);
const scale = curve.valAt(progress);
```

### Property factories (`prop`, `tab`, `section`, `propGroup`, `insertElementConfig`)

See [Creating Custom Elements — Property Factory Helpers](creating-custom-elements.md#configuration-schema) for the full reference. Summary:

```ts
import { prop, tab, section, propGroup, insertElementConfig } from '@mvmnt/plugin-sdk';
```

`prop.*` factories build complete `PropertyDefinition` objects with the correct `runtime` transform pre-filled. `section.*` and `propGroup.*` build reusable property groups. `tab.*` groups those groups into the inspector tabs. `insertElementConfig` prepends the base Transform tab and appends your element-specific tabs without boilerplate.

### Asset loading (`loadBundledAsset`)

```ts
import { loadBundledAsset } from '@mvmnt/plugin-sdk';

const url = await loadBundledAsset('assets/logo.png');
// url is a blob: URL valid for the lifetime of the plugin
```

In production bundles, `loadBundledAsset('path')` resolves a path from the plugin's `assets/` directory to a blob URL.

Typically, when developing scene elements, you would use `this.bundledImage('path')` which returns a `BundledSprite` and handles lots of annoying lifecycle management. See more in [Visual Asset Registry](./visual-asset-registry.md).

### Types

- `TimelineNoteEvent` — MIDI note event `{ note, startSec, endSec, velocity, trackId, … }`
- `TimelineCCEvent` — MIDI CC event `{ controller, value, timeSec, trackId, … }`
- `TempoMapEntry` — tempo map entry used in timing calculations
- `FeatureInput` — union of audio feature names (e.g. `'rms'`, `'spectrum'`, `'waveform'`)
- `FeatureDataResult` — returned by `sampleFeatureAtTime`

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
    audioRawRead: boolean;
    timingConversion: boolean;
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

- [Creating Custom Elements](creating-custom-elements.md)
- [Runtime Plugin Loading API](runtime-plugin-loading.md)
