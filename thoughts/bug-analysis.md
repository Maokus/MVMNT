# Audio Visualisation Bug Analysis

**Status:** Draft (2025-10-25)

## Summary
- Spectrum descriptors that target a specific band currently render flat, full-width bars because the renderer treats the single-band sample like a full-spectrum payload. This collapses filtered selections into a uniform output. 【F:src/core/scene/elements/audio-spectrum.ts†L945-L1034】【F:src/core/scene/elements/audio-spectrum.ts†L338-L431】
- The volume meter ignores every descriptor beyond the first entry, so stereo or mid/side bindings silently fall back to a single RMS stream. 【F:src/core/scene/elements/audio-volume-meter.ts†L381-L458】
- Oscilloscope zero-cross triggering and persistence trails always follow the first descriptor, leaving secondary channels misaligned in split, overlay, or Lissajous modes. 【F:src/core/scene/elements/audio-oscilloscope.ts†L339-L368】【F:src/core/scene/elements/audio-oscilloscope.ts†L564-L605】

## Root Cause Details

### Spectrum band selections collapse into a flat graph
Spectrum descriptors can carry a `bandIndex`, but the renderer still loops over the full set of band definitions and interpolates against the `values` array regardless of its length.【F:src/core/scene/elements/audio-spectrum.ts†L338-L431】 When a descriptor requests a single band, `sampleFeatureFrame` returns a one-value vector,【F:src/core/scene/elements/audio-spectrum.ts†L945-L1034】 so every bar winds up sampling that same index. The result is a uniform skyline instead of a focused band visual. The fix is to recognize descriptors that intentionally narrow the band set and either (a) render only the addressed band, or (b) widen the sample by requesting neighbour bins before interpolation. Doing so honours the “descriptor describes the analysed signal” contract captured in the bindings documentation.【F:docs/audio-feature-bindings.md†L9-L116】

### Volume meter collapses multi-channel bindings
The meter resolves the descriptor array but immediately selects the first entry before sampling, discarding all additional channels.【F:src/core/scene/elements/audio-volume-meter.ts†L381-L458】 Because descriptors encapsulate channel aliases and smoothing metadata rather than generic properties,【F:docs/audio-feature-bindings.md†L9-L116】 this shortcut defeats the inspector’s multi-select UX: stereo selections, mid/side pairs, or per-band RMS feeds all devolve into a single mono level. Refactoring the sampling path to aggregate the full descriptor list (for example averaging, max-ing, or rendering parallel fills per descriptor) restores the intended behaviour.

### Oscilloscope zero-cross & persistence lock to the first descriptor
Zero-cross triggering references `series[0]`, and persistence windows are seeded from `descriptors[0]` before replaying history.【F:src/core/scene/elements/audio-oscilloscope.ts†L339-L368】【F:src/core/scene/elements/audio-oscilloscope.ts†L564-L605】 That design ignores whichever descriptor the user actually wants to prioritise (right channel, side channel, etc.). In split or Lissajous layouts the secondary traces therefore drift or smear because their history windows come from the first descriptor’s cadence. Adapting the trigger source based on the active channel mode (e.g., use left/right separately in split, choose the X axis descriptor for Lissajous) keeps traces phase-stable while still emitting analysis intents for every bound descriptor.【F:docs/audio-feature-bindings.md†L104-L116】

## Descriptor & Channel Concepts
Feature descriptors declare which analysed signal an element should consume, including calculator metadata, band/channel selection, and smoothing radius. Channels provide the human-readable aliases that map multi-channel caches to visual affordances, while regular element properties remain static authoring controls (size, colour, etc.).【F:docs/audio-feature-bindings.md†L9-L116】 Treat descriptors as data wiring—comparable to binding slots—whereas properties stay within the element schema that the scene runtime serialises like any other configuration knob.

## UX Flow Recommendation
To realign the inspector with expectations captured in the element specs,【F:thoughts/element-specs.md†L1-L155】 introduce a unified audio-binding flow:

1. **Pick the source** – Track picker first, then display available descriptors grouped by category (spectrum, RMS, waveform) with glossary-backed help text referencing the binding guide.【F:docs/audio-feature-bindings.md†L102-L116】
2. **Select descriptors** – Allow multi-select chips per channel/band. For spectrum, surface presets for common ranges and show how single-band selections will render (e.g., “Solo band” vs. “Full spectrum”).【F:thoughts/element-specs.md†L14-L47】 For meters, offer aggregation modes (sum, max, dual bars) so multi-channel picks behave predictably.【F:thoughts/element-specs.md†L51-L77】 For oscilloscopes, mirror the channel-mode choices (mono, split, Lissajous) and tie zero-cross options to the chosen anchor channel.【F:thoughts/element-specs.md†L81-L114】
3. **Review visual styling** – After binding, expose styling groups (colour ramps, glow, persistence) scoped to the element so creators can tune expressiveness without hunting through generic property lists.【F:thoughts/element-specs.md†L14-L155】
4. **Diagnose binding issues** – Reuse the cache diagnostics banner/panel when descriptors require regeneration, keeping the user inside the same flow instead of forcing them into separate tooling.【F:docs/audio-feature-bindings.md†L89-L109】

Link this document from future implementation notes once fixes land to keep design, runtime, and documentation in sync.
