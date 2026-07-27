# Audio Features Quick Start

_Last reviewed: May 2026_

This quick start covers the recommended workflow for audio-reactive scene elements using the v4 audio
system. It assumes you have already loaded audio into the timeline and want to consume analyzed
features in your element code.

## 1. Declare and sample features through SDK 2

```ts
import { definePluginElement } from '@mvmnt-app/plugin-sdk';

export const audioSpectrum = definePluginElement({
    type: 'audio-spectrum',
    metadata: { name: 'Audio Spectrum' },
    schema: { tabs: [] },
    capabilities: { required: ['audio.features.read'], optional: [] },
    featureRequirements: [{ feature: 'spectrogram' }],
    render(props, _state, time, context) {
        if (!props.audioTrackId) return [];
        const sample = context.audio!.sampleFeature({
            trackId: props.audioTrackId,
            feature: 'spectrogram',
            timeSeconds: time.seconds,
        });
        if (!sample.ok) return [];
        const values = Array.isArray(sample.value.value) ? sample.value.value : [sample.value.value];
        // Convert values into render objects.
        return [];
    },
});
```

Requirements are scoped to the definition lifecycle, deduplicated by the host, and disposed on
unload. Use multiple entries when an element needs several features. For custom analyzer settings,
add `profileParams` to the requirement. External plugins must not import application-internal
metadata registries or scene feature APIs.

`audioTrackId` is clip-aware: the enabled clip under `time.seconds` selects the immutable source
cache and gaps return silence. Requirements are owned by the track reference, not by whichever
clip happened to exist when the element first rendered: adding or removing enabled clips updates
the required source caches automatically. A failed `Result` is expected while new data is
unavailable; render an empty or placeholder state and use the diagnostics panel to monitor
analysis.

## 5. Register a custom calculator (optional)

If built-in features do not cover your needs, register a calculator from an SDK 2 definition's
`load` callback:

```ts
import { definePluginElement, type PluginAudioCalculator } from '@mvmnt-app/plugin-sdk';

const myCalculator: PluginAudioCalculator = {
    id: 'myplugin.zeroCrossing',
    version: 1,
    featureKey: 'zeroCrossing',
    async calculate(ctx) {
        const channelData = ctx.audioBuffer.getChannelData(0);
        const rates = new Float32Array(ctx.frameCount);
        const hopSize = Math.max(1, Math.round(ctx.hopSeconds * ctx.audioBuffer.sampleRate));
        for (let frame = 0; frame < ctx.frameCount; frame++) {
            if (ctx.signal.aborted) throw new Error('Analysis cancelled');
            const start = frame * hopSize;
            const end = Math.min(start + hopSize, channelData.length);
            let crossings = 0;
            for (let i = start + 1; i < end; i++) {
                if (channelData[i - 1]! >= 0 !== channelData[i]! >= 0) crossings++;
            }
            rates[frame] = crossings / hopSize;
            ctx.reportProgress(frame + 1, ctx.frameCount);
        }
        return { frameCount: ctx.frameCount, channels: 1, format: 'float32', data: rates };
    },
};

export const element = definePluginElement({
    type: 'my-zero-crossing-element',
    metadata: { name: 'Zero Crossing' },
    schema: { tabs: [] },
    capabilities: {
        required: ['audio.calculators.register', 'audio.features.read'],
        optional: [],
    },
    load(context) {
        const registration = context.audioCalculators!.register(myCalculator);
        if (!registration.ok) throw new Error(registration.error.message);
        const requirements = context.audio!.requireFeatures([{ feature: 'zeroCrossing' }]);
        if (!requirements.ok) throw new Error(requirements.error.message);
    },
    render() {
        return [];
    },
});
```

Then sample `'zeroCrossing'` in render exactly like any built-in feature (step 2 above).
See [Custom Calculator Quickstart](custom-calculator-quickstart.md) for a complete end-to-end example.

## 6. Learn more

- [Audio Cache System](audio-cache-system.md) – architecture deep dive and advanced workflows.
- [Audio Concepts](concepts.md) – mental model for data vs presentation responsibilities.
- [removeSmoothingFromDescriptor migration](../../src/persistence/migrations/removeSmoothingFromDescriptor.ts) – legacy scene support.
