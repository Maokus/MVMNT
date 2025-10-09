# Align audio feature bindings with macro infrastructure

_Last reviewed: 2025-02-24_

**Context update (2025-02-24):** Phases 1–4 of the [hybrid audio feature cache migration](./hybrid-cache-migration-plan.md) are complete, so real-time caches are now the canonical storage for audio feature data. Tempo-aligned reads must go through the shared tempo mapper and adapter layer delivered in that rollout.

## Current binding differences

### MIDI track bindings

-   Scene properties that point at MIDI data usually store timeline track IDs as plain constants or via
    `midiTrackRef` macros, so the element asks the timeline selectors for the notes it needs at
    runtime.【F:src/core/scene/elements/moving-notes-piano-roll/moving-notes-piano-roll.ts†L104-L139】【F:src/core/scene/elements/moving-notes-piano-roll/moving-notes-piano-roll.ts†L673-L714】【F:src/state/scene/macros.ts†L1-L30】
-   Because the binding layer only sees constants/macros here, MIDI selections already integrate with
    macro assignments, undo, and serialization without any custom property-binding subtype.

### Audio feature bindings

-   `AudioFeatureBinding` is a custom binding subtype that stores the track ID, calculator metadata,
    band/channel selection, smoothing radius, and the most recently sampled frame inside the binding
    itself.【F:src/bindings/property-bindings.ts†L13-L232】
-   Audio elements bind their properties directly to this subtype and then read the frame payload from
    the property, so the property value becomes an audio sample instead of a track reference.
    `AudioSpectrumElement`, for example, pulls the binding, updates smoothing, and calls
    `getValueWithContext` to fetch the current frame before rendering.【F:src/core/scene/elements/audio-spectrum.ts†L317-L348】
-   Because the binding returns samples, these properties cannot be macro-bound today, and the binding
    layer has to understand feature metadata in addition to the usual constant/macro variants.【F:src/state/sceneStore.ts†L6-L28】

## Goals

-   Treat audio-driven properties the same way as MIDI-driven properties: bindings should point to a
    track (constant or macro), and elements should request the concrete feature data they need at
    render time.
-   Make audio-feature-based controls eligible for macro assignments without special casing in the
    property binding runtime.
-   Reduce hidden state stored inside `AudioFeatureBinding` (e.g., cached frames, smoothing) so that
    serialization and inspector panels have a single source of truth.

## Phased implementation plan

### Phase 1 – Unify timeline track binding metadata (Foundations)

**Objectives**

-   Rename or generalize the existing `midiTrackRef` shape into a neutral `timelineTrackRef` so macros and
    bindings can reference any track kind without custom property types.【F:src/state/scene/macros.ts†L1-L30】
-   Update inspector inputs and macro dialogs to present the same picker UI for both audio and MIDI tracks,
    ensuring consistent UX across property editors.

**Key tasks**

-   Introduce a shared `TimelineTrackBindingState` type (or alias) and update scene schema typings to consume it.
-   Audit existing `midiTrackRef` usages in bindings, macros, and selectors; migrate them to the new type.
-   Extend track picker components to filter and label audio tracks appropriately while preserving MIDI
    affordances.
-   Document the new shared type in design notes and flag the change in macro authoring guides.

**Acceptance criteria**

-   Inspectors render the same picker component for audio and MIDI bindings, with audio tracks clearly selectable and labeled.
-   Macro assignment dialogs persist the neutral `timelineTrackRef` shape and continue to serialize existing MIDI macros without regression.
-   TypeScript build passes without any remaining references to deprecated audio-only binding metadata.

### Phase 2 – Split audio element configuration (Element-level refactor)

**Objectives**

-   Replace monolithic `featureBinding` fields with a track binding reference plus a separate feature descriptor object for calculator metadata.【F:src/core/scene/elements/audio-spectrum.ts†L317-L348】
-   Ensure audio elements resolve track IDs via the shared binding system before sampling feature data through the tempo-aligned adapter backed by real-time caches.【F:src/state/selectors/audioFeatureSelectors.ts†L60-L210】

**Key tasks**

-   Update audio element schemas and props to hold `{ trackRef, featureDescriptor }` instead of the current binding subtype.
-   Move smoothing radius and band/channel selection into the descriptor and expose defaults for backwards compatibility.
-   Implement helper utilities (e.g., `resolveFeatureDescriptor`) so rendering code can fetch frames via tempo-aligned view helpers without duplicating logic.
-   Relocate any frame caching or smoothing state from bindings to element instances or memoized selectors.

**Acceptance criteria**

-   Audio elements render correctly when provided with the new `{ trackRef, featureDescriptor }` shape, requesting data through the tempo-aligned adapter, and no longer access legacy `AudioFeatureBinding` APIs.
-   Feature descriptors persist through save/load cycles and surface in inspector panels for editing.
-   Profiling shows no regression in frame rendering cost compared to the legacy binding cache path.

### Phase 3 – Refactor property binding infrastructure (Runtime alignment)

**Objectives**

-   Remove the custom `AudioFeatureBinding` subclass in favor of pure data bindings that defer sampling to the hybrid cache adapters.【F:src/bindings/property-bindings.ts†L64-L232】
-   Centralize legacy-to-new structure migrations so undo/redo and macro flows stay stable.【F:src/state/sceneStore.ts†L6-L28】

**Key tasks**

-   Update `PropertyBinding.fromSerialized` (and related factories) to hydrate legacy payloads into the new structure.
-   Add migration utilities in the scene command gateway to normalize incoming patches.
-   Simplify `SceneRuntimeAdapter` to expect only constant/macro bindings without audio-specific cases, delegating feature retrieval to the tempo-aligned adapter utilities.
-   Remove redundant state (e.g., cached frames) from binding serialization and runtime caches.

**Acceptance criteria**

-   Scene hydration of legacy documents produces the new binding shape without losing calculator metadata or smoothing parameters.
-   Undo/redo operations remain stable when toggling between macro- and constant-driven audio feature bindings.
-   Property binding runtime exposes a single, generic binding subtype list with no audio-specific branches.

### Phase 4 – Update persistence and export flows (Data lifecycle)

**Objectives**

-   Ensure document persistence, import/export, and scene/timeline stores read and write the new binding structure.【F:src/persistence/document-gateway.ts†L23-L135】【F:src/state/timelineStore.ts†L93-L213】
-   Confirm audio feature caches continue to use real-time indexing while bindings now reference track IDs and rely on tempo mapper utilities for tick-based projections.【F:src/state/selectors/audioFeatureSelectors.ts†L60-L210】

**Key tasks**

-   Extend persistence schemas and migration scripts to convert legacy payloads during load.
-   Update exporters to rehydrate feature descriptors when generating external assets or timelines, using tempo-aligned adapters where tick-anchored data is required.
-   Add regression tests for round-tripping documents that mix MIDI and audio feature bindings.
-   Verify cache invalidation paths correctly translate track IDs to source IDs and interact with real-time cache priming/tempo mapping APIs.

**Acceptance criteria**

-   Importing a legacy project automatically migrates audio feature bindings with no manual intervention.
-   Exported scenes reference track IDs plus descriptors, invoke tempo-aligned adapters where needed, and re-import without diff noise.
-   Cache profiling confirms real-time caches stay authoritative with no increase in stale cache misses or unnecessary re-analysis during tempo-aligned reads.

### Phase 5 – Extend macro tooling and UX (Experience polish)

**Objectives**

-   Enable macros to bind audio tracks using the shared track reference type, mirroring existing MIDI workflows.【F:src/state/sceneStore.ts†L440-L520】
-   Refresh inspector copy and tutorials so creators understand the new binding model.

**Key tasks**

-   Update macro validation logic to accept audio track IDs (single and multi-select) and to surface meaningful error messages when a track type mismatch occurs.
-   Adjust inspector panels to display feature descriptors alongside track bindings with clear grouping.
-   Review default project templates and ensure they demonstrate macro-driven audio feature bindings.
-   Coordinate with documentation to publish guidance on the new workflow.

**Acceptance criteria**

-   Macro assignment UI lists audio tracks, saves assignments, and drives multiple audio elements in runtime playback.
-   Inspector panels show track and descriptor fields separately with contextual help text.
-   Documentation updates are published and linked from in-app help, with QA sign-off from the design team.

### Phase 6 – Testing and rollout (Quality gate)

**Objectives**

-   Expand automated coverage for serialization, macro assignments, and runtime sampling across track types.【F:src/state/scene/**tests**/sceneStore.test.ts†L207-L261】【F:src/export/**tests**/audio-feature-export-parity.test.ts†L1-L120】
-   Communicate migration details to the wider team and beta users.

**Key tasks**

-   Author unit and integration tests that exercise mixed audio/MIDI binding scenarios, including undo and export flows.
-   Create fixture scenes representing legacy and new binding structures for regression testing.
-   Draft release notes and migration guides highlighting automatic upgrades and troubleshooting steps.
-   Plan a staged rollout (internal dogfood → beta → general) with monitoring hooks for binding errors.

**Acceptance criteria**

-   Test suite passes with new cases, and continuous integration includes regression tests for mixed bindings.
-   Release notes ship alongside the feature with reviewed troubleshooting content.
-   Rollout checklist is complete, including monitoring dashboards and a go/no-go review after beta.

## Anticipated developer confusions

### Within the binding refactor

-   **Track vs. source IDs:** Timeline tracks resolve to audio-source IDs under the hood; developers may
    forget this indirection when sampling features. Document the helper `resolveAudioSourceTrack` and
    prefer selectors to hand-rolled lookups.【F:src/state/selectors/audioFeatureSelectors.ts†L60-L114】
-   **Smoothing ownership:** Smoothing currently lives on the binding and mutates during rendering. In
    the new flow it should move to the feature descriptor, otherwise two elements referencing the same
    track could unintentionally diverge. Highlight this in code comments and tests.【F:src/bindings/property-bindings.ts†L168-L232】
-   **Macro value shapes:** Reusing the `midiTrackRef` shape for audio means macros may hold strings or
    string arrays. Ensure inspector inputs normalize both forms consistently to avoid bugs in
    multi-select scenarios.【F:src/state/sceneStore.ts†L440-L520】

### Broader audio feature system

-   **Cache lifecycle:** Audio feature caches are invalidated per audio source, not per track; clearing a
    cache affects every track pointing at that source. Misunderstanding this can lead to unexpected
    re-analysis cascades.【F:src/state/timelineStore.ts†L261-L1030】
-   **Timeline offsets and regions:** Feature sampling accounts for track offsets and region trimming,
    so forgetting to apply those when writing bespoke selectors will desync visuals from audio.【F:src/state/selectors/audioFeatureSelectors.ts†L160-L210】
-   **Format-specific data:** Waveform features return `{ min, max }` pairs while other calculators use
    plain vectors; mixing the two without checking `format` can corrupt visualizations or exports.
    Always branch on `featureTrack.format` before interpreting data.【F:src/state/selectors/audioFeatureSelectors.ts†L120-L210】

## Open questions

-   Do we need dedicated macros for feature descriptors (e.g., switching between RMS and spectrogram),
    or is per-element configuration sufficient?
-   How should we expose calculator-specific parameters (band ranges, thresholds) once bindings move to
    track-level data—should they live in the descriptor or migrate into calculator-specific inspector
    controls?

## Open question answers (Decisions)

-   per element configuration is sufficient.
-   migrate into calculator-specific inspector controls
