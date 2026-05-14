# Audio System Analysis — May 2026

## Overview

This document analyses the audio calculator and feature system, its plugin extensibility surface,
points of developer confusion, and known redundancies or bugs.

---

## How the System Works

### Data Flow (Source → Scene Element)

```
SceneElement._buildRenderObjects(time)
  api.audio.sampleFeatureAtTime({ trackId, feature: 'rms', time })
    getFeatureData()                      [src/audio/features/sceneApi.ts]
      createFeatureDescriptor()           [descriptorBuilder.ts]
      getFeatureSubscriptionController()  [featureSubscriptionController.ts]
      sampleFeatureFrame()                [audioFeatureUtils.ts]
        resolveFeatureContext()           [looks up track + cache in timeline state]
        getTempoAlignedFrame()            [interpolation, smoothing]
          → AudioFeatureFrameSample (values[], channels, channelLayout)
    → FeatureDataResult { values[], metadata }
```

The architecture is **pull-based and cache-centric**. Elements pull values at render time;
calculators run asynchronously in the background and write to the cache. Elements never touch
a calculator directly.

### Calculator System

Calculators live in `src/audio/features/calculators/` and are registered via
`audioFeatureCalculatorRegistry.register()`. The built-ins are lazily registered the first time
`analyzeAudioFeatures()` runs (via `ensureCalculatorsRegistered()` in `audioFeatureAnalysis.ts`).

**Built-in calculators:**

| Calculator     | ID                     | featureKey    | Output                                                                                                            |
| -------------- | ---------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Spectrogram    | `mvmnt.spectrogram`    | `spectrogram` | Frequency magnitude per frame (Uint8Array)                                                                        |
| Pitch Waveform | `mvmnt.pitch-waveform` | `pitch`       | Pitch-aligned waveform                                                                                            |
| RMS            | `mvmnt.rms`            | `rms`         | Root-mean-square amplitude per frame (Float32Array, per-channel; interleaved as `data[frame * numChannels + ch]`) |
| Waveform       | `mvmnt.waveform`       | `waveform`    | Min/max amplitude per hop frame                                                                                   |

**`AudioFeatureCalculator` interface** (all fields a calculator must/can provide):

```typescript
interface AudioFeatureCalculator<Prepared = unknown> {
    id: string; // unique, e.g. 'myplugin.loudness'
    version: number; // increment to bust the cache
    featureKey: string; // what elements request, e.g. 'loudness'
    label?: string;
    defaultParams?: Record<string, unknown>;
    prepare?: (params: AudioFeatureAnalysisParams) => Promise<Prepared> | Prepared;
    calculate: (
        context: AudioFeatureCalculatorContext<Prepared>
    ) => Promise<AudioFeatureCalculationResult> | AudioFeatureCalculationResult;
    serializeResult?: (track: AudioFeatureTrack) => Record<string, unknown>;
    deserializeResult?: (payload: Record<string, unknown>) => AudioFeatureTrack | null;
}
```

**`AudioFeatureCalculatorContext`** supplies everything a calculator needs:

- `audioBuffer` — raw Web Audio `AudioBuffer`
- `hopTicks`, `hopSeconds`, `frameCount` — pre-computed frame grid
- `analysisParams` — window size, hop size, sample rate, fft size, etc.
- `analysisProfileId` — which profile was used
- `timing` — global BPM, tempo map, ticks/quarter
- `tempoProjection`, `tempoMapper` — for tempo-aligned output
- `reportProgress(processed, total)` — progress reporting hook
- `signal` — `AbortSignal` for cancellation

---

## How Easy Is It to Make a New Calculator?

**Creating a calculator is genuinely straightforward**, but **registering it from a plugin is not
currently possible without internal access.** Here is the gap:

### Internal side (easy)

```typescript
import type { AudioFeatureCalculator } from '@audio/features/audioFeatureTypes';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';

const myCalculator: AudioFeatureCalculator = {
    id: 'myplugin.loudness',
    version: 1,
    featureKey: 'loudness',
    calculate(context) {
        const { audioBuffer, frameCount, hopSize, analysisParams } = context;
        const output = new Float32Array(frameCount);
        // ... compute loudness per frame ...
        return {
            key: 'loudness',
            calculatorId: 'myplugin.loudness',
            version: 1,
            frameCount,
            channels: 1,
            hopTicks: context.hopTicks,
            hopSeconds: context.hopSeconds,
            startTimeSeconds: 0,
            tempoProjection: context.tempoProjection,
            format: 'float32',
            data: output,
        };
    },
};

audioFeatureCalculatorRegistry.register(myCalculator);
```

### Plugin side (currently blocked)

`audioFeatureCalculatorRegistry` is **not exported from `@mvmnt/plugin-sdk`**. There is no public
API for registering calculators. Plugin authors have no way to:

1. Register a custom calculator
2. Query which calculators are available
3. Override/replace a built-in calculator

This is the primary extension gap that needs to be bridged before custom audio calculators can
be supported.

---

## What Needs to Change for Plugin-Authored Calculators

### Required additions to the plugin API surface

**1. Expose calculator registration through the plugin SDK**

A new capability (e.g. `audio.calculators.register`) and corresponding `PluginAudioCalculatorApi`:

```typescript
interface PluginAudioCalculatorApi {
    register(calculator: PluginAudioCalculator): void;
    unregister(id: string): void;
    list(): PluginAudioCalculatorInfo[];
}

// A simplified, safe version of AudioFeatureCalculator for external use:
interface PluginAudioCalculator {
    id: string;
    version: number;
    featureKey: string;
    label?: string;
    calculate(
        context: PluginAudioCalculatorContext
    ): Promise<PluginAudioCalculatorResult> | PluginAudioCalculatorResult;
}
```

This must be a _separate, narrower type_ from the internal `AudioFeatureCalculator` so the
internal contract (serialization hooks, dependency injection pattern, yield controllers) doesn't
leak into the public surface.

**2. Expose `AudioFeatureTrack` shape for return values**

Plugin calculators need to return a result conforming to `AudioFeatureTrack`. Currently this
type is internal. It should be exported from `@mvmnt/plugin-sdk`.

**3. Expose `registerFeatureRequirements` correctly for custom features**

This is already exported from the SDK. Custom elements can declare their custom feature keys via
`registerFeatureRequirements('myElement', [{ feature: 'loudness', calculatorId: 'myplugin.loudness' }])`.
The system will schedule analysis for any registered feature key, **so this part already works**
once a calculator is registered.

**4. Analysis profile and parameter access**

Custom calculators receive `analysisParams` (window size, hop, sample rate) but these are chosen
by the host. If a custom calculator needs different parameters (e.g. a longer window for
low-frequency analysis), there is currently no way for a plugin to declare profile requirements.
A `profileRequirements` field on `PluginAudioCalculator` would address this.

**5. Plugin lifecycle: when to register**

Currently calculators are implicitly registered at analysis time via `ensureCalculatorsRegistered()`.
Custom plugins need a registration hook that fires before analysis starts. A plugin init callback
(or a `PLUGIN_CAPABILITIES.audioCalculatorsRegister` capability that triggers early) is needed.

**6. Worker isolation / security**

Built-in calculators run in a background worker (or at least off the main thread). For untrusted
plugin code, security isolation may be needed. This is a larger architectural concern — noted
here but out of scope for near-term changes.

---

## Points of Confusion for Developers

### 1. RMS calculator is per-channel (stereo)

`rmsCalculator.ts` computes RMS independently for each channel in the source buffer:

```typescript
// Interleaved output: data[frame * numChannels + ch] = RMS for that frame/channel
const output = new Float32Array(frameCount * numChannels);
// ...
channels: numChannels,
channelAliases: aliases,    // ['Mono'] | ['Left', 'Right'] | ['Ch 1', 'Ch 2', ...]
channelLayout: { aliases },
```

The resulting track has `channels: N` (matching the source buffer), with correct per-channel
aliases via `channelAliasesForCount(numChannels)`. Left/right channels are independently
selectable — selecting "Left" gives left-only RMS, not a mono mix.

### 2. `FeatureInput` accepts both string and `AudioFeatureDescriptor` but the docs don't explain when to use which

Short strings like `'rms'` are resolved via `buildDescriptor()` into a full `AudioFeatureDescriptor`.
The string form is simpler but doesn't allow calculator overrides, profile overrides, or band index.
The object form is fully featured. There's no warning when a string resolves to an unknown feature
key — it will just silently return null at sample time.

### 3. Two overlapping audio API entry points

The SDK exports:

```typescript
// Direct proxy — throws descriptively if capability missing
export { audioApi } from '@core/scene/plugins/plugin-sdk-capabilities';

// Shortcut wrappers — return null/[] on failure
export { sampleAudio, sampleAudioRange } from '@core/scene/plugins/plugin-sdk-shortcuts';
```

And elements also do:

```typescript
const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead]);
api.audio.sampleFeatureAtTime(...)
```

That's three distinct ways to access audio data. The Phase 3 canonical pattern (`getPluginHostApi`)
is what all built-in elements use, but `sampleAudio` and `audioApi` also exist in the SDK. The
difference between them isn't explained in any docstring or guide. A new plugin author will be
confused about which to use.

**Recommendation:** Add a `@recommended` JSDoc tag to `sampleAudio` / `sampleAudioRange` as the
preferred entry point for simple cases, and document `getPluginHostApi` for cases where capability
checking matters.

### 4. `smoothing` is measured in "frames", not seconds

The `smoothing` parameter in `AudioSamplingOptions` is a frame radius (temporal averaging over
N hop-frames). This is unintuitive for a user setting `smoothing: 8` without knowing the hop size.
The effective smoothing time in seconds = `smoothing * hopSeconds`. With a default hop of ~23ms,
`smoothing: 8` means ~185ms of smoothing. This is nowhere documented in the schema or UI.

### 5. `registerFeatureRequirements` must be called at module scope

The comment in `audioElementMetadata.ts` says "Call this at module scope so requirements are
available before instances render." But there is no validation — calling it inside a constructor
or method will silently work most of the time but can cause missed analysis windows. There is no
error or warning if registration happens late.

### 6. `AudioFeatureCalculator` uses dependency injection for internal utilities

The factory pattern (`createRmsCalculator({ mixBufferToMono, cloneTempoProjection, ... })`)
makes the calculators testable but is opaque to someone trying to write a new one. Looking at
the registry, `register()` takes an `AudioFeatureCalculator` directly — so you don't need to
use the factory pattern at all. But all built-in examples use it, implying it's required.

### 7. `calculators` dependency on `useTimelineStore` in the registry

`audioFeatureRegistry.register()` calls `useTimelineStore.getState().invalidateAudioFeatureCachesByCalculator()`
at registration time. This couples the registry to the Zustand store, which makes it impossible
to call `register()` in unit tests without mocking the store (or the silent try/catch). The
try/catch hides this dependency behind a silence guard.

---

## Potential Errors and Redundancies

### ~~Error 1: Channel alias mismatch in RMS calculator~~ (resolved)

The RMS calculator now computes per-channel output (`channels: N`) so `channelAliases` correctly
reflects the actual track layout. Left/right can be selected independently.

### Error 2: `featureDefaults` only tracks the last registered calculator per feature key

In `audioFeatureRegistry.ts`:

```typescript
featureDefaults.set(calculator.featureKey, {
    calculatorId: calculator.id, // overwrites any previous
    bandIndex: existing.bandIndex,
});
```

If two calculators register the same `featureKey`, the last one wins silently. There is no
warning about conflict. This would cause elements requesting `'rms'` to suddenly use a different
calculator if any third party registers one with the same feature key.

**Fix:** Warn or throw when a featureKey collision occurs, or use an array of candidates with
explicit precedence rules.

### Error 3: Peak hold in the audio volume meter uses percentage, not dBFS

The original `AudioVolumeMeterElement` displays `${percent}%` based on a linear range mapped from
`minValue`/`maxValue`. Since RMS values are linear amplitude [0, 1], the display is meaningless
without knowing the scale. For example, -20 dBFS corresponds to approximately 0.1 linear amplitude
but would display as "10%", giving no useful metering information to a user who understands audio
levels. **(Addressed in the update below.)**

### Redundancy 1: `channelAliases` field on `AudioFeatureTrack` is deprecated

`AudioFeatureTrack` has both:

- `channelAliases?: string[] | null` — marked `@deprecated`
- `channelLayout?: ChannelLayoutMeta | null` — the replacement

But the RMS calculator still sets both fields. `audioFeatureUtils.ts` checks both. This duplication
creates two sources of truth and means a calculator author must know to set `channelLayout` (the
preferred form) while also setting `channelAliases` for backwards compatibility.

### Redundancy 2: `analysisProfileId` carried in three places

A resolved profile ID appears in:

- `AudioFeatureTrack.analysisProfileId`
- `AudioFeatureDescriptor.analysisProfileId`
- `AudioFeatureCache.defaultAnalysisProfileId`

There is potential for these to diverge if not kept in sync during cache construction.

### Redundancy 3: `sampleAudio` / `sampleAudioRange` shortcuts largely duplicate `audioApi`

`plugin-sdk-shortcuts.ts` wraps `audioApi` with try/catch and null returns. This is essentially
the same as what `getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead])` + status check does,
but without the capability negotiation. The three entry points could be consolidated into two:
a simple shortcut and the full host API.

---

## Summary Table

| Issue                                                      | Type       | Severity   | Fix                                   |
| ---------------------------------------------------------- | ---------- | ---------- | ------------------------------------- |
| No public calculator registration API                      | Gap        | High       | Add `PluginAudioCalculatorApi` to SDK |
| Custom calculators have no init lifecycle hook             | Gap        | High       | Add registration hook before analysis |
| ~~RMS calculator mono but stereo aliases~~                 | ~~Bug~~    | ~~Medium~~ | Resolved — RMS is now per-channel     |
| `featureDefaults` last-write-wins on featureKey collision  | Bug        | Medium     | Warn or throw on collision            |
| Three overlapping audio API entry points                   | Confusion  | Medium     | Document recommended path             |
| `smoothing` in frames, not seconds                         | Confusion  | Low        | Document in schema / UI               |
| `registerFeatureRequirements` silently accepts late calls  | Confusion  | Low        | Add dev warning                       |
| DI factory pattern implies it's required for calculators   | Confusion  | Low        | Add plain example in docs             |
| `channelAliases` deprecated but still set everywhere       | Redundancy | Low        | Migrate fully to `channelLayout`      |
| `analysisProfileId` carried in 3 places                    | Redundancy | Low        | Consolidate or document single source |
| `sampleAudio` / `audioApi` / `getPluginHostApi` three ways | Redundancy | Low        | Document canonical path               |
