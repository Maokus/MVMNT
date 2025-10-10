# Audio Visualisation Plan 3 — Phase 4 Implementation Plan

**Status:** Planning Draft (2025-10-22)

## Purpose

Phase 4 extends the spectrum, volume meter, and oscilloscope elements so they take advantage of multi-feature bindings without compromising deterministic CPU rendering. This plan enumerates the concrete work needed to land those upgrades within the current 2D render-object pipeline (rectangles, lines, polys, arcs, text) and cache APIs delivered in Phases 1–3.

## Constraints & Baseline Assumptions

- Renderer primitives are limited to existing shapes (`Rectangle`, `Line`, `Poly`, `Arc`, `Text`) with per-object shadows/alpha—no GPU shaders or feedback buffers.
- Elements must stay stateless per frame. Persistence-style effects rely on sampling historical frames from caches rather than accumulating renderer state.
- Audio feature access is via `sampleFeatureFrame` for instantaneous frames and `sampleAudioFeatureRange` for multi-frame windows, backed by multi-descriptor bindings introduced earlier in the program.
- Inspector schemas use the enhanced config definitions shown in current elements; new controls must slot into those schema structures with localization-ready labels and glossary references.
- Export determinism and existing automation (tests, repro hash) must remain intact.

## Workstream A — Shared Infrastructure

### A1. Transfer Function Utilities
- Implement reusable amplitude transfer helpers (linear, logarithmic, power/exponent curves) as pure math functions in `@utils/audioVisualization`. These accept normalized magnitudes and return remapped values so spectrum/meter elements share logic.
- Add inspector schema snippets (enum + exponent slider when `power`) that reuse these utilities. Leverage existing config patterns for `visibleWhen` logic.

### A2. Multi-Frame Sampling Helpers
- Build a `sampleFeatureHistory(trackId, descriptor, targetTime, frameCount, hopStrategy)` helper atop `sampleAudioFeatureRange` that returns an ordered array of past frames with timestamps. This enables persistence trails and peak-hold markers without per-element caches.
- Provide hop strategies (`equalSpacing`, `profileHop`) so elements can request either evenly spaced history samples or align with cached hop sizes.

### A3. Material/Glow Abstractions
- Define a `GlowStyle` interface encapsulating color, blur radius, opacity falloff, and optionally duplicate-stroke layering.
- Extend `Rectangle`, `Line`, and `Poly` usage helpers to apply glow via existing `setShadow` and multi-layer drawing (e.g., draw a translucent wider line underneath the base stroke). Keep this CPU friendly and deterministic by computing explicit color/alpha values.

### A4. Channel Layer Palette Guidance
- Add a `channelColorPalette(trackChannels)` utility returning deterministic colors per channel (Left, Right, Mid, Side, etc.), reusing palette constants so multi-channel overlays stay legible.

Deliverables: shared utilities with unit coverage, documentation snippets for element owners, and integration hooks consumed in Workstreams B–D.

## Workstream B — Spectrum Enhancements

### B1. Frequency Scale Expansion
- Extend the existing frequency mapping logic to support `Mel` and `Note` scales:
  - `Mel`: convert band positions using the standard mel formula (`f = 700 * (10^{m/2595} - 1)`), backed by helper functions.
  - `Note`: precompute note center frequencies (A0–C8) and snap band centers to those bins, retaining linear interpolation within each note range.
- Update inspector schema with `frequencyScale` enum options (`Linear`, `Log`, `Mel`, `Note`) replacing `useLogScale`. Default remains `Log`.

### B2. Channel Layering & Blends
- Allow multiple descriptors in the spectrum binding to render layered outputs:
  - For stereo descriptors, render stacked or overlaid bars/lines per channel using `channelColorPalette`.
  - Provide a `layerMode` control (`Stacked`, `Overlay`, `Mirror`) that adjusts vertical baseline logic.
- Ensure layout rectangles expand to accommodate combined heights (e.g., `Stacked` doubles height).

### B3. Magnitude-Driven Color Ramps
- Introduce gradient presets driven by normalized magnitudes. Use the new transfer utilities to compute ramp input, then blend between up to three colors (low/mid/high) using existing color mixing logic.
- Inspector: add `colorRamp` group with presets and optional custom stops (limited to three to keep UI manageable within current schema capabilities).

### B4. Transfer & Floor Controls
- Replace `visualGain` with `transferFunction` (enum) + `transferAmount` numeric. Support `Linear`, `Log`, `Power`, `dB` modes implemented via Workstream A.
- Add `noiseFloor` slider (in dB) that clamps values below the threshold to zero opacity when in area/bars modes using `Rectangle.setGlobalAlpha`.

### B5. History Glow Accent
- Use `sampleFeatureHistory` to pull N previous frames (configurable decay window). Render them as translucent overlays with diminishing alpha and increased `softness` to simulate glow trails. Cap history sample count to avoid performance regressions.

Acceptance: inspector exposes new controls with localized strings, render snapshot tests cover each `layerMode`, and performance profiling confirms history rendering stays within budget (<10% additional CPU per frame in reference scenes).

## Workstream C — Volume Meter Enhancements

### C1. Orientation Presets
- Extend meter geometry to support `vertical`, `horizontal`, and `radial` orientations via a new `orientation` enum.
  - `Horizontal`: swap width/height roles when drawing `Rectangle` fill.
  - `Radial`: use `Arc` render objects to draw a swept arc based on normalized value. Provide controls for start/end angles.

### C2. Peak-Hold & Release Indicators
- Sample a short history of RMS values (e.g., last 1–2 seconds) using `sampleFeatureHistory` and compute the maximum to date. Render a thin marker (line or arc) that decays over configurable `holdTime` by comparing timestamps.
- Provide inspector controls for `peakHoldTime` (seconds) and `peakFallSpeed` (dB per second) to control decay.

### C3. Glow & Opacity Curves
- Apply `GlowStyle` to the active meter fill. Allow optional opacity curve mapping normalized level to alpha, using the shared transfer functions for mapping.
- Inspector: add `intensityStyle` group with `glowStrength` slider and `opacityCurve` dropdown referencing transfer functions.

### C4. Label Improvements
- Extend `showText` to a `labelMode` enum: `Off`, `Decibels`, `Percent`, `Custom`. For `Custom`, allow binding to static text or track name (reuse existing `text` property pattern).
- Ensure text positioning respects orientation (e.g., radial labels along arc midpoint using `Text` alignment options).

Acceptance: automated snapshots cover each orientation, peak-hold markers remain deterministic via tests that compare expected decay positions, and localization strings pass copy review.

## Workstream D — Oscilloscope Enhancements

### D1. Channel Presentation Modes
- Expand inspector with `channelMode` enum (`Mono`, `Stereo Overlay`, `Split`, `Lissajous`).
  - `Stereo Overlay`: render individual `Poly` traces per channel using palette colors.
  - `Split`: vertically offset each channel by half height; adjust layout bounds accordingly.
  - `Lissajous`: map left channel samples to X and right channel to Y, scaling using available window data. Reuse `Poly` with `setClosed(false)` and optional fill.

### D2. Zero-Cross Triggering
- Implement an optional `triggerMode` setting (`Free Run`, `Zero Crossing`). When enabled, inspect waveform samples near the window start to locate the nearest upward zero crossing; shift the sampling window to begin at that frame, ensuring stable traces.
- Provide `triggerThreshold` (amplitude) and `triggerDirection` controls for fine tuning.

### D3. Persistence Trails
- Use `sampleFeatureHistory` to collect several previous windows (configurable `persistenceFrames`). Render them sequentially with `Poly.setGlobalAlpha` decreasing per step and optional `GlowStyle` for smooth decay.
- Limit history to keep performance acceptable (e.g., max five past frames) and expose `persistenceDuration` slider that maps to frame count via window length.

### D4. Fill & Styling Options
- Add `fillMode` toggle for area-under-curve: when active, create a duplicate `Poly` with `setFillColor` plus lowered alpha.
- Provide `baselineStyle` controls (color, thickness) by drawing a horizontal `Line` at zero amplitude.

Acceptance: snapshot tests verify each channel mode, persistence layering remains deterministic (history windows derived strictly from caches), and performance stays within thresholds.

## QA & Validation Strategy

- Extend existing unit tests to cover new utilities (`transferFunction`, `sampleFeatureHistory`).
- Add render snapshot suites per element covering new modes (e.g., note scale spectrum, radial meter, Lissajous oscilloscope) across reference scenes.
- Update performance benchmarks to include history-enabled configurations, ensuring regressions are documented and within agreed tolerances.
- Refresh release documentation referencing new controls and link back to this plan once shipped.

## Milestones

1. Shared infrastructure utilities complete with tests (Week 1).
2. Spectrum enhancements implemented and snapshot-tested (Week 3).
3. Volume meter upgrades with orientation + peak hold landed (Week 4).
4. Oscilloscope features plus persistence trails finalized (Week 6).
5. QA validation cycle and doc updates (Week 7).

## Open Questions

- How many history frames can we support before export times degrade noticeably? (Requires profiling with representative scenes.)
- Do note-scale overlays need textual note labels, or is snapping sufficient? (Awaiting design confirmation.)
- Should peak-hold markers share colors with channel palettes or use a global accent? (Coordinate with design for consistency.)
