# Audio Concepts

_Last reviewed: 24 October 2025_

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
-   **External**: Element properties exposed through config schemas (`getConfigSchema`) remain the
    only knobs users see. Bind smoothing, colors, thresholds, and other presentation controls here.
-   This separation keeps presets portable and ensures migrations can adjust metadata without touching
    saved scenes.

## Automatic vs explicit subscriptions

-   **Automatic (lazy API)**: `getFeatureData` handles subscription lifecycle for the common case.
    Use it in `_buildRenderObjects` to fetch the current frame on demand. The runtime deduplicates
    descriptors per track.
-   **Explicit**: When elements need full control (e.g., to prefetch multiple descriptors or swap sets
    mid-animation) build descriptors with `createFeatureDescriptor` and call
    `syncElementFeatureIntents`. You can still sample via `sampleFeatureFrame` or reuse the lazy API by
    passing the descriptor object.
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
    -   A single channel’s _series_ is typed by `AudioFeatureTrackData` (e.g. `Float32Array`, or `{min,max}` for min/max pairs).

-   descriptor

    -   A lightweight key you build at render time describing _which_ feature track and _which_ channel(s) you want.
    -   Contains `{featureKey, calculatorId?, bandIndex?, channel?}`.
    -   Multiple descriptors can point into the same cached track (e.g. one per channel or alias).

-   cache
    -   The in-memory or on-disk store of all tracks for a given audio buffer + tempo map.
    -   An `AudioFeatureCache` holds `featureTracks: Record<featureKey, AudioFeatureTrack>` plus shared metadata (`hopSeconds`, `startTimeSeconds`, etc.).

Putting it all together:

1. You run your calculators once and produce a `featureTracks` cache (one track per feature).
2. At render time you create one or more _descriptors_ to say “give me feature X, channel Y (or bin Z)”.
3. The sampler looks up the right `AudioFeatureTrack` in the cache, then reads the single-channel slice (`AudioFeatureTrackData`).

## Where to learn more

-   [Audio Cache System](audio-cache-system.md) – deep dive into architecture and workflows.
-   [Audio Features Quick Start](quickstart.md) – copy/paste onboarding for new elements.
-   [`AudioSamplingOptions` JSDoc](../../src/audio/features/audioFeatureTypes.ts) – precise runtime
    API reference.
