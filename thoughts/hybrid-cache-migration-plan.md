# Hybrid Audio Feature Cache Migration Plan

**Status:** Completed (2025-02-24)

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

**Status:** Completed & validated (2025-02-24)

- **Adapter design**
  - Delivered `@audio/features/tempoAlignedViewAdapter` exposing `getTempoAlignedFrame` and `getTempoAlignedRange` helpers that wrap cache resolution, tempo mapping, and interpolation controls.
  - Added `'linear'`, `'hold'`, and `'spline'` interpolation profiles with documentation and tests illustrating their latency trade-offs.
  - Diagnostics now capture cache hits, mapper latency, interpolation mode, and fallback reasons for DevTools overlays and telemetry sinks.
- **Consumer integration**
  - Playback bindings now call the adapter directly and record diagnostics while honoring the rollout toggle for legacy fallbacks.
  - Inspector selectors and range samplers delegate to the adapter so zoom/pan calculations align with mapper offsets across the UI.
  - Documentation captures the adapter API for plug-ins and calculators, including sample code for migrating to the new helpers.
- **Performance & quality validation**
  - Automated parity tests now compare adapter-enabled and legacy-disabled paths across playback, selector, and export scenarios.
  - QA scripts log tempo-edit coverage and BPM stress notes into the hybrid cache telemetry view fed by adapter diagnostics.
  - Mapper latency is recorded per request and surfaced through store diagnostics to ensure budgets stay within Phase 0 limits.
  - Store-level unit tests verify diagnostics storage and fallback logging so telemetry dashboards stay in sync with adapter behaviour.

**Dependencies:** Requires Phase 2 tempo mapper APIs to be marked stable and real-time cache writes from Phase 1 available in test projects.

### Phase 4 — Migration & Rollout

**Status:** Completed & validated (2025-02-24)

- **Dual-read period**
  - Introduced a rollout flag (`setHybridCacheAdapterEnabled`) with per-project overrides and bounded fallback logging for rapid triage.
  - Telemetry dashboards now ingest adapter diagnostics, tracking CPU, hit ratios, mapper latency, and fallback frequency daily.
- **Data backfill & readiness**
  - Warmup jobs monitor top assets, reporting progress alongside adapter diagnostics in release dashboards.
  - Export farm readiness checks integrate the rollout flag to guarantee real-time caches are primed before enabling in production regions.
- **Documentation, enablement & support**
  - Updated calculator SDK guidance describes adapter migration steps, diagnostics fields, and troubleshooting flow tied into the docs portal.
  - Support/on-call runbooks cover telemetry signals, fallback handling, and rollout toggles for rapid response.
- **Graduation criteria & cleanup**
  - Graduation targets remain ≥90% adapter coverage with no severity-1 incidents while staying within CPU budgets, tracked via telemetry.
  - Legacy tempo-domain writes and dual paths are slated for removal once the thresholds hold; adapters emit audit logs to support the final summary of performance wins and lessons learned.
  - Rollout tooling is now covered by unit tests that guarantee fallback logs stay bounded and diagnostic buffers clear correctly.

**Dependencies:** Requires telemetry dashboards and backfill tooling from earlier phases plus sign-off from playback, export, and support leads.

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
