# Audio Visualisation Upgrade Plan — Phase 2 Outline

**Status:** Planning Draft (2025-10-10) — elaborates the staged rollout that follows the work captured in [Audio Visualisation Plan 1](./audio-visualisation-plan-1.md).

## Overview

This document sequences the remaining audio visualisation improvements into phased increments that can ship independently. Each phase concludes with explicit acceptance criteria to preserve determinism guarantees and developer clarity introduced during the legacy binding migration.

## Phase 0 — Planning & Foundations

**Goal:** Confirm technical constraints, align on terminology, and update supporting documentation before implementation begins.

-   **Activities**
    -   Audit current cache schemas and inspector controls to catalogue where single-feature assumptions exist.
    -   Draft glossary updates covering "analysis profile", "feature descriptor", and "track reference" for inclusion in `docs/audio-feature-bindings.md`.
    -   Produce UX wireframes for cache prompts and diagnostics surfaces referenced in Phase 2.
-   **Acceptance Criteria**
    -   Inventory enumerating all single-feature properties per element, with owner and proposed upgrade path recorded in the project tracker.
    -   Reviewed glossary copy merged to `docs/audio-feature-bindings.md` describing multi-feature descriptors without using roadmap code names.
    -   Approved UX artifacts (wireframes or written specs) stored alongside this plan and referenced from the tracker.

## Phase 1 — Multi-Track Feature Architecture

**Goal:** Enable scene elements to request multiple features per property while retaining deterministic cache behaviour.

-   **Activities**
    -   Extend the neutral `{ trackRef, featureDescriptor }` model to accept descriptor arrays. Each entry explicitly references a track ID (or alias) and feature path (e.g., `waveform.left`, `spectrum:mel`).
    -   Introduce cache metadata storing available track aliases (e.g., `L`, `R`, `Mid`, `Side`) and their mapping to source audio channels.
    -   Update the cache scheduler so intent aggregation deduplicates requests when multiple elements target the same `{ trackRef, featureDescriptor }` tuple.
    -   Define element schema changes that accept an `analysisProfileId` and a `features[]` collection. The schema includes validation ensuring every descriptor resolves to a known analysis profile and cached feature.
-   **Acceptance Criteria**
    -   All element schemas compile with new `features[]` structures without breaking existing single-feature scenes (backwards compatibility confirmed through schema migration tests).
    -   Cache metadata exposes track alias maps retrievable through the public cache API and exercised in unit tests.
    -   Request aggregation logs demonstrate that duplicate descriptor requests result in a single cache read per render frame.

## Phase 2 — Element-Level Feature Selection UX

**Goal:** Provide editor tooling for authors to select audio tracks and feature bundles directly within each element’s inspector.

-   **Activities**
    -   Implement inspector controls offering a hierarchical picker: first choose the audio track, then select one or more features grouped by category (waveform, spectrum, loudness). Selected entries populate the element’s `features[]` array.
    -   Add multi-select affordances for stereo use cases (e.g., checkboxes for `Left` and `Right` waveform) and visual tags showing selected features with their track association.
    -   Surface validation messages inline when a feature requires a different analysis profile than the element currently references, linking to cache regeneration prompts defined in Phase 3.
    -   Document the user flow in editor help text and cross-link from `docs/audio-feature-bindings.md` once the UX ships.
-   **Acceptance Criteria**
    -   QA scripts confirm that selecting multiple features updates element JSON deterministically and persists across save/load cycles.
    -   Validation copy appears when incompatible analysis profiles are chosen, and authoring is blocked until conflicts are resolved or profile is changed.
    -   Inline help tooltips reference the glossary terms reviewed during Phase 0, ensuring consistent language.

## Phase 3 — Cache Intents & Regeneration Flow

**Goal:** Maintain deterministic caches while empowering authors to control when analysis runs occur.

-   **Activities**
    -   Emit structured "analysis intents" from each element describing requested profiles and features; the scheduler aggregates these to decide whether caches are current.
    -   Implement non-blocking banners prompting users to regenerate audio analysis when intents diverge from cached profiles, including diff summaries (current vs. requested profile parameters).
    -   Build a diagnostics panel listing stale features with actions to rerun analysis per track/profile combination.
-   **Acceptance Criteria**
    -   Automated tests simulate mismatched profiles and verify that banners appear, diff data is accurate, and regeneration updates caches without duplicate work.
    -   Diagnostics panel lists stale features grouped by track, and manual reruns affect only selected groups.
    -   Exported scenes remain deterministic before and after manual regeneration (verified via snapshot comparison).

## Phase 4 — Element Rendering Enhancements

**Goal:** Leverage the multi-feature architecture to deliver richer visual treatments across spectrum, volume, and oscilloscope elements.

-   **Activities**
    -   Spectrum: implement Mel/note-scale overlays, magnitude-driven color ramps, and multi-channel layering based on selected features.
    -   Volume Meter: add orientation presets, peak-hold markers derived from cached envelope followers, and styling hooks for thresholds and gradients.
    -   Oscilloscope: support stereo split and Lissajous modes by pairing selected features and mapping them to geometry builders; integrate zero-crossing utilities for triggering.
    -   History effects: implement persistence trails using multiple time offsets retrieved from caches without storing renderer state.
-   **Acceptance Criteria**
    -   Each element exposes new configuration options in the inspector aligned with selected features and profiles, with documentation updates published alongside the release.
    -   Automated render snapshots validate multi-channel layering and historical trail determinism across at least three test scenes.
    -   Performance benchmarks show no regression beyond an agreed threshold when rendering multi-feature scenes at target FPS.

## Audio Track & Feature Retrieval Details

To support the above phases, audio track and feature selection operates through the following shared contract:

1. **Track Catalogue**

    - Project-level metadata enumerates available tracks (timeline stems, master mix) with canonical IDs. Tracks may advertise channel layouts (mono, stereo, 5.1) and provide user-friendly labels.
    - Cache generation registers these tracks, storing alias maps (`Left`, `Right`, `Mid`, `Side`) that elements can query via the cache API.

2. **Feature Descriptor Schema**

    - A descriptor consists of `{ trackRef, featurePath, profileId, channelAlias? }`. `featurePath` points to analysis output (e.g., `waveform/timeDomain`, `spectrum/full`).
    - `channelAlias` is optional; when omitted the feature applies to all channels defined by the track layout, while explicit aliases target specific channels.
    - Descriptors are validated at authoring time to ensure referenced tracks and profiles exist; invalid descriptors block scene saves.

3. **Element Binding Flow**

    - Inspector controls issue read operations through a `FeatureQueryService`. The service resolves descriptors, returning immutable slices of cached data keyed by `{ descriptorHash, frameIndex }`.
    - Elements do not store raw samples. Instead they keep descriptor references, allowing render routines to request data per frame via the service.
    - Multi-feature elements (e.g., spectrum with left/right layers) iterate over descriptor arrays, requesting each channel slice in sequence. The service batches identical hashes to reuse cache reads within the same frame.

4. **Runtime Guarantees**
    - All descriptor reads are deterministic: they reference cache snapshots generated under a recorded `analysisProfileId`. Renderers receive immutable data structures, preventing mutation-induced drift.
    - When authoring changes descriptors (adding/removing features), the scene diff records descriptor hashes, enabling undo/redo without recalculating caches until regeneration is triggered intentionally.

## Open Questions

-   Should track aliases be author-editable, or derived strictly from audio import metadata?
-   How should 5.1 or object-based audio map into the current descriptor schema without overwhelming the inspector UI?
-   What telemetry (if any) should capture cache regeneration frequency to guide performance tuning?
