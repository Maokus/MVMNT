# Audio Visualisation Upgrade Plan

**Status:** Planning Draft (2025-10-10) — updated to reflect the post-`AudioFeatureBinding`
refactor completed in [Legacy Binding Shift](./legacybindingshiftplan.md).

## Purpose
- Translate findings from the feasibility assessment into an actionable plan for improving audio-reactive scene elements before automation work begins.
- Focus on cache-driven determinism, richer channel-aware rendering, and UX affordances that maintain developer clarity.

## Guiding Principles
- **Deterministic rendering:** Keep the renderer stateless; leverage precomputed feature caches for any history-dependent visuals.
- **Composable descriptors:** Allow elements to reference multiple features (e.g., left/right channels) through the `{ trackRef, featureDescriptor }` model established during the legacy binding migration.
- **UX clarity:** Provide intuitive cache invalidation flows and inspector controls that communicate derived vs. authorable parameters.

## Planned Improvements

### 1. Audio Feature System Enhancements
- **Multi-channel feature descriptors**
  - Build on the neutral binding model by letting properties hold multiple `{ trackRef, featureDescriptor }` pairs (e.g., `waveform:left`, `waveform:right`) instead of reviving the deprecated `AudioFeatureBinding` subtype.
  - Introduce lightweight channel aliases in cache metadata so elements can request `waveform.left` / `waveform.right` without duplicating cache storage.
  - Update scene element schemas and inspector controls to collect descriptor arrays for geometry generation (e.g., oscilloscope can request both channels and build separate polylines or Lissajous coordinates).
- **Configurable analysis profiles**
  - Allow projects to define named analysis profiles (FFT size, hop length, window) stored alongside cache versions; elements reference a profile instead of raw FFT parameters.
  - Profiles enable deterministic cache regeneration while keeping element properties simple.
- **Developer mental model**
  - Document feature categories (waveform, spectrum, loudness) and expose them with consistent naming, improving discoverability in the inspector.
  - Normalize units (e.g., amplitude in dBFS, frequency in Hz) and provide helper utilities for common transforms (log scaling, smoothing) so rendering code stays declarative.
  - Reinforce the neutral binding workflow in docs by pointing to the migration summary in `docs/audio-feature-bindings.md`.
- **Performance utilities**
  - Add optional downsample/adaptive sampling helpers that operate on cache reads, allowing high-FPS rendering without re-running analysis.

### 2. Cache Invalidation & UX Flow
- **Property-driven prompts**
  - When an element property implies a different analysis profile (e.g., higher FFT size), display a non-blocking banner prompting users to "Update Audio Analysis" rather than auto-triggering cache invalidation.
  - Show a diff summary (current vs. requested profile) so users understand why regeneration is needed.
- **Scoped cache requests**
  - Maintain a separation between element property definitions and cache configuration by letting elements emit "analysis intents" (metadata describing desired features). The cache scheduler aggregates intents to decide if regeneration is required.
  - Cache stores remain agnostic of individual element properties; they respond to intents via profile matching, preventing tight coupling between scene schemas and cache internals.
- **Developer override tools**
  - Provide a diagnostics panel listing which features are stale, with controls to re-run analysis selectively.

### 3. Spectrum Element Upgrades
- **Scale & overlays**
  - Add Mel and note-scale mappings using utilities that convert FFT bin centers to target scales.
  - Implement approximate note labels derived from bin frequency; annotate labels with prefixes (`~`, `<`, `>`) to signal approximation.
- **Amplitude shaping**
  - Support transfer functions (compression curves, floors) defined via reusable curve presets.
  - Integrate magnitude-driven color ramps by extending render materials to map dB values to gradient stops.
- **Channel rendering**
  - Allow separate left/right or mid/side traces by enabling multiple descriptor entries and drawing stacked or layered bars/lines per channel.

### 4. Volume Meter Enhancements
- **Layout variants**
  - Introduce orientation presets (vertical, horizontal) and polar mode using shared geometry builders.
- **Peak & release behaviour**
  - Use feature history retrieved from caches (e.g., envelope followers) to draw peak hold markers without storing per-frame state in the renderer.
- **Styling hooks**
  - Expand inspector controls for gradient fills and threshold markers; reuse transfer function utilities from the spectrum work.

### 5. Oscilloscope Improvements
- **Channel visualisation options**
  - Enable stereo split by instantiating multiple polylines from separate descriptor entries.
  - Support Lissajous mode by pairing two channel features and mapping them to X/Y coordinates during render object construction; no duplicate caches required, only shared time indices.
- **Triggering and windowing**
  - Add zero-crossing detection utilities operating on cached waveform slices to compute frame-aligned offsets.
- **Styling & overlays**
  - Provide fill-under-curve and glow presets implemented via layered render objects and gradient materials.

### 6. GPU Shader Strategy within Render2D
- **Material abstraction**
  - Extend `render2d` materials to support shader-backed fills where available (e.g., WebGL mode) while falling back to CPU rasterisation for canvas export.
  - Encapsulate shader logic in material definitions so render objects (`Poly`, `Rectangle`) remain unchanged; elements simply choose materials that expose uniforms for gradients/glow.
- **Deterministic exports**
  - Ensure shader parameters derive solely from cache samples and element properties; export pipeline records uniform values per frame to maintain determinism.
  - Provide CPU fallbacks (e.g., gradient meshes) for environments lacking shader support, keeping the renderer behaviorally consistent.

### 7. History & Persistence Effects
- Implement persistence trails by sampling multiple time offsets from the waveform/spectrum caches each frame, rather than accumulating render state.
- Offer inspector controls for decay duration that translate into a fixed set of historical samples pulled from caches (e.g., current frame plus N previous hops), keeping the renderer stateless.

### 8. Documentation & QA
- Update `docs/audio-feature-bindings.md` with the new profile and multi-channel conventions once implemented.
- Create developer guides illustrating cache intent UX and shader material usage.
- Add integration tests covering deterministic export of new visual styles (spectrum note labels, stereo oscilloscope).

## Open Questions
- Should analysis profiles be project-wide presets or scoped per-timeline? (Impacts UX surface area.)
- What minimum GPU feature set should shader materials assume before falling back to CPU?

