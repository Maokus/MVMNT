# Audio visualisation delivery summary

_Last reviewed: 2025-10-15_

## Completed work
### Phase 0 – Foundations and alignment
- Catalogued single-feature assumptions across spectrum, meter, and oscilloscope elements and documented
  migration paths to multi-feature bindings in
  [`docs/audio-visualisation-phase0.md`](../docs/audio-visualisation-phase0.md).
- Refreshed glossary entries for analysis profiles, feature descriptors, track references, and channel
  aliases so planning and documentation share consistent terminology.
- Produced approved UX flows for cache regeneration prompts and diagnostics, forming the baseline for
  later implementation phases.

### Phase 2 – Authoring UX and validation
- Delivered the hierarchical inspector selector for choosing tracks, feature categories, descriptors, and
  channel aliases with multi-select support.
- Shipped inline validation that recommends analysis profiles when descriptor requirements change and
  ensured telemetry/logging captures selector usage for tuning.
- Verified deterministic scene persistence, undo/redo stability, and tooltip/help copy that matches the
  shared glossary.

### Phase 3 – Cache intents and diagnostics
- Implemented structured `AnalysisIntent` emission per element, aggregated diffs in the scheduler, and
  queued regeneration jobs with deterministic batching.
- Delivered a non-blocking banner plus diagnostics panel that surfaces missing, stale, and extraneous
  descriptors grouped by track/profile with targeted regeneration controls.
- Logged regeneration history for developer tooling and export manifests while bounding retention (1000
  entries by default) to keep project payloads slim.
- Captured architecture specifics (intent schema, scheduler diffing, queueing semantics, diagnostics UX,
  failure handling, testing, and telemetry) within this document for future reference.

## In progress
### Phase 1 – Multi-feature analysis architecture
- Extend bindings to accept descriptor arrays with optional channel aliases while maintaining backwards
  compatibility for single-feature scenes.
- Persist named analysis profiles (`analysisProfileId`) with cache metadata so selectors expose alias maps
  and descriptors deduplicate reads per frame.
- Update schema validation, migration scripts, and cache utilities for deterministic downsampling and
  smoothing without relying on mutable renderer state.
- Acceptance criteria remain outstanding: schema migrations, cache metadata exposure, deduplicated cache
  reads, and updated documentation must be verified before closing the phase.

## Upcoming work
### Phase 3.5 – WebGL renderer integration
- Capture a renderer contract that enumerates descriptor payloads, smoothing utilities, and cache intents
  flowing from earlier phases and validate it against reference scenes.
- Implement the WebGL render service with deterministic shader/material abstractions, GPU resource
  lifecycle management, and a CPU fallback for environments without WebGL.
- Port baseline visuals (spectrum, meter, oscilloscope) to the new pipeline, record parity snapshots, and
  exercise regression tests covering determinism and performance budgets.
- Acceptance criteria: published renderer contract with owner sign-off, passing snapshot comparisons,
  verified performance parity or improvements, deterministic CPU fallback, and documented extension
  points (texture slots, material hooks) for Phase 4.

### Phase 4 – Element rendering enhancements
- Spectrum: add Mel and note scale mappings, magnitude-driven colour ramps, channel layering, and
  configurable transfer functions.
- Volume meter: introduce orientation presets, peak-hold markers using cached envelopes, glow/opacity
  curves, and label options.
- Oscilloscope: deliver stereo split, Lissajous mode, zero-cross triggering, persistence trails, and
  fill-under-curve styling with reusable history sampling utilities.
- Acceptance criteria: inspector controls expose the new options with localisation, automated render
  snapshots cover multi-channel layering and persistence, performance budgets stay within target ranges,
  and export determinism tests confirm identical outputs across rerenders.

### Phase 5 – Global styling and export polish
- Implement workspace-level palette, glow, and smoothing multipliers that audio visuals can opt into while
  maintaining deterministic renders.
- Extend export pipelines with oversampling and motion blur settings compatible with the new rendering
  materials.
- Add preset library support for saving audio visual configurations that include linked global styles and
  provide best-practice guidance for combining modules.
- Acceptance criteria: global controls propagate through audio visuals with integration coverage, export QA
  validates new oversampling/motion blur options, presets round-trip without data loss, and documentation
  updates ship alongside in-app help references.

## Open questions
- Should track aliases remain derived from import metadata or become author-editable? Requires alignment
  between UX and the audio pipeline before Phase 4 work proceeds.
- What telemetry granularity is needed to monitor cache regeneration frequency and performance without
  capturing user content?
- Do extraneous descriptor entries warrant automatic cleanup, or should user-controlled dismissal remain
  the default to avoid surprise data loss?
- What retention policy best balances diagnostics usefulness and storage limits for `analysisIntentHistory`
  beyond the current 1000 entry default?

## References
- [`docs/audio-feature-bindings.md`](../docs/audio-feature-bindings.md)
- [`docs/audio-visualisation-phase0.md`](../docs/audio-visualisation-phase0.md)
- [`docs/HYBRID_AUDIO_CACHE.md`](../docs/HYBRID_AUDIO_CACHE.md)
