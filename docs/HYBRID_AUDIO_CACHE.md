# Hybrid Audio Feature Cache Architecture

_Last reviewed: 2025-10-09_

## Overview

The hybrid audio feature cache system stores analysis output in real-time aligned caches while
exposing tempo-aware projections on demand. Real-time caches are the single source of truth; tempo
alignment is handled by a shared mapper so playback, editing, and export flows consume identical
data.

Goals achieved by the migration:

- Real-time caches eliminate duplicated tempo-domain storage while preserving deterministic playback.
- Tempo mapping is centralized in a stateless service that supports constant, stepped, and ramped
  tempo segments.
- Tempo-aligned adapters deliver measurable latency reductions for tempo-edit workflows without
  regressing CPU budgets validated during rollout.

## Core Components

### Real-Time Master Cache

- Persisted via `@audio/features/audioFeatureTypes` with `frameDurationSec` metadata.
- Stores typed arrays per feature track plus optional per-track statistics for quick diagnostics.
- Migration utilities (`hydrateHybridAudioCache`) upgrade legacy tempo-domain caches when projects load
  so consumers only read the new schema.

### Tempo Mapper Service

- Implemented in `@audio/features/tempoMapperService` and wraps `TimingManager` integration helpers.
- Supports forward (tick to seconds) and inverse (seconds to tick) projections, including batch
  conversions for range sampling.
- Memoizes tempo integrals per segment to keep conversions O(1) during steady sections and records CPU
  timings for telemetry sampling.

### Tempo-Aligned View Adapter

- Exposed through `@audio/features/tempoAlignedViewAdapter` with `getTempoAlignedFrame` and
  `getTempoAlignedRange` helpers.
- Handles interpolation profiles (`linear`, `hold`, `spline`) and surfaces diagnostics (cache hit rate,
  mapper latency, interpolation mode, fallback reason).
- Integrates with selectors in `@state/selectors/audioFeatureSelectors` so UI and export callers only
  pass ticks.

## Data Lifecycle

1. Analysis calculators emit real-time frames keyed by seconds with metadata describing hop size,
   windowing, and calculator versions.
2. `ingestAudioFeatureCache` persists the cache, triggers `hydrateHybridAudioCache`, and records
   diagnostics.
3. Runtime bindings request frames via selectors, which call the tempo-aligned adapter. The adapter
   projects ticks through the mapper, interpolates values, and returns diagnostics.
4. Telemetry listeners stream diagnostics into DevTools overlays and rollout dashboards.

## Diagnostics and Telemetry

- `TimelineState.recordTempoAlignedDiagnostics` retains the latest diagnostic per source for DevTools.
- `TimelineState.hybridCacheRollout.fallbackLog` keeps a bounded history when adapters fall back to
  compatibility sampling.
- Profiling hooks expose per-request mapper latency so performance budgets remain observable.
- Automated tests compare adapter-enabled and legacy-disabled paths to guard numerical parity.

## Migration and Compatibility

- Dual-read rollout is gated by `setHybridCacheAdapterEnabled`. Production defaults are enabled, with
  per-project overrides available for triage.
- Warmup jobs prime caches for top assets and report readiness alongside adapter diagnostics in
  release dashboards.
- Export farms run readiness checks to ensure caches are populated before enabling the adapter in a
  region.
- Graduation criteria target ≥90% adapter coverage without severity-one incidents while staying within
  CPU budgets; telemetry dashboards surface these thresholds.

## Developer Checklist

- Use selectors from `@state/selectors/audioFeatureSelectors` instead of reading caches directly.
- When adding calculators, return real-time `frameDurationSec` metadata and bump versions on breaking
  analysis changes.
- Capture diagnostics in new UI surfaces by reading `TimelineState.hybridCacheRollout` helpers rather
  than adding bespoke logging.
- Document external integrations in [`audio-feature-bindings.md`](./audio-feature-bindings.md) so the
  docs portal stays aligned.
