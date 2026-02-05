# Audio Concepts

_Last reviewed: 12 November 2025_

This guide clarifies the mental model behind the v4 audio system. Use it as a primer before diving
into implementation details or when mentoring teammates on the new flow.

## Data vs presentation

-   **Data** is the output of analysis calculators: spectrogram magnitudes, RMS envelopes, waveform
    min/max arrays, etc.
-   **Presentation** is what an element does with that data: apply smoothing, interpolate between
    frames, colorize values, or animate geometry.
-   Keep descriptors focused on data. Pass presentation choices through `AudioSamplingOptions` or
    regular element properties.

## Internal vs external configuration

-   **Internal**: Feature requirements live inside the element module via
    `registerFeatureRequirements`. They are invisible to end users and declare which analysis tracks
    the element needs to function.
-   Inline overrides belong here too: add `profileParams` to a requirement when you need a bespoke
    analysis profile. The runtime merges the overrides, generates an `adhoc-…` ID, and publishes it
    alongside the descriptor without touching global registries.
-   **External**: Element properties exposed through config schemas (`getConfigSchema`) remain the
    only knobs users see. Bind smoothing, colors, thresholds, and other presentation controls here.
-   This separation keeps presets portable and ensures migrations can adjust metadata without touching
    saved scenes.

## Automatic vs explicit subscriptions

-   **Automatic (lazy API)**: `getFeatureData` handles subscription lifecycle for the common case via
    the per-element `FeatureSubscriptionController`. Use it in `_buildRenderObjects` to fetch the
    current frame on demand; the controller diffing logic deduplicates descriptors per track and
    tracks macro-driven changes around `audioTrackId`.
-   **Explicit**: When elements need full control (e.g., to prefetch multiple descriptors or swap sets
    mid-animation) build descriptors with `createFeatureDescriptor` and call
    `syncElementFeatureIntents`. The controller merges these explicit descriptors with the static
    requirement set so you can still sample via `sampleFeatureFrame` or reuse the lazy API by passing
    the descriptor object.
-   Both paths publish to the same analysis intent bus, so diagnostics and tooling always show an
    accurate subscription graph.

## Terminology

Here’s how the terms relate:

-   feature

    -   “What are we measuring?” e.g. “waveform”, “rms”, “spectrogram”.
    -   Identified by the `featureKey` string.

-   track

    -   The full time-series produced by running a calculator for one feature (and one analysis profile) on an audio source.
    -   Exposed as an `AudioFeatureTrack` object, which has
        -   `frameCount` (number of time steps)
        -   `channels` (number of channels in the data array)
        -   `data` (one contiguous TypedArray or `{min,max}` object of length `frameCount×channels`)

-   channel

    -   One slice of that multi-channel track at every time frame.
    -   In the spectrogram, “channels” = frequency bins; in waveform it’s physical audio channels (though waveform is mixed to mono, so channels=1).
    -   Channel metadata (aliases, semantics) lives on `AudioFeatureTrack.channelLayout` so elements
        can pick the appropriate slice at render time.

-   descriptor

    -   A lightweight key you build at render time describing _which_ feature track to read.
    -   Contains `{featureKey, calculatorId?, bandIndex?}`.
    -   Descriptors are channel-agnostic; elements inspect `AudioFeatureTrack.channelLayout` and the
        returned sample values to select channels locally.

-   cache
    -   The in-memory or on-disk store of all tracks for a given audio buffer + tempo map.
    -   An `AudioFeatureCache` holds `featureTracks: Record<featureKey, AudioFeatureTrack>` plus shared metadata (`hopSeconds`, `startTimeSeconds`, etc.).

Putting it all together:

1. You run your calculators once and produce a `featureTracks` cache (one track per feature).
2. At render time you create one or more _descriptors_ to say “give me feature X (optionally band Y)”.
3. The sampler looks up the right `AudioFeatureTrack` in the cache and returns tempo-aligned frames
   whose `values` arrays include every channel so you can filter locally.

## Where to learn more

-   [Audio Cache System](audio-cache-system.md) – deep dive into architecture and workflows.
-   [Audio Features Quick Start](quickstart.md) – copy/paste onboarding for new elements.
-   [`AudioSamplingOptions` JSDoc](../../src/audio/features/audioFeatureTypes.ts) – precise runtime
    API reference.
