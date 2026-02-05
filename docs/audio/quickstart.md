# Audio Features Quick Start

_Last reviewed: 12 November 2025_

This quick start covers the recommended workflow for audio-reactive scene elements using the v4 audio
system. It assumes you have already loaded audio into the timeline and want to consume analyzed
features in your element code.

## 1. Register feature requirements (one-time per element type)

```ts
import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);
```

-   Call the function at module scope so requirements are registered when the element loads.
-   Requirements are internal metadata: they do **not** appear in the property panel.
-   Use multiple entries when the element needs several features. Multi-channel payloads are handled at runtime using the values returned from `getFeatureData`.
-   Need custom analyzer parameters? Provide a `profileParams` override and the runtime will mint an ad-hoc profile ID automatically:

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

-   Pass runtime presentation tweaks (smoothing, interpolation) through the final argument.
-   `AudioFeatureDescriptor` objects remain focused on analysis identity.
-   Changing sampling options never invalidates cache entries, so multiple elements share work.

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

## 5. Learn more

-   [Audio Cache System](audio-cache-system.md) – architecture deep dive and advanced workflows.
-   [Audio Concepts](concepts.md) – mental model for data vs presentation responsibilities.
-   [removeSmoothingFromDescriptor migration](../../src/persistence/migrations/removeSmoothingFromDescriptor.ts) – legacy scene support.
