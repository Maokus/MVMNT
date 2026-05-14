# Custom Calculator System — Implementation Plan (May 2026)

## Goal

Allow plugin authors to register custom audio feature calculators through `@mvmnt/plugin-sdk`
without needing access to internal registry paths. Currently `audioFeatureCalculatorRegistry` is
not exported from the SDK, so there is no public API for this.

## Current state

- Calculators are registered internally via `audioFeatureCalculatorRegistry.register()` in
  `src/audio/features/audioFeatureRegistry.ts`.
- Built-ins are lazy-registered the first time `analyzeAudioFeatures()` runs via
  `ensureCalculatorsRegistered()` in `audioFeatureAnalysis.ts`.
- `registerFeatureRequirements` **is** already exported from the SDK — so elements can declare
  custom feature keys; they just have no way to register the backing calculator.

## What needs to be built

### 1. Public types (`plugin-api.ts`)

Add a new section for audio calculator types. Keep the public surface narrower than the internal
`AudioFeatureCalculator` — omit serialization hooks and internal DI types.

```typescript
// src/core/scene/plugins/host-api/plugin-api.ts

export interface PluginAudioCalculatorContext {
    audioBuffer: AudioBuffer;
    hopTicks: number;
    hopSeconds: number;
    frameCount: number;
    analysisParams: {
        windowSize: number;
        hopSize: number;
        sampleRate: number;
        fftSize: number | null;
    };
    analysisProfileId: string;
    signal?: AbortSignal;
    reportProgress?: (processed: number, total: number) => void;
}

export interface PluginAudioCalculatorResult {
    frameCount: number;
    channels: number;
    format: 'float32' | 'uint8';
    data: Float32Array | Uint8Array;
    channelLayout?: { aliases: string[] };
}

export interface PluginAudioCalculator {
    id: string; // namespaced, e.g. 'myplugin.loudness'
    version: number; // increment to bust cache
    featureKey: string; // what elements request via registerFeatureRequirements
    label?: string;
    calculate(
        context: PluginAudioCalculatorContext
    ): Promise<PluginAudioCalculatorResult> | PluginAudioCalculatorResult;
}

export interface PluginAudioCalculatorInfo {
    id: string;
    version: number;
    featureKey: string;
    label?: string;
}

export interface PluginAudioCalculatorApi {
    register(calculator: PluginAudioCalculator): void;
    unregister(id: string): void;
    list(): PluginAudioCalculatorInfo[];
}
```

### 2. New capability key

```typescript
// In PLUGIN_CAPABILITIES (plugin-api.ts)
audioCalculatorsRegister: 'audioCalculatorsRegister',
```

### 3. Implement in `createPluginHostApi()`

In `src/core/scene/plugins/host-api/plugin-api.ts`, add an `audioCalculators` section that wraps
the internal registry:

```typescript
audioCalculators: {
    register(calculator: PluginAudioCalculator): void {
        audioFeatureCalculatorRegistry.register(
            adaptPluginCalculator(calculator)  // bridges public ↔ internal types
        );
    },
    unregister(id: string): void {
        audioFeatureCalculatorRegistry.unregister(id);
    },
    list(): PluginAudioCalculatorInfo[] {
        return audioFeatureCalculatorRegistry.list().map(c => ({
            id: c.id,
            version: c.version,
            featureKey: c.featureKey,
            label: c.label,
        }));
    },
},
```

The `adaptPluginCalculator` helper bridges `PluginAudioCalculatorResult` back to the internal
`AudioFeatureTrack` shape, filling in required fields (`key`, `calculatorId`, `hopTicks`,
`hopSeconds`, `startTimeSeconds`, `tempoProjection`, `analysisProfileId`) from the context.

### 4. Capability proxy (`plugin-sdk-capabilities.ts`)

```typescript
export const audioCalculatorsApi = createCapabilityProxy(
    PLUGIN_CAPABILITIES.audioCalculatorsRegister
) as PluginAudioCalculatorApi;
```

### 5. Export from `plugin-sdk.ts` and `sdk/audio.ts`

```typescript
// sdk/audio.ts
export { audioCalculatorsApi } from '@core/scene/plugins/plugin-sdk-capabilities';
export type {
    PluginAudioCalculator,
    PluginAudioCalculatorContext,
    PluginAudioCalculatorResult,
    PluginAudioCalculatorInfo,
} from '@core/scene/plugins/host-api/plugin-api';
```

Add to the `_verifyCapabilityExports` satisfies-check in `plugin-sdk.ts` to keep drift prevention
working.

### 6. Plugin lifecycle — when to register

Currently `ensureCalculatorsRegistered()` is called lazily at analysis time. Plugin calculators
need to be registered before that point. Two options:

**Option A (simpler)**: Document that plugins must call `audioCalculatorsApi.register()` at module
scope (i.e. in the top-level of their element file). Since `registerFeatureRequirements` already
has the same constraint, this is consistent.

**Option B (robust)**: Add a `PLUGIN_CAPABILITIES.onBeforeAnalysis` lifecycle hook that fires
before each analysis job. This lets plugins that load lazily still inject calculators in time.

**Recommendation**: Ship Option A first. Option B can be added if lazy-loading plugins become a
requirement.

### 7. `addAnalysisProfileRequirement` (future, low priority)

If a plugin calculator needs a non-default profile (e.g. a longer window for low-frequency
analysis), a `profileRequirements` field on `PluginAudioCalculator` would let the system schedule
the right analysis profile automatically. Out of scope for the initial implementation.

## File checklist

| File                                                 | Change                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/scene/plugins/host-api/plugin-api.ts`      | Add `PluginAudioCalculator*` types and `PluginAudioCalculatorApi`; add `audioCalculatorsRegister` capability; implement in `createPluginHostApi()` |
| `src/audio/features/audioFeatureRegistry.ts`         | No changes needed — existing `register/unregister/list` already work                                                                               |
| `src/core/scene/plugins/plugin-sdk-capabilities.ts`  | Add `audioCalculatorsApi` proxy                                                                                                                    |
| `src/core/scene/plugins/sdk/audio.ts`                | Export `audioCalculatorsApi` and new public types                                                                                                  |
| `src/core/scene/plugins/plugin-sdk.ts`               | Add to `_verifyCapabilityExports` map                                                                                                              |
| `src/core/scene/plugins/__tests__/api-drift.test.ts` | Add test for `audioCalculatorsRegister` capability export                                                                                          |
| `docs/audio/audio-cache-system.md`                   | Update "Registering a Custom Calculator" section to show SDK path                                                                                  |
| `docs/audio/quickstart.md`                           | Add brief note on plugin-registered calculators                                                                                                    |

## Adapter implementation detail

`adaptPluginCalculator` must bridge the narrower return type back to `AudioFeatureTrack`. The
adapter receives the result and the original context, so it can supply `tempoProjection`,
`hopTicks`, `hopSeconds`, etc.:

```typescript
function adaptPluginCalculator(plugin: PluginAudioCalculator): AudioFeatureCalculator {
    return {
        id: plugin.id,
        version: plugin.version,
        featureKey: plugin.featureKey,
        label: plugin.label,
        async calculate(ctx: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const result = await plugin.calculate({
                audioBuffer: ctx.audioBuffer,
                hopTicks: ctx.hopTicks,
                hopSeconds: ctx.hopSeconds,
                frameCount: ctx.frameCount,
                analysisParams: {
                    windowSize: ctx.analysisParams.windowSize,
                    hopSize: ctx.analysisParams.hopSize,
                    sampleRate: ctx.analysisParams.sampleRate,
                    fftSize: ctx.analysisParams.fftSize ?? null,
                },
                analysisProfileId: ctx.analysisProfileId,
                signal: ctx.signal,
                reportProgress: ctx.reportProgress,
            });
            return {
                key: plugin.featureKey,
                calculatorId: plugin.id,
                version: plugin.version,
                frameCount: result.frameCount,
                channels: result.channels,
                hopTicks: ctx.hopTicks,
                hopSeconds: ctx.hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: ctx.tempoProjection,
                format: result.format,
                data: result.data,
                channelLayout: result.channelLayout ?? null,
                channelAliases: result.channelLayout?.aliases ?? null,
                analysisProfileId: ctx.analysisProfileId,
            };
        },
    };
}
```

## Security note

Built-in calculators run synchronously on the main thread (with yielding). Plugin calculators will
do the same unless we introduce Web Worker isolation. For trusted first-party plugins this is
acceptable. For a marketplace scenario, worker isolation should be revisited before shipping.
