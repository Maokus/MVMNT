# Creating audio-reactive scene elements

_Last reviewed: 12 November 2025_

## Overview

Audio-reactive elements request analysis data from the audio cache system. Elements declare the
features they depend on, the scene engine manages subscriptions, and render methods sample frames at
runtime. Follow the patterns below to stay aligned with the v4 audio system simplifications.

## Automatic feature requirements

Use the metadata registry to declare fixed feature dependencies for your element. The base
`SceneElement` forwards those requirements to a `FeatureSubscriptionController`, which watches both
direct property edits and macro-driven updates to `audioTrackId`, so subclasses only need to
render.【F:src/core/scene/elements/audioElementMetadata.ts†L1-L43】【F:src/core/scene/elements/base.ts†L73-L210】

```ts
import { SceneElement } from '@core/scene/elements/base';
import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);

export class AudioSpectrumElement extends SceneElement {
    protected override _buildRenderObjects(config: unknown, targetTime: number) {
        const trackId = this.getProperty<string>('audioTrackId');
        if (!trackId) return [];

        const smoothing = this.getProperty<number>('smoothing') ?? 0;
        const frame = getFeatureData(this, trackId, 'spectrogram', targetTime, { smoothing });
        if (!frame) return [];

        // Convert frame values into render objects.
        return [];
    }
}
```

## Sampling audio feature data

Call `getFeatureData` to retrieve tempo-aligned frames, passing any runtime smoothing or
interpolation options you want to apply during rendering. The subscription controller keeps the
descriptor warm even if the element is still waiting for a persisted ID, using a deterministic
fallback key until `SceneElement.id` is assigned.【F:src/audio/features/sceneApi.ts†L66-L207】 For
range windows (such as oscilloscopes), use `sampleFeatureFrame` directly so you can control the
start and end ticks.【F:src/core/scene/elements/audioFeatureUtils.ts†L126-L213】

## Handling dynamic feature choices

If an element exposes a property that changes which feature it visualizes, update subscriptions
explicitly. Generate descriptors with `createFeatureDescriptor` and call
`syncElementFeatureIntents`; the controller will merge these explicit descriptors with the static
requirements so diagnostics stay in sync and bus churn is minimized. Reset with `clearFeatureData`
when the element no longer needs any audio data.【F:src/audio/features/sceneApi.ts†L209-L303】

```ts
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { syncElementFeatureIntents, clearFeatureData } from '@audio/features/sceneApi';

export class DynamicAudioElement extends SceneElement {
    protected override onPropertyChanged(key: string, oldValue: unknown, newValue: unknown): void {
        super.onPropertyChanged(key, oldValue, newValue);
        if (key === 'selectedFeature' || key === 'audioTrackId') {
            this._syncSubscriptions();
        }
    }

    private _syncSubscriptions(): void {
        const trackId = this.getProperty<string>('audioTrackId');
        const feature = this.getProperty<string>('selectedFeature');
        if (!trackId || !feature) {
            clearFeatureData(this);
            return;
        }

        const { descriptor } = createFeatureDescriptor({ feature });
        syncElementFeatureIntents(this, trackId, [descriptor]);
    }
}
```

## Best practices

-   Keep user-facing config focused on visual controls; declare audio data needs through metadata.
-   Sample within render-time helpers rather than caching values on the instance to avoid stale data.
-   Use smoothing as a runtime option so multiple elements can share the same cached descriptor while
    applying different presentation filters.
-   When you introduce a new feature requirement, add a regression test under
    `src/core/scene/elements/__tests__` that verifies subscription publishing and rendering behavior.
