# Audio Cache Tempo-Domain Research

**Status:** Open Questions (2025-02-22)

## Problem Statement

Current audio feature caches (spectrogram, RMS envelope, oscilloscope data, etc.) are generated in the musical time domain. Cache frames are aligned to ticks/tempo grids, so any tempo change requires recomputation to keep cached features synchronized with playback.

We are evaluating an alternative strategy: store caches in real (absolute) time and remap samples at runtime to the musical timeline. This document explores the trade-offs to inform a potential redesign.

## Comparison Overview

| Criterion | Musical Time Cache (today) | Real-Time Cache (proposal) |
| --- | --- | --- |
| Alignment axis | Tempo-aligned ticks/beats | Wall-clock seconds/milliseconds |
| Tempo change handling | Requires recalculation to maintain sync | Reuses cache; resample to new tempo |
| Storage shape | `frameIndex -> tick` | `frameIndex -> timeOffset` |
| Primary consumers | Timeline playback, export, inspectors | Same consumers with added resampling layer |

## Potential Benefits of Real-Time Caching

### 1. Tempo Change Flexibility
- **No recomputation on tempo edits.** Tempo adjustments would only affect how we convert ticks to seconds when sampling cached data, eliminating expensive recalculation passes for large audio assets.
- **Faster iteration.** Authoring workflows involving frequent tempo experimentation would see immediate preview updates because caches remain valid.

### 2. Simplified Audio Analysis Pipeline
- **Remove tempo dependency.** Offline analysis could operate solely in audio sample space, avoiding the need for tempo-aware hop size calculations. This may simplify calculator APIs and make it easier to reuse existing DSP tooling that assumes fixed sample windows.
- **Consistent cache granularity.** Frame spacing would be uniform across projects regardless of tempo map complexity, making cache comparisons and reuse more straightforward.

### 3. Cross-Project Reuse & Sharing
- **Reuse across tempo maps.** If the same audio is imported into multiple projects with different tempos, a single real-time cache blob could serve all cases without project-specific regeneration.
- **Potential CDN caching.** Server-side cache generation could produce tempo-agnostic artifacts, enabling broader reuse and simpler cache keying.

### 4. Export Determinism
- **Align with rendering pipelines.** Final renders typically operate in the real-time domain; storing caches in the same domain removes one conversion step and may reduce floating-point drift between live playback and export.

## Potential Drawbacks & Risks

### 1. Runtime Sampling Complexity
- **Additional interpolation logic.** Every consumer (scene elements, exporters, inspectors) must convert musical positions to real-time offsets and interpolate between cache frames. We need robust utilities to handle tempo curves, swing, and edge cases like tempo ramps.
- **Performance overhead.** Live playback would incur extra math per frame to map ticks to time. Need to evaluate CPU impact, especially for high frame-rate visualizations or many concurrent bindings.

### 2. Tempo Map Nonlinearity
- **Handling variable tempo.** Musical timelines may include tempo ramps, sudden changes, and signature shifts. Mapping a non-linear tempo function to real-time requires integrating tempo over time, which could introduce numerical instability or require dense lookup tables.
- **Reverse mapping challenges.** Features that require inverse lookups (time -> tick) for aligning annotations may become more complex if caches live only in the time domain.

### 3. Loss of Musical Resolution Guarantees
- **Tick alignment expectations.** Existing tooling assumes each cache frame corresponds to a fixed tick interval (`hopTicks`). Switching to real-time frames removes this guarantee, requiring updates to any feature that relies on tick-based indexing or modulo math (e.g., quantized visual effects).
- **Edge case accuracy.** For very slow tempos, real-time caches may undersample musical events (few frames per bar), while for fast tempos they may oversample. We may need adaptive sampling or oversampling strategies.

### 4. Migration & Compatibility Costs
- **State schema changes.** Persisted projects, exports, and plug-in calculators currently encode tempo-dependent metadata. Migrating to real-time caches requires versioned schemas, migration scripts, and dual-read support during rollout.
- **Calculator ecosystem impact.** Third-party calculators expect tempo-aware contexts. We must provide clear migration paths and possibly maintain compatibility layers, increasing engineering scope.
- **Testing surface expansion.** All existing parity tests, exporters, and bindings need to be revalidated against the new sampling domain, increasing QA overhead.

## Hybrid Strategies

1. **Dual-Domain Metadata**
   - Store caches in real time but annotate with derived `hopTicks` for canonical tempos. This could ease migration but risks confusion if annotations become stale after tempo edits.

2. **On-Demand Retiming Cache**
   - Keep real-time master caches and generate tempo-aligned views lazily when specific workflows demand them (e.g., quantized inspector overlays). Requires caching layers to avoid recomputation thrash.

3. **Adaptive Sampling**
   - Use real-time caches with variable frame spacing based on tempo features (dense frames during rapid tempo changes). Maintains fidelity while reducing interpolation error.

## Open Questions

- What is the acceptable CPU budget for runtime resampling per frame during playback/export?
- Do any current plug-in calculators rely on tick-perfect alignment semantics that would break without redesign?
- Can we design a shared timing service that efficiently maps ticks to real time across complex tempo maps without recomputation?
- How would dual support (musical + real-time caches) impact project file size and migration complexity?

## Next Steps

1. Prototype a resampling utility that converts tick positions to real-time offsets using existing tempo map data structures. Benchmark its performance under worst-case tempo curves.
2. Audit current feature consumers to catalog assumptions about `hopTicks`, frame counts, and tick alignment.
3. Draft a migration plan covering state schema updates, calculator API changes, and backward compatibility for existing projects.
4. Decide whether to pursue a hybrid approach (dual metadata or on-demand views) after evaluating prototype results.

## References

- [`docs/audio-feature-bindings.md`](../docs/audio-feature-bindings.md)
- [`thoughts/audio_vis_research_3.md`](./audio_vis_research_3.md)
