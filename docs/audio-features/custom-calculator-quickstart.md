# Custom Calculator Quickstart

_Last reviewed: May 2026_

This guide walks through creating a scene element that uses a custom audio feature calculator —
one that computes something the built-in spectrogram/RMS/waveform calculators don't provide.

By the end you will have:

1. A custom calculator that measures zero-crossing rate frame-by-frame.
2. A scene element that visualizes it as a bar that pulses with the signal's noisiness.

## Prerequisites

- Familiarity with the [Audio Features Quick Start](quickstart.md).
- A working scene element class (see [Creating Custom Elements](../creating-custom-elements.md)).

---

## Step 1 — Define and register the calculator

Create a file for your element. Both registrations must happen at **module scope** (top level of
the file, outside any class or function) so they run the moment the file is imported — before any
audio analysis can start.

```ts
// src/plugins/my-zero-crossing/zero-crossing-element.ts

import {
    audioCalculatorsApi,
    registerFeatureRequirements,
    sampleAudio,
    type PluginAudioCalculator,
} from '@mvmnt/plugin-sdk';

// ── 1. Define the calculator ──────────────────────────────────────────────────

const zeroCrossingCalculator: PluginAudioCalculator = {
    // Namespace your id to avoid collisions with built-ins and other plugins.
    id: 'myplugin.zeroCrossing',
    // Increment version whenever you change the algorithm or output format.
    // This automatically busts cached results so stale data is never served.
    version: 1,
    // The feature key elements request in registerFeatureRequirements.
    featureKey: 'zeroCrossing',
    label: 'Zero Crossing Rate',

    async calculate(ctx) {
        const channelData = ctx.audioBuffer.getChannelData(0); // mono mix
        const rates = new Float32Array(ctx.frameCount);

        for (let frame = 0; frame < ctx.frameCount; frame++) {
            if (ctx.signal?.aborted) throw new Error('Analysis cancelled');

            const start = frame * ctx.analysisParams.hopSize;
            const end = Math.min(start + ctx.analysisParams.hopSize, channelData.length);
            let crossings = 0;

            for (let i = start + 1; i < end; i++) {
                if (channelData[i - 1]! >= 0 !== channelData[i]! >= 0) {
                    crossings++;
                }
            }

            // Normalize to [0, 1]: divide by hopSize to get a rate per sample.
            rates[frame] = crossings / ctx.analysisParams.hopSize;

            // Report progress so the diagnostics panel can show a progress bar.
            ctx.reportProgress?.(frame + 1, ctx.frameCount);

            // Yield every 100 frames to keep the UI responsive during long files.
            if (frame % 100 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        return {
            frameCount: ctx.frameCount,
            channels: 1,
            format: 'float32',
            data: rates,
            channelLayout: { aliases: ['Mono'] },
        };
    },
};

// ── 2. Register at module scope ───────────────────────────────────────────────

// Register the calculator so the audio engine knows how to compute 'zeroCrossing'.
audioCalculatorsApi.register(zeroCrossingCalculator);

// Tell the runtime this element class depends on the 'zeroCrossing' feature.
// The string passed here must match the class name used in the scene registry.
registerFeatureRequirements('ZeroCrossingElement', [{ feature: 'zeroCrossing' }]);
```

---

## Step 2 — Write the element class

```ts
// Continuing in the same file...

import { SceneElement, prop, Rectangle } from '@mvmnt/plugin-sdk';

export class ZeroCrossingElement extends SceneElement {
    static props = {
        audioTrackId: prop.string().label('Audio Track'),
        color: prop.color().label('Bar Color').default('#00ff88'),
    };

    render(time: number) {
        const trackId = this.getProperty<string>('audioTrackId');
        if (!trackId) return [];

        const sample = sampleAudio({
            trackId,
            feature: 'zeroCrossing',
            time,
        });

        // Return nothing until the cache is ready — the element will just be invisible.
        if (!sample) return [];

        // sample.values[0] is the zero-crossing rate at this frame (0–1 range).
        const rate = sample.values[0] ?? 0;

        const color = this.getProperty<string>('color') ?? '#00ff88';
        const height = rate * 200; // scale to a max of 200px

        return [new Rectangle(0, 0, 60, height, color)];
    }
}
```

---

## Step 3 — Use the element in a scene

1. **Add the element** to a scene and bind `audioTrackId` to a track that has audio loaded.
2. **Load audio** — analysis will run automatically. The zero-crossing calculator runs alongside
   the built-in spectrogram/RMS calculators in the same pass.
3. **Play the timeline** — the bar will pulse based on the noisiness of the audio at each moment.

---

## How it fits together

```
Module loads
  → audioCalculatorsApi.register(zeroCrossingCalculator)   ← wires up the calculator
  → registerFeatureRequirements('ZeroCrossingElement', …)  ← declares the dependency

Audio loaded into timeline
  → analysis runs: zeroCrossing calculator is called alongside built-ins
  → results cached in AudioFeatureCache under featureKey 'zeroCrossing'

ZeroCrossingElement.render(time)
  → sampleAudio({ trackId, feature: 'zeroCrossing', time })
  → returns zeroCrossing rate for the current frame
  → element draws a proportional rectangle
```

---

## Common pitfalls

| Symptom                                  | Cause                                            | Fix                                                        |
| ---------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `sampleAudio` always returns `null`      | Calculator not registered before analysis ran    | Move `audioCalculatorsApi.register()` to module scope      |
| Stale data after changing algorithm      | `version` not incremented                        | Bump `version` on the calculator object                    |
| Out-of-bounds channel access             | `channelLayout.aliases` length ≠ `channels`      | Make sure the alias array length matches the channel count |
| `featureKey` conflict warning in console | Another calculator already uses `'zeroCrossing'` | Use a namespaced key: `'myplugin.zeroCrossing'`            |

---

## Further reading

- [Audio Cache System](audio-cache-system.md) — architecture, serialization, and advanced workflows.
- [Audio Features Quick Start](quickstart.md) — sampling, requirements, and subscription model.
- [Plugin API v1](../plugin-api-v1.md) — full SDK surface reference.
