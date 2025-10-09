# Audio Visualisation Implementation Plan (Phase Consolidation)

**Status:** Planning Draft (2025-10-10)

## Goals
- Deliver spectrum, meter, and oscilloscope visuals that are expressive, legible, and deterministic for rendered exports.
- Enable creators to author multi-channel, profile-aware audio bindings without reintroducing legacy binding complexity.
- Provide UX flows that explain cache regeneration, glossary terms, and diagnostics to keep developer and creator mental models aligned.
- Introduce rendering treatments (glow, persistence, overlays) and global styling controls that match the specs for video-first workflows.

## Guiding Principles
- **Determinism first:** Rendering must derive solely from cached audio features and declared parameters; no frame-to-frame mutable renderer state.
- **Composable descriptors:** Elements bind to `{ trackRef, featureDescriptor, profileId }` tuples and can request multiple descriptors per property.
- **Transparent UX:** Inspector copy, prompts, and documentation use glossary-backed terminology and clearly communicate when caches must regenerate.
- **Reusable utilities:** Shared smoothing, downsampling, transfer functions, and rendering materials power all audio visuals to avoid bespoke logic.

## Dependencies & Assumptions
- Uses the neutral binding model delivered in the Legacy Binding Shift work.
- Relies on `docs/audio-feature-bindings.md` as the canonical reference for descriptors, analysis profiles, and cache behaviour.
- Excludes automation-driven parameter linking until the broader automation research plan lands.

## Phase 0 — Foundations & Alignment
**Status:** Complete (2025-03-08)

**Goal:** Baseline terminology, schemas, and UX references before touching runtime code.

**Key Activities**
- Audit existing element schemas and inspector panels to catalogue single-feature assumptions and owner teams.
- Update glossary entries for "analysis profile", "feature descriptor", "track reference", and "channel alias" in `docs/audio-feature-bindings.md`.
- Produce UX references (wireframes or written flows) for cache prompts and diagnostics panels.

**Acceptance Criteria**
- ✅ Inventory documenting current single-feature properties and migration approach stored in the tracker with owners assigned (see [Audio Visualisation Phase 0 Foundations](../docs/audio-visualisation-phase0.md#single-feature-property-inventory)).
- ✅ Reviewed glossary copy merged to `docs/audio-feature-bindings.md`, free of roadmap codenames, and linked from this plan.
- ✅ UX artefacts approved by design and attached to the tracker for later implementation phases (documented in [Audio Visualisation Phase 0 Foundations](../docs/audio-visualisation-phase0.md#ux-reference-flows)).

## Phase 1 — Multi-Feature Analysis Architecture
**Goal:** Extend caches and schemas so elements can request multiple descriptors per property without breaking determinism.

**Key Activities**
- Allow descriptor arrays in the `{ trackRef, featureDescriptor }` bindings, including optional `channelAlias` entries.
- Persist track alias metadata (e.g., `Left`, `Right`, `Mid`, `Side`) alongside cache profiles and expose it via the cache API.
- Introduce named analysis profiles (FFT size, hop length, window) referenced by elements via `analysisProfileId`.
- Update element schema validation and migrations to support `features[]` arrays while keeping single-feature scenes backwards compatible.
- Add cache utilities for downsampling and smoothing that operate on read-time rather than renderer state.

**Acceptance Criteria**
- Schema migration tests confirm legacy scenes load with default `features[]` arrays and analysis profiles.
- Cache metadata exposes alias maps and profile descriptors, covered by unit tests.
- Duplicate descriptor requests within a frame deduplicate to a single cache read (verified via instrumentation or automated tests).
- Developer documentation updated with multi-feature binding examples and linked from this plan.

## Phase 2 — Authoring UX & Validation
**Goal:** Provide inspector workflows for selecting tracks, features, and profiles with inline validation.

**Key Activities**
- Build a hierarchical selector that chooses track, feature category (waveform, spectrum, loudness), and specific descriptors.
- Support multi-select interactions for stereo/mid-side bindings and display chips/tags indicating selections.
- Surface validation when requested features require a different profile, guiding authors to update `analysisProfileId`.
- Add contextual help and tooltips referencing glossary definitions.

**Acceptance Criteria**
- QA scripts confirm that editing selections updates scene JSON deterministically and persists across save/load.
- Validation messaging blocks invalid combinations and links to cache regeneration guidance.
- Tooltips and help text reuse glossary language and pass documentation review.
- Telemetry (if enabled) or logging captures selector usage for future UX tuning without leaking user content.

## Phase 3 — Cache Intents & Diagnostics
**Goal:** Ensure cache regeneration is explicit, diff-aware, and recoverable when descriptors or profiles change.

**Key Activities**
- Emit structured "analysis intents" from elements describing requested profiles/features and aggregate them in the scheduler.
- Implement non-blocking banners comparing current vs. requested analysis parameters with regenerate actions.
- Create a diagnostics panel listing stale features grouped by track/profile with per-group rerun controls.
- Record cache regeneration history for debugging and export provenance.
- Align the above flows with the detailed requirements captured in [Audio Visualisation Phase 3 Spec](./avp-3-p3spec.md).

**Acceptance Criteria**
- Automated tests simulate profile mismatches and assert banners, diff payloads, and regeneration flows behave deterministically.
- Diagnostics panel allows selective regeneration without impacting unrelated features (verified by integration tests).
- Export snapshots before/after regeneration remain identical when descriptors are unchanged.
- Cache history logging is accessible in developer tooling without bloating project files.

## Phase 4 — Element Rendering Enhancements
**Goal:** Leverage multi-feature bindings to unlock the spectrum, meter, and oscilloscope treatments described in the specs.

**Key Activities**
- Spectrum: add Mel and note scale mappings, magnitude-driven color ramps, channel layering, and configurable transfer functions.
- Volume Meter: introduce orientation presets, peak-hold markers using cached envelopes, glow/opacity curves, and label options.
- Oscilloscope: implement stereo split, Lissajous mode, zero-cross triggering, persistence trails, and fill-under-curve styling.
- Share reusable material abstractions that encapsulate glow and gradient treatments with deterministic CPU rendering.
- Provide reusable history sampling utilities that pull multiple cached frames per render to avoid stateful renderers.

**Acceptance Criteria**
- Inspector controls expose new rendering options per element, localized and documented in release notes.
- Automated render snapshots cover multi-channel layering, persistence effects, and rendering fallbacks across three reference scenes.
- Performance profiling shows no regression beyond agreed thresholds for multi-feature scenes at target FPS.
- Export determinism tests confirm repeated renders are identical despite advanced visual treatments.

## Phase 5 — Global Styling & Export Polish
**Goal:** Align audio visuals with workspace-wide styling, export, and preset capabilities for video-first creators.

**Key Activities**
- Implement global palette, glow, and smoothing multipliers that elements can opt into while remaining deterministic.
- Extend export pipeline with oversampling/motion-blur settings and ensure compatibility with new rendering materials.
- Add preset library support for saving spectrum/meter/oscilloscope configurations with linked global styles.
- Document best practices for combining modules and link to case studies or templates.

**Acceptance Criteria**
- Global styling controls appear in the workspace, propagate to audio visuals, and are covered by integration tests.
- Export QA verifies new oversampling/motion blur options render consistently across supported resolutions.
- Preset save/load flows roundtrip element and global parameters without data loss.
- Documentation updates (guides, templates) published and linked from this plan and relevant UI tooltips.

## Validation & QA Strategy
- Expand automated tests for cache determinism, inspector state persistence, and render snapshot comparisons.
- Add manual QA checklist per phase, covering multi-channel binding, cache prompts, and export verification.
- Capture performance benchmarks for representative scenes (simple mono, stereo multi-feature, advanced rendering treatments).

## Open Questions
- Should track aliases be author-editable or derived strictly from import metadata? (Requires UX and audio pipeline alignment.)
- What telemetry is necessary to monitor cache regeneration frequency and performance without storing user content?

## Cross-References
- [Audio Feature Bindings & Cache Reference](../docs/audio-feature-bindings.md)
- [Audio Visualisation Phase 0 Foundations](../docs/audio-visualisation-phase0.md)
- [Legacy Binding Shift Summary](./legacybindingshiftplan.md)

