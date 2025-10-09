# Hybrid Audio Feature Cache Migration Plan

**Status:** Draft (2025-02-23)

This plan builds on the findings from [`audio-cache-tempo-domain-research.md`](./audio-cache-tempo-domain-research.md) to guide a migration toward a hybrid cache architecture that stores audio feature caches in real time while providing tempo-aligned views on demand through a shared tempo mapper service.

## Objectives

1. **Establish real-time caches as the canonical storage** for audio features such as spectrograms, RMS envelopes, transient maps, and oscilloscopes.
2. **Introduce a thin, shared tempo mapper service** that can project tempo-aware views for playback, editing, and export workflows with minimal duplication.
3. **Maintain backward compatibility** during rollout, supporting existing tempo-domain caches until projects and calculators migrate.
4. **Deliver measurable performance wins** in tempo-edit workflows while keeping runtime resampling costs within the CPU budget identified in the research phase.

## Architecture Overview

- **Real-Time Master Cache**: Persistent storage keyed by audio asset and feature type, indexed by absolute time offsets. Cache metadata includes frame duration, sample rate, and precomputed statistics needed for interpolation.
- **Tempo Mapper Service**: Stateless service exposing APIs to map between musical positions (ticks/beats) and real-time offsets using shared tempo map primitives. Supports forward (tick → time) and inverse (time → tick) queries, with caching for common ranges.
- **Tempo-Aligned Views**: Lightweight adapters that consume master caches and mapper APIs to present tempo-aligned frames to UI layers, exporters, and plug-ins. Views handle interpolation and optional oversampling.

## Implementation Phases

### Phase 0 — Foundations & Alignment

- **Finalize success metrics**: Define acceptable CPU overhead for tempo mapping per frame, cache size budgets, and latency thresholds for tempo edits.
- **Create RFC**: Circulate architecture proposal to playback, calculator, and tooling teams; incorporate feedback from tempo-domain research.
- **Inventory dependencies**: Catalog all existing cache consumers, their assumptions about tick alignment, and required feature parity.

### Phase 1 — Real-Time Cache Infrastructure

- **Schema & storage updates**
  - Introduce new cache schema version with real-time indexing.
  - Implement migration scripts capable of generating real-time caches from existing tempo-domain data during project load.
  - Update persistence layer to write both schema versions during dual-support period.
- **Calculator pipeline changes**
  - Update offline calculators to emit real-time frames (seconds-based hop size).
  - Provide utility functions for calculators needing tick metadata (e.g., optional annotations derived from canonical tempo at analysis time).
- **Testing**
  - Extend golden-file tests to cover real-time cache generation.
  - Add regression tests comparing numerical equivalence of feature values before/after migration.

### Phase 2 — Tempo Mapper Service

- **Core API development**
  - Implement tempo integration utilities supporting constant, stepped, and ramped tempo segments.
  - Expose batch mapping methods to convert frame ranges efficiently.
  - Support inverse mapping with tolerance controls for non-monotonic sections.
- **Performance optimizations**
  - Introduce caching of tempo integrals per segment for O(1) conversions in steady sections.
  - Benchmark mapper under stress scenarios (dense tempo changes, long projects).
- **Validation**
  - Create unit tests for mapping accuracy across representative tempo maps.
  - Integrate profiling hooks to measure CPU cost per query during playback simulations.

### Phase 3 — Tempo-Aligned View Layer

- **Adapter design**
  - Implement shared view adapter capable of sampling master caches using mapper outputs with configurable interpolation (linear, spline, hold).
  - Support multi-channel features and metadata propagation (e.g., phase offsets).
- **Consumer integration**
  - Update playback pipeline to source tempo-aligned frames via adapters.
  - Modify editor visualizations (spectrogram timelines, envelope inspectors) to request views rather than direct cache access.
  - Provide helper utilities for plug-ins to opt into tempo-aligned views with minimal code changes.
- **Quality checks**
  - Compare playback/export parity against legacy system using automated snapshot tests.
  - Capture QA scenarios covering tempo edits, ramps, and extreme BPM ranges.

### Phase 4 — Migration & Rollout

- **Dual-read period**
  - Ship feature flags allowing projects to opt into hybrid caches while retaining legacy paths.
  - Monitor telemetry for CPU usage, cache hit rates, and error reports.
- **Data backfill**
  - Precompute real-time caches for frequently used shared assets to mitigate on-demand conversion spikes.
- **Documentation & support**
  - Update calculator SDK docs with new APIs and migration steps.
  - Publish rollout guide for production support teams.
- **Graduation criteria**
  - Remove legacy tempo-domain cache writes once opt-in adoption passes threshold and telemetry confirms performance targets.

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Runtime CPU overhead exceeds budget | Optimize mapper caching, introduce adaptive sampling controls, and profile hot paths early in Phase 2. |
| Third-party calculators rely on tick-indexed caches | Provide compatibility shims and clear deprecation timeline; surface validation warnings when plug-ins access deprecated fields. |
| Migration scripts introduce load-time regressions | Run load benchmarks on representative project sets; stage rollouts with telemetry gating. |
| Numerical drift between views and exports | Align interpolation strategies between live adapters and export pipeline; add integration tests to compare outputs bit-for-bit where possible. |

## Open Questions

- Do we need per-track tempo overrides (e.g., rubato regions) that require mapper extensions beyond global tempo maps?
- What sampling strategies best balance fidelity and cache size for extremely slow or fast tempos?
- Can we expose the tempo mapper as a reusable service for non-audio timelines (e.g., automation curves) without overloading the initial scope?

## Next Actions

1. Draft RFC summarizing architecture and solicit sign-off from playback, export, and tooling leads.
2. Schedule implementation spikes for real-time cache generation and tempo mapper prototyping.
3. Define telemetry dashboards needed to monitor CPU and cache performance during dual-read rollout.
4. Align with docs team on updating calculator SDK guidance prior to public rollout.
