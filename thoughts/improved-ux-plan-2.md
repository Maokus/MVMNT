## Status

Draft (supersedes the exploratory outline in `improved-ux-plan-1.md`)

## Goal

Deliver a phased implementation roadmap for the Audio-Reactive Elements (ARE) UX that aligns the existing audio analysis pipeline with the drafted flow in `proposed-ux-flow-1.md`, while sequencing work to minimize risk and highlight parallelizable efforts.

## Approach summary

-   Sequence the work to align track lifecycle messaging, surface actionable analysis notices, streamline assignment UX, and reinforce diagnostics without blocking ongoing feature development.
-   Lean on `audioDiagnosticsStore` as the coordination point for cache health, limiting surface-level components to presentation and action wiring.
-   Capture dependencies between store updates and UI components so implementation teams can split work with minimal merge contention.

## Phases

### Phase 1 — Track lifecycle UX alignment

**Objectives**

-   Normalize status labels and progress messaging across the timeline, cache tab, and diagnostics banner.
-   Surface scheduler phase detail within the waveform lane without regressing current progress indicators.

**Key tasks**

1. Update `TrackLanes.tsx` and `SceneAnalysisCachesTab.tsx` to use the shared status vocabulary (`Idle`, `Pending`, `Analysing...`, `Analyzed`, `Failed`) and tooltip content sourced from diagnostics data.
2. Plumb scheduler phase labels through `scheduleAudioFeatureAnalysis` status updates and display them in the waveform lane progress UI.

**Acceptance criteria**

-   Timeline lanes and cache tab chips display the unified status labels and hover copy in sync with diagnostics data.
-   Waveform progress bar reflects scheduler phase messages without layout regressions.
-   Automated tests (or new unit coverage) verify status mapping logic.

### Phase 2 — Feature requirement notices

**Objectives**

-   Present actionable notices when AREs require descriptors that are missing, stale, or failed.
-   Provide a clear, consolidated re-analysis action that mirrors diagnostics capabilities.

**Key tasks**

1. Extend `audioDiagnosticsStore` to expose grouped missing/stale descriptor summaries and pending flags per track/feature pair.
2. Implement a workspace-level `AudioAnalysisNotice` component in `MidiVisualizer` that renders when outstanding descriptors exist, showing track/feature listings with a single **Analyse** button.
3. Add a batched re-analysis helper that invokes `reanalyzeAudioFeatureCalculators` / `restartAudioFeatureAnalysis` as appropriate, marking diagnostics entries as pending on click.

**Acceptance criteria**

-   Notice appears only when outstanding descriptors exist and disappears once caches are healthy.
-   Clicking **Analyse** triggers the appropriate re-analysis workflow and updates diagnostics status immediately.
-   Diagnostics history records manual Analyse actions for auditing.

### Phase 3 — Audio source assignment UX

**Objectives**

-   Reduce friction when binding AREs to audio tracks.
-   Communicate descriptor availability within property inputs.

**Key tasks**

1. Default new AREs’ `featureTrackId` to the lone audio track when exactly one exists, via element factory hooks.
2. Align the source dropdown with MIDI assignment UX, adding track thumbnails, names, and disabled states when no audio tracks exist.
3. Enhance `AudioFeatureDescriptorInput` with inline warnings or disabled states when caches are missing or pending, reusing status metadata from the timeline store.

**Acceptance criteria**

-   Newly inserted AREs are pre-bound when a single audio track exists, and users can still choose other tracks when multiple exist.
-   Source dropdown visually matches MIDI assignment controls and handles empty states gracefully.
-   Descriptor dropdown communicates cache health (pending/idle/missing) without breaking existing selection behavior.

### Phase 4 — Parameter adjustments & cache tab refinements

**Objectives**

-   Enable deferred re-analysis after parameter edits with persistent dirty tracking.
-   Surface per-calculator progress in the caches tab to match timeline feedback.

**Key tasks**

1. Implement dirty state tracking for analysis profiles inside `SceneAnalysisCachesTab`, marking tracks as `stale` while persisting state in `timelineStore`.
2. Add a localized **Analyse** button within the tab that batches re-analysis for dirty entries and clears pending flags when triggered.
3. Display per-calculator progress and scheduler phase copy in the caches tab, reusing status data exposed in Phase 1.

**Acceptance criteria**

-   Editing parameters marks caches as stale without auto-triggering analysis, and dirty state persists after closing/reopening the modal.
-   Local Analyse action reuses the shared batching helper from Phase 2 and updates dirty state appropriately.
-   Progress indicators in the cache tab stay in sync with waveform lane progress during active analysis.

### Phase 5 — Failure handling & diagnostics polish

**Objectives**

-   Extend notices to cover failure states with actionable retries and log access.
-   Ensure diagnostics history captures manual interventions.

**Key tasks**

1. Update the workspace notice to highlight failed descriptors with retry and "View log" options, reusing diagnostics filters for log navigation.
2. Confirm diagnostics history entries capture all manual Analyse actions (workspace notice, cache tab) via `recordHistory` calls.

**Acceptance criteria**

-   Failed descriptors trigger a visually distinct notice state with functional retry/log controls.
-   Diagnostics history reflects every user-initiated re-analysis action with timestamp and scope.

### Phase 6 — Internal feature dependency simplification

**Objectives**

-   Centralize descriptor presets and lightweight transformations to simplify ARE development and usage.

**Key tasks**

1. Define descriptor preset helpers inside `audioFeatureUtils` and refactor existing AREs (spectrum, oscilloscope, volume meter) to consume them while allowing advanced overrides.
2. Implement lightweight channel transformation utilities (e.g., L/R → M/S) within element render paths and update `audio-cache-system.md` to document the approach.

**Acceptance criteria**

-   ARE implementations request descriptors through the new preset helpers without regressing existing behavior.
-   Transformation utilities operate client-side without introducing additional feature tracks, and documentation reflects the new pattern with cross-links to relevant docs.

## Decisions

-   Continue using `audioDiagnosticsStore` as the authoritative source for cache health, ensuring UI surfaces subscribe rather than recompute diagnostics data.
-   Share a single batching helper for Analyse actions across workspace notices and cache tab controls to avoid divergent re-analysis behavior.

## Open questions

-   Should the shared Analyse helper queue per-track work sequentially to honor calculator concurrency limits, or rely on existing scheduler safeguards?
-   How should the UX communicate when required calculators/plugins are unavailable before triggering analysis—through preflight validation or notice copy variants?
-   Are additional telemetry hooks needed to measure notice engagement and manual re-analysis frequency for future UX tuning?
