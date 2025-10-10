# Audio Visualisation Shared Infrastructure

_Last reviewed: 2025-10-22_

Phase 4 introduces shared helpers that spectrum, volume meter, and oscilloscope elements can reuse. All code lives in
`src/utils/audioVisualization` and is available through the `@utils/audioVisualization` alias.

## Transfer Function Utilities

- `applyTransferFunction(value, type, options)` normalizes magnitude values with `linear`, `log`, or `power` mappings.
- `createTransferFunctionProperties()` returns inspector schema definitions (select + exponent slider) that slot into
  existing element property groups.
- Prefer the helper over bespoke scaling math so that all elements honour the same defaults and future tweaks.

## History Sampling Helpers

- `sampleFeatureHistory(trackId, descriptor, targetTime, frameCount, hopStrategy)` wraps
  `sampleAudioFeatureRange` to return ordered `{ index, tick, timeSeconds, values }` samples.
- Supports `profileHop` (cache hop size) and `equalSpacing` strategies. Request the minimum `frameCount` needed to
  avoid unnecessary range reads.
- Returns an empty array if no cache data is available; callers should handle fallbacks without mutating renderer state.

## Glow and Material Abstractions

- `applyGlowToLine`, `applyGlowToPoly`, and `applyGlowToRectangle` generate layered render objects based on a shared
  `GlowStyle` (`color`, `blur`, `opacity`, optional `layerCount`, `layerSpread`, `opacityFalloff`).
- Each helper reuses `setShadow` and produces layout-excluded duplicates so existing bounds remain stable.
- Pass the returned array directly to render pipelines to ensure glow layers draw beneath the primary object.

## Channel Palette Guidance

- `channelColorPalette(trackChannels)` returns deterministic `{ index, alias, label, color }` entries for channel
  overlays. Known aliases (Left, Right, Mid, Side, LFE, etc.) use consistent accent colours; unknown entries fall back to a
  balanced rotating palette.
- Use the labels for tooltips or legends and the colour strings for stroke/fill styling.

## Testing

- Unit coverage for the utilities lives in `src/utils/__tests__/audioVisualization.test.ts` (Vitest). Extend the suite when
  adding new strategies or palette rules.
