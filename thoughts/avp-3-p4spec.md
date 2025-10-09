# Audio Visualisation Phase 4 — Element Rendering Enhancements Spec

**Status:** Draft for Review (2025-10-13)

This document details the execution plan for Phase 4 of the consolidated [Audio Visualisation Implementation Plan (Phase Consolidation)](./audio-visualisation-plan-3.md). Phase 4 focuses on delivering the advanced rendering treatments for spectrum, meter, and oscilloscope elements while grounding the new "material" abstractions in the current renderer stack.

## Objectives
- Deliver the spectrum, meter, and oscilloscope rendering enhancements called out in the Phase 4 goals.
- Introduce a reusable material abstraction that works with the existing Canvas-based renderer and can later be swapped onto a WebGL render object.
- Maintain deterministic renders by sourcing all visual samples from cached features and declarative material parameters.
- Ensure inspector controls expose the new rendering affordances with terminology aligned to glossary definitions.

## Success Metrics
- **Visual Fidelity:** Render snapshots covering reference scenes (mono, stereo, advanced) match the updated design mocks within agreed tolerances.
- **Determinism:** Re-rendering the same timeline with identical cache inputs produces byte-for-byte identical exports.
- **Performance:** Advanced materials add <10% frame time overhead compared to Phase 3 builds on mid-tier hardware.
- **Reusability:** At least two elements share a material or transfer-function implementation with no duplicate rendering logic.

## Scope
- Material abstraction that encapsulates glow, gradients, channel layering, and persistence for Canvas2D, with a path to WebGL.
- Enhancements to the three core audio visuals (spectrum, meter, oscilloscope) leveraging multi-feature bindings.
- Inspector panel updates for new rendering parameters and presets.
- Deterministic history sampling utilities that work across renderer implementations.

### Out of Scope
- Full migration to WebGL (tracked separately in [WebGL Render Migration Plan](./webgl-render-migration-plan.md)).
- Global styling controls (Phase 5 responsibility).
- Automation or MIDI-driven parameter modulation.

## Architecture Overview

### Rendering Flow Additions
1. **Descriptor Sampling Layer:** Extend the render prep step to request multiple descriptor buffers via the Phase 1 cache API, including history ranges defined by element persistence settings.
2. **RenderObject Composition:** Wrap each element in a `AudioVisRenderObject` that orchestrates:
   - Feature sampling (current frame + history window).
   - Material evaluation (color/opacity/glow/persistence curves).
   - Geometry emission to the active renderer (Canvas2D today, WebGL later).
3. **Material Invocation:** Materials expose a `evaluate(sampleContext)` method returning `StrokeStyle` and `FillStyle` instructions that the render object converts into renderer-specific commands.

### Material Abstraction
- **MaterialDescriptor:** Declarative schema persisted in scene JSON.
  ```ts
  type MaterialDescriptor = {
    id: string; // e.g., "spectrum.glowGradient"
    uniforms: Record<string, number | number[] | string>;
    transferFunctions: {
      magnitude?: TransferFunctionId;
      persistence?: TransferFunctionId;
      colorRamp?: ColorRampId;
    };
    blendMode: 'additive' | 'screen' | 'alpha';
  };
  ```
- **RenderMaterial Interface:**
  ```ts
  interface RenderMaterial<TDrawCommand> {
    readonly descriptor: MaterialDescriptor;
    evaluate(context: MaterialContext): MaterialEvaluation<TDrawCommand>;
  }
  ```
  - `MaterialContext` bundles descriptor samples (per-channel magnitudes/envelopes), frame time, and element sizing metadata.
  - `MaterialEvaluation` emits high-level draw instructions (`strokes[]`, `fills[]`, glow layers) agnostic of renderer implementation.
- **Renderer Adapters:**
  - `CanvasMaterialAdapter` consumes `MaterialEvaluation` and maps them to Canvas2D gradient objects, shadowBlur, and composite operations.
  - Future `WebGLMaterialAdapter` maps the same evaluation into shader uniform updates and draw calls.
- **Lifecycle:** Materials are created during inspector configuration (`MaterialFactory.create(descriptor)`), cached per element, and rebuilt only when descriptor uniforms change. This ensures deterministic evaluation without frame-to-frame mutation.

### Approaches to Integrate with the Current System
- **Canvas Compatibility Layer:** Implement `AudioVisRenderObject` as a thin wrapper around existing Canvas draw routines. It accepts a `RenderMaterial` and delegates to `CanvasMaterialAdapter` for actual drawing. This allows advanced gradients/glow while keeping CPU rendering deterministic.
- **History Sampling Utility:** Introduce `SampleHistoryReader` that, given `historyWindowMs` and `sampleRate`, produces a fixed-size ring buffer of cached descriptor values. Materials read from this buffer instead of storing renderer-local state, matching Phase 4's persistence requirement.
- **Transfer Function Library:** Centralize gamma curves, logarithmic scaling, and magnitude-to-color ramps inside `/src/audioVis/transferFunctions`. Materials reference them by ID so both Canvas and future WebGL renderers reuse identical math.
- **Render Object + Shader Analogy:** Although the current renderer is CPU-based, the material API mirrors GLSL shader semantics: uniforms (material parameters), varying inputs (descriptor samples), and outputs (draw instructions). This parallel design eases eventual migration to the WebGL `IRenderObject` described in the migration plan.

## Element Enhancements

### Spectrum
- **Descriptor Usage:** Pull Mel bands, note-scale magnitudes, and per-channel RMS via multi-feature bindings.
- **Rendering:**
  - Map magnitudes through configurable transfer functions (logarithmic, power, hybrid) before feeding the material.
  - Layer channels with optional `blendMode` per channel (`screen` for stereo overlays, `additive` for sum).
  - Materials support color ramps keyed by musical pitch or decibel range.
  - Add optional peak-hold line computed from cached peak envelopes (Phase 1 descriptors) with configurable decay.
- **Inspector Controls:** presets for `Mel Glow`, `Note Heatmap`, `Minimal Bars`; toggles for channel overlay vs split.

### Volume Meter
- **Descriptor Usage:** Combine peak, RMS, and short-term loudness descriptors for each bound channel.
- **Rendering:**
  - Orientation presets (`vertical`, `horizontal`, `radial`), each mapping to a geometry builder that outputs bars or arcs.
  - Materials drive glow intensity via peak overs (`peak - rms`) and persistence via cached envelope history.
  - Peak-hold markers implemented as separate draw instruction emitted when descriptor surpasses threshold; resets using cached peak release values.
- **Inspector Controls:** orientation dropdown, peak-hold duration slider, glow intensity curve selector, label format (LUFS, dBFS).

### Oscilloscope
- **Descriptor Usage:** Waveform descriptor arrays for left/right channels plus optional derivative for Lissajous.
- **Rendering:**
  - `Stereo Split`: two render objects sharing material but offset vertically.
  - `Lissajous`: combine left/right descriptors through `MaterialContext` to produce XY path instructions.
  - `Zero-cross Triggering`: Use descriptor metadata (pre-computed zero-cross indices) to align history window.
  - `Persistence Trails`: Material reads `SampleHistoryReader` to fade prior frames using deterministic exponential decay.
  - `Fill-under-Curve`: Additional fill instruction derived from waveform path for single-channel mode.
- **Inspector Controls:** mode selector (`Single`, `Split Stereo`, `Lissajous`), persistence time slider, trigger source dropdown.

## Data & Schema Changes
- Extend element schemas with:
  - `material: MaterialDescriptor`
  - `historyWindowMs` (numeric, shared across elements using persistence)
  - `transferFunctionId` overrides per property (e.g., magnitude, persistence, glow)
  - `orientation` (meter only), `oscMode` (oscilloscope)
- Provide migrations that default `material.id` to baseline presets to avoid breaking legacy scenes.
- Update validation to ensure referenced transfer functions and color ramps exist.

## Inspector & UX Updates
- Reuse Phase 2 selector components for multi-feature binding display.
- New inspector sections:
  - **Material Preset Picker:** Dropdown with preview swatches; selecting a preset updates `material.id` and uniform defaults.
  - **Channel Layering:** Chips indicating channel alias + blend mode.
  - **Persistence:** Slider controlling `historyWindowMs` with inline tip referencing determinism guarantees.
- Copy references glossary terms (e.g., "analysis profile", "descriptor", "persistence window") per documentation guidelines.

## Testing Strategy
- **Unit Tests:**
  - Material evaluation returns identical instructions given identical inputs across frames.
  - Transfer function outputs validated against analytical expectations (log, Mel scaling).
  - History sampling utility produces deterministic buffers for varying window sizes.
- **Integration Tests:**
  - Render harness compares Canvas snapshots for reference scenes (mono spectrum, stereo meter, oscilloscope persistence) against golden images.
  - Inspector interactions mutate material descriptors and trigger rerender without cache thrashing.
  - Performance benchmarks measure frame time before/after enabling materials.
- **Regression Tests:** Ensure legacy scenes without materials render identically after schema migration.

## Rollout Plan
1. **Behind Feature Flag:** `feature.audioVis.materialsPhase4` gating new inspector controls and render paths.
2. **Internal Verification:** Share reference scenes with design for visual QA; adjust transfer functions/material defaults accordingly.
3. **Performance Sweep:** Profile high-density scenes (e.g., 8-channel spectrum) to confirm <10% overhead target.
4. **Staged Release:** Expand flag rollout once tests pass and export determinism is validated.
5. **Documentation:** Update release notes and link from inspector "Learn More" entry.

## Open Questions
- Should material descriptors be shared across elements (global registry) or copied per element to allow local tweaks?
- Do we need editor-side previews of material presets without playing audio, and if so how do we seed descriptor data?
- What fallback behaviour should occur when the Canvas renderer lacks support for certain composite operations (e.g., additive on older browsers)?

## Decisions
- Mirror GLSL concepts (uniforms, blend modes, transfer functions) in the material API to ease migration to the planned WebGL render objects.
- Use history sampling utilities for persistence effects instead of frame-to-frame renderer state, preserving determinism.
- Leverage feature flags for staged rollout to manage risk while evolving both renderer and inspector code paths.
