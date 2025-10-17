# Audio Concepts

_Last reviewed: 24 October 2025_

This guide clarifies the mental model behind the v4 audio system. Use it as a primer before diving
into implementation details or when mentoring teammates on the new flow.

## Data vs presentation

- **Data** is the output of analysis calculators: spectrogram magnitudes, RMS envelopes, waveform
  min/max arrays, etc.
- **Presentation** is what an element does with that data: apply smoothing, interpolate between
  frames, colorize values, or animate geometry.
- Keep descriptors focused on data. Pass presentation choices through `AudioSamplingOptions` or
  regular element properties.

## Internal vs external configuration

- **Internal**: Feature requirements live inside the element module via
  `registerFeatureRequirements`. They are invisible to end users and declare which analysis tracks
  the element needs to function.
- **External**: Element properties exposed through config schemas (`getConfigSchema`) remain the
  only knobs users see. Bind smoothing, colors, thresholds, and other presentation controls here.
- This separation keeps presets portable and ensures migrations can adjust metadata without touching
  saved scenes.

## Automatic vs explicit subscriptions

- **Automatic (lazy API)**: `getFeatureData` handles subscription lifecycle for the common case.
  Use it in `_buildRenderObjects` to fetch the current frame on demand. The runtime deduplicates
  descriptors per track.
- **Explicit**: When elements need full control (e.g., to prefetch multiple descriptors or swap sets
  mid-animation) build descriptors with `createFeatureDescriptor` and call
  `syncElementFeatureIntents`. You can still sample via `sampleFeatureFrame` or reuse the lazy API by
  passing the descriptor object.
- Both paths publish to the same analysis intent bus, so diagnostics and tooling always show an
  accurate subscription graph.

## Cache efficiency wins

- Removing smoothing from descriptors means two elements requesting the same feature now share the
  same cache entry even if they use different smoothing radii.
- Sampling options are evaluated after the cache lookup, so per-element experimentation is free.
- Migrated scenes automatically drop redundant cache entries once they are re-saved with the new
  runtime options.

## Where to learn more

- [Audio Cache System](audio-cache-system.md) – deep dive into architecture and workflows.
- [Audio Features Quick Start](quickstart.md) – copy/paste onboarding for new elements.
- [`AudioSamplingOptions` JSDoc](../../src/audio/features/audioFeatureTypes.ts) – precise runtime
  API reference.
