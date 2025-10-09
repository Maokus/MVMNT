# Audio Visualisation Feasibility Assessment

**Status:** Assessment (2025-10-10)

## Summary
- Evaluate how the existing audio feature pipeline and scene elements map onto the spectrum, meter, and oscilloscope requirements in `audio-visualisation-specs.md`.
- Highlight gaps that require new calculators, configuration options, or rendering effects before these visuals can match the authored video/export use cases.
- Recommend a phased path that reuses the post-migration binding model (track refs plus feature
  descriptors), hybrid caches, and deterministic export loop while adding production-grade controls.

## Existing Building Blocks
- The audio feature cache system already precomputes spectrogram, RMS, and waveform data with deterministic playback/export guarantees. See [Audio Feature Caches and Bindings](../docs/audio-feature-bindings.md) for selectors, cache layout, and binding mechanics.【F:docs/audio-feature-bindings.md†L1-L78】
- Scene elements for spectrum, volume meter, and oscilloscope exist today (`AudioSpectrumElement`, `AudioVolumeMeterElement`, `AudioOscilloscopeElement`). They expose band counts, layout dimensions, and color presets, and they consume cache samples during playback and export.【F:src/core/scene/elements/audio-spectrum.ts†L1-L244】【F:src/core/scene/elements/audio-volume-meter.ts†L1-L132】【F:src/core/scene/elements/audio-oscilloscope.ts†L1-L120】
- Rendering happens inside the deterministic scene runtime, so any additional smoothing, glow trails, or post effects must integrate with existing render objects (`Rectangle`, `Line`, `Poly`) and the accumulation buffer hooks used elsewhere in the app.

## Gap Analysis by Module

### Spectrum Display
- **Frequency scale modes:** UI only toggles linear vs. logarithmic. Supporting Mel and note scales needs new mapping utilities plus labeling for overlays.【F:src/core/scene/elements/audio-spectrum.ts†L200-L274】
- **FFT/bin resolution control:** FFT size and window metadata come from the cache, not from per-element overrides. Exposing user control means extending the analysis scheduler to regenerate caches with requested FFT sizes and hop windows, along with cache invalidation UX.
- **Temporal and frequency smoothing:** Descriptor smoothing forwards to cache sampling, but additional temporal blending/glow trails require either accumulating frame history on the element or rendering into offscreen buffers. Frequency averaging could happen by downsampling the sampled frame before drawing (new utility).
- **Amplitude mapping and floor controls:** Current rendering converts decibels to height with a fixed linear mapping plus a `visualGain` multiplier. Implementing dB compression curves, floors, or custom response curves needs configurable transfer functions and potentially GPU shaders for continuous gradients.
- **Display styles:** Bars/lines/dots/digital exist, but hybrid (line + area) or history/peak traces would require layering multiple render object passes and storing peak decay state between frames.
- **Color, glow, and overlays:** Gradient mapping across frequency is supported; magnitude-driven color ramps, glow persistence, and db/hz/note overlays are missing. Glow would benefit from post-processing in the export renderer; overlays require additional pitch detection (max bin to note) utilities.
- **Channel modes:** Only aggregate magnitudes render today. Supporting mid/side or individual channel traces requires calculator support plus UI to select channels per element.

### Volume / Level Meter
- **Shape variety:** Current element renders a vertical rectangle with optional text. Horizontal, radial, or custom shapes need either new element variants or parameterized drawing (e.g., polar coordinate renderer).【F:src/core/scene/elements/audio-volume-meter.ts†L68-L132】
- **Peak hold and release curves:** No stateful peak memory exists; add-on requires per-element history buffers and configurable release times.
- **Opacity/ambient styling:** Some controls (color, dimensions, text) exist, but advanced opacity curves, idle glow, or ambient pulses would require additional properties and render-time animations (possibly leveraging the automation system for idle pulses).
- **Value-to-effect routing:** Mapping level to other element properties is outside current binding model; enabling it would intersect with future automation/macro enhancements.

### Oscilloscope
- **Triggering and alignment:** Viewports follow a simple offset and window; there is no zero-cross trigger or envelope locking. Implementing those needs additional waveform analysis before plotting.【F:src/core/scene/elements/audio-oscilloscope.ts†L25-L118】
- **Persistence trails:** The renderer plots a single polyline per frame. Persistence or heatmap trails require storing multiple past frames and compositing them with decay.
- **Interpolation/downsampling control:** Sampling uses `sampleAudioFeatureRange` with defaults; exposing raw vs. interpolated vs. decimated drawing would need new options and adapters in the selector layer.
- **Channel visualization modes:** Current element draws a mono overlay. Stereo split, XY (Lissajous), or other layouts require either duplicating geometry or introducing a flexible multi-channel renderer.
- **Styling controls:** Glow, fill-under-curve, opacity curves, and baseline styling are not yet configurable.

### Cross-Module & Rendering Considerations
- **Global styling hooks:** Palette sharing or global easing multipliers are not wired through the scene store. Implementing them implies extending global scene config and binding contexts so elements can reference shared gradients or easing presets.
- **Persistence effects:** The render pipeline lacks generalized accumulation buffers. Introducing them impacts both live preview (WebGL/canvas performance) and export determinism; careful profiling is needed.
- **Export configuration:** Current export dialog handles resolution and duration; adding oversampling, motion blur, or dithering demands updates to export UI and renderer options.

## Technical Risks & Dependencies
- **Cache regeneration costs:** Allowing per-scene FFT or waveform window tweaks could trigger expensive re-analysis. We need scheduler UI to batch requests, background workers, and cache versioning updates (see hybrid cache docs).【F:docs/audio-feature-bindings.md†L9-L57】
- **Real-time preview performance:** Persistence trails and glow effects may require WebGL shaders or OffscreenCanvas support. CPU-based SVG/Canvas could stutter at high frame sizes.
- **UI complexity:** Exposing many parameters risks overwhelming users. Grouped presets, collapsible advanced panels, and template linking must ship alongside new controls.
- **Pitch/notation overlays:** Accurate note naming depends on precise frequency bin mapping and tuning references (A4=440 vs. custom). Need a robust utility with unit tests to avoid misleading overlays.

## Recommended Phasing
1. **Analysis Enhancements (Foundations)**
   - Extend audio feature calculators to accept FFT/bin configuration and expose channel metadata.
   - Add smoothing and downsampling utilities that can be reused by spectrum and oscilloscope elements.
2. **Element Upgrades (Core visuals)**
   - Augment spectrum, meter, and oscilloscope elements with advanced display modes, peak traces, and channel options.
   - Introduce persistence/glow via reusable decay helpers; ensure export determinism with snapshot-based tests.
3. **Global Styling & Export Controls (Polish)**
   - Implement shared palette/easing settings in the scene store and surface them in the inspector.
   - Expand export pipeline to support oversampling, motion blur, and high-resolution renders with QA on render time.
4. **Advanced Overlays & Automation (Optional)**
   - Add db/hz/note overlays, idle animations, and cross-parameter linking once the automation overhaul (`automation-research-2.md`) lands.

## Feasibility Outlook
- **Short term:** Incremental upgrades (log scale polish, basic peak hold, simple glow) are feasible with current infrastructure because elements already render from audio caches.
- **Medium term:** Achieving the full spec requires expanding the analysis scheduler and render effects toolkit; expect multiple sprints focused on cache configurability and GPU-friendly rendering.
- **Long term:** Global parameter linking and advanced post-processing should align with broader automation and rendering roadmap work, ensuring cohesive UX rather than piecemeal toggles.

