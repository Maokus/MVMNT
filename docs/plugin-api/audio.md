# Plugin audio

## Analyzed features

Declare `audio.features.read`, describe the instance's complete demand set from its props, and
sample the cached feature during render:

```ts
import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';

export const spectrum = definePluginElement({
    type: 'spectrum',
    metadata: { name: 'Spectrum' },
    schema: {
        tabs: [tab.properties([group('audio', 'Audio', [prop.audioTrack('audioTrackId', 'Track')])])],
    },
    audioFeatureDemands(props) {
        return [{ id: 'spectrogram', trackId: props.audioTrackId, feature: 'spectrogram' }];
    },
    render(props, _state, time, context) {
        const sample = context.audio!.sampleFeature({
            trackId: props.audioTrackId,
            feature: 'spectrogram',
            timeSeconds: time.seconds,
        });
        return sample.ok ? [] : [];
    },
});
```

The same capability must appear in the element's `plugin.json` entry. Demand IDs must be stable
within the definition. The host reevaluates demands when instance props change and removes them
when the instance is disposed. Sampling is read-only and clip-aware: the enabled clip at the
requested timeline time chooses the source, and gaps return silence. A failed result is normal
while analysis is pending or unavailable.

Use `sampleFeatureRange()` for a sequence of samples and `sampleFeatureMatrix()` for a packed
row-major window suitable for dense displays and generated rasters.

## Raw audio

Declare `audio.raw.read` for sample-accurate PCM windows, channel metadata, or RMS reads. Raw reads
are pre-fader and clip-aware. Bound the requested window and handle missing coverage without
throwing from `render()`.

## Custom calculators

Declare both `audio.calculators.register` and `audio.features.read`. Register the calculator from
`load()` and declare its per-instance demand separately:

```ts
import { definePluginElement, group, prop, tab, type PluginAudioCalculator } from '@mvmnt-app/plugin-sdk';

const calculator: PluginAudioCalculator = {
    id: 'com.example.zero-crossings',
    version: 1,
    featureKey: 'com.example.zero-crossings',
    calculate(context) {
        return {
            frameCount: context.frameCount,
            channels: 1,
            format: 'float32',
            data: new Float32Array(context.frameCount),
        };
    },
};

export const element = definePluginElement({
    type: 'zero-crossings',
    metadata: { name: 'Zero Crossings' },
    schema: {
        tabs: [tab.properties([group('audio', 'Audio', [prop.audioTrack('audioTrackId', 'Track')])])],
    },
    load(context) {
        const registration = context.audioCalculators!.register(calculator);
        if (!registration.ok) throw new Error(registration.error.message);
    },
    audioFeatureDemands(props) {
        return [
            {
                id: 'zero-crossings',
                trackId: props.audioTrackId,
                feature: calculator.featureKey,
                calculatorId: calculator.id,
            },
        ];
    },
    render() {
        return [];
    },
});
```

Increment `version` when the output algorithm or format changes. Long calculations must check
`context.signal.aborted` and report progress. Use namespaced calculator IDs and feature keys to
avoid collisions.
