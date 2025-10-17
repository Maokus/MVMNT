# Audio Features Quick Start

_Last reviewed: 24 October 2025_

This quick start covers the recommended workflow for audio-reactive scene elements using the v4 audio
system. It assumes you have already loaded audio into the timeline and want to consume analyzed
features in your element code.

## 1. Register feature requirements (one-time per element type)

```ts
import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';

registerFeatureRequirements('audioSpectrum', [
    { feature: 'spectrogram' },
]);
```

- Call the function at module scope so requirements are registered when the element loads.
- Requirements are internal metadata: they do **not** appear in the property panel.
- Use multiple entries when the element needs several features or channels.

## 2. Sample during render

```ts
import { getFeatureData } from '@audio/features/sceneApi';

const trackId = this.getProperty<string>('featureTrackId');
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

1. Publish analysis intents based on the registered requirements.
2. Deduplicate descriptors across elements.
3. Subscribe/unsubscribe automatically when the bound track changes.

If you need to swap descriptors dynamically (e.g., user selects a different feature), build explicit
`AudioFeatureDescriptor` objects with `createFeatureDescriptor` and call
`syncElementFeatureIntents`. The lazy and explicit APIs interoperate, so diagnostics still show the
correct subscription state.

## 4. Handle missing data gracefully

Sampling returns `null` until the cache is ready. Early-return and render nothing until data arrives.
Use the diagnostics panel to monitor analysis progress or restart jobs when inputs change.

## 5. Learn more

- [Audio Cache System](audio-cache-system.md) – architecture deep dive and advanced workflows.
- [Audio Concepts](concepts.md) – mental model for data vs presentation responsibilities.
- [removeSmoothingFromDescriptor migration](../../src/persistence/migrations/removeSmoothingFromDescriptor.ts) – legacy scene support.
