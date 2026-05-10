# Audio Features Quick Start

_Last reviewed: May 2026_

This quick start covers the recommended workflow for audio-reactive scene elements using the v4 audio
system. It assumes you have already loaded audio into the timeline and want to consume analyzed
features in your element code.

## 1. Register feature requirements (one-time per element type)

```ts
import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);
```

- Call the function at module scope so requirements are registered when the element loads.
- Requirements are internal metadata: they do **not** appear in the property panel.
- Use multiple entries when the element needs several features. Multi-channel payloads are handled at runtime using the values returned from `getFeatureData`.
- Need custom analyzer parameters? Provide a `profileParams` override and the runtime will mint an ad-hoc profile ID automatically:

    ```ts
    registerFeatureRequirements('audioAdhocProfile', [
        {
            feature: 'spectrogram',
            profileParams: {
                windowSize: 4096,
                hopSize: 1024,
            },
        },
    ]);
    ```

    The overrides map to `AudioAnalysisProfileOverrides` and are sanitized before hashing, so you can safely omit properties or pass `null` for values such as `fftSize`.

## 2. Sample during render

```ts
import { getFeatureData } from '@audio/features/sceneApi';

const trackId = this.getProperty<string>('audioTrackId');
if (!trackId) return [];

const smoothing = this.getProperty<number>('smoothing') ?? 0;
const sample = getFeatureData(this, trackId, 'spectrogram', targetTime, {
    smoothing,
    interpolation: 'linear',
});
if (!sample) return [];

// sample.values contains the tempo-aligned magnitudes for the current frame.
```

- Pass runtime presentation tweaks (smoothing, interpolation) through the final argument.
- `AudioFeatureDescriptor` objects remain focused on analysis identity.
- Changing sampling options never invalidates cache entries, so multiple elements share work.

## 3. Let the runtime manage subscriptions

You do **not** need to manually emit intents when using `getFeatureData`. The scene runtime will:

1. Publish analysis intents based on the registered requirements (even when the element is still using a fallback ID during creation).
2. Deduplicate descriptors across elements.
3. Subscribe/unsubscribe automatically when the bound track changes, including macro-driven binding updates.

If you need to swap descriptors dynamically (e.g., user selects a different feature), build explicit
`AudioFeatureDescriptor` objects with `createFeatureDescriptor` and call
`syncElementFeatureIntents`. The lazy and explicit APIs interoperate through the subscription
controller, so diagnostics still show the correct subscription state without stale intents or
duplicate cache work.

## 4. Handle missing data gracefully

Sampling returns `null` until the cache is ready. Early-return and render nothing until data arrives.
Use the diagnostics panel to monitor analysis progress or restart jobs when inputs change.

## 5. Register a custom calculator (optional)

If built-in features (spectrogram, RMS, waveform) don't cover your needs, register a custom calculator
at module scope using `audioCalculatorsApi`:

```ts
import { audioCalculatorsApi, registerFeatureRequirements, type PluginAudioCalculator } from '@mvmnt/plugin-sdk';

const myCalculator: PluginAudioCalculator = {
    id: 'myplugin.zeroCrossing',
    version: 1,
    featureKey: 'zeroCrossing',
    async calculate(ctx) {
        const channelData = ctx.audioBuffer.getChannelData(0);
        const rates = new Float32Array(ctx.frameCount);
        for (let frame = 0; frame < ctx.frameCount; frame++) {
            const start = frame * ctx.analysisParams.hopSize;
            const end = Math.min(start + ctx.analysisParams.hopSize, channelData.length);
            let crossings = 0;
            for (let i = start + 1; i < end; i++) {
                if ((channelData[i - 1]! >= 0) !== (channelData[i]! >= 0)) crossings++;
            }
            rates[frame] = crossings / ctx.analysisParams.hopSize;
            ctx.reportProgress?.(frame + 1, ctx.frameCount);
        }
        return { frameCount: ctx.frameCount, channels: 1, format: 'float32', data: rates };
    },
};

// Both calls must be at module scope — they run once when the file loads.
audioCalculatorsApi.register(myCalculator);
registerFeatureRequirements('myZeroCrossingElement', [{ feature: 'zeroCrossing' }]);
```

Then sample `'zeroCrossing'` in render exactly like any built-in feature (step 2 above).
See [Custom Calculator Quickstart](custom-calculator-quickstart.md) for a complete end-to-end example.

## 6. Learn more

- [Audio Cache System](audio-cache-system.md) – architecture deep dive and advanced workflows.
- [Audio Concepts](concepts.md) – mental model for data vs presentation responsibilities.
- [removeSmoothingFromDescriptor migration](../../src/persistence/migrations/removeSmoothingFromDescriptor.ts) – legacy scene support.
