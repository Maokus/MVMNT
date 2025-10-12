## Status

Draft

## Goal

Deliver a concrete implementation plan for the Audio-Reactive Elements (ARE) UX that aligns the existing audio analysis pipeline with the drafted flow in `proposed-ux-flow-1.md`.

## Current system snapshot

-   **Audio ingestion & status:** Timeline tracks store audio buffers, caches, and per-source status, updating status entries when analysis jobs start, complete, fail, or restart.【F:src/state/timelineStore.ts†L284-L375】【F:src/state/timelineStore.ts†L1008-L1071】
-   **Analysis execution:** A shared scheduler runs feature calculators, reports progress to the timeline store, and merges new tracks into caches when re-running calculators.【F:src/audio/features/audioFeatureScheduler.ts†L38-L102】【F:src/audio/features/audioFeatureAnalysis.ts†L980-L1109】
-   **ARE feature binding:** Scene elements bind to an audio track via the `featureTrackId` property, coerce feature descriptors, emit analysis intents, and sample frames from caches at render time.【F:src/core/scene/elements/audio-spectrum.ts†L468-L520】【F:src/core/scene/elements/audioFeatureUtils.ts†L18-L120】
-   **Descriptor UI & diagnostics:** The properties panel uses `AudioFeatureDescriptorInput` to list cached features, showing status labels per track, while the audio diagnostics store groups intents, compares them to caches, and exposes regeneration utilities and a banner shown in the workspace header.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L237-L391】【F:src/state/audioDiagnosticsStore.ts†L171-L360】【F:src/workspace/layout/MidiVisualizer.tsx†L1-L214】

## Plan

### A. Track lifecycle UX alignment

1. **Status chip copy & hover details**
    - Reword track status labels to match the flow (`Idle`, `Pending`, `Analysing...`, `Analyzed`, `Failed`). Reuse existing badge styling in `TrackLanes.tsx` while updating label strings, and extend hover content to enumerate missing/stale descriptors using diagnostics data.【F:src/workspace/panels/timeline/TrackLanes.tsx†L260-L338】【F:src/state/audioDiagnosticsStore.ts†L171-L360】
    - Ensure the cache tab reuses the same labels and tooltip language for consistency.【F:src/workspace/layout/SceneAnalysisCachesTab.tsx†L18-L120】
2. **Waveform lane progress integration**
    - Keep the existing inline progress bar for pending analysis but pipe through scheduler phase labels for richer copy (e.g., `quantizing hop size`). This requires exposing the scheduler’s progress label through the status updates already issued in `scheduleAudioFeatureAnalysis` and translating common labels into user-facing strings.【F:src/state/timelineStore.ts†L284-L375】【F:src/audio/features/audioFeatureAnalysis.ts†L980-L1109】

### B. Feature requirement notices

1. **Notice model**
    - Extend `audioDiagnosticsStore` to surface a summarized list of missing descriptors grouped by audio source, including owner ARE labels. Reuse `computeCacheDiffs` output rather than re-deriving requirements.【F:src/state/audioDiagnosticsStore.ts†L171-L360】
2. **Bottom-left notice component**
    - Introduce a workspace-level component (e.g., `AudioAnalysisNotice`) that subscribes to diagnostics diffs and renders when any track has missing descriptors. Mount it near the timeline controls bottom-left region within `MidiVisualizer`, respecting existing layout containers.【F:src/workspace/layout/MidiVisualizer.tsx†L1-L214】
    - Copy format from the UX flow: `Track/Feature` comma-separated list and a single **Analyse** button.
3. **Analyse button action**
    - On click, call `reanalyzeDescriptors` via a new helper that batches all missing/stale descriptors per track and triggers `reanalyzeAudioFeatureCalculators` or `restartAudioFeatureAnalysis` depending on whether calculator IDs can be determined, mirroring the diagnostics banner “Regenerate All” behavior.【F:src/state/audioDiagnosticsStore.ts†L360-L470】【F:src/state/timelineStore.ts†L1008-L1071】
    - After triggering, mark descriptors as pending in the diagnostics store so the notice updates to reflect in-progress work.

### C. Audio source assignment UX

1. **ARE property defaults**
    - When an ARE is added, default its `featureTrackId` to the first audio track if only one exists. Hook into the element factory or scene command that inserts elements to set this property, reducing friction before the user opens the properties panel.【F:src/core/scene/elements/audio-spectrum.ts†L468-L520】【F:src/state/timelineStore.ts†L320-L375】
2. **Source dropdown parity**
    - Ensure the `timelineTrackRef` control mirrors MIDI assignment UX: include track thumbnails/names and disabled states when no audio tracks exist. This may require enhancing the shared form input component used for track refs (check `FormInput.tsx`) to pull track metadata from the timeline store.【F:src/workspace/form/inputs/FormInput.tsx†L200-L260】
3. **Descriptor availability feedback**
    - Augment `AudioFeatureDescriptorInput` to show inline warnings when descriptors are requested but caches are missing (e.g., greyed options, tooltip referencing the notice). Use the existing statusLabel/statusMessage returned from the timeline store selector to display `Pending`/`Idle` states next to the dropdown.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L237-L391】

### D. Parameter adjustments & cache tab

1. **Parameter edit deferral**
    - Introduce “dirty” tracking for analysis profile edits inside `SceneAnalysisCachesTab`. When a profile parameter changes, mark associated tracks as `stale` using `updateAudioFeatureStatusEntry` but do not schedule analysis. Append a localized notice inside the tab with a shared **Analyse** button to match the flow’s deferred behavior.【F:src/workspace/layout/SceneAnalysisCachesTab.tsx†L91-L200】【F:src/state/timelineStore.ts†L284-L375】
    - Persist dirty flags in the timeline store so leaving the modal retains the pending state, leveraging the existing `audioFeatureCacheStatus` map.
2. **Progress mirroring in caches tab**
    - Display per-calculator progress using the status’ progress label/percent already tracked in the store, ensuring parity with the waveform lane progress bar.【F:src/workspace/layout/SceneAnalysisCachesTab.tsx†L120-L220】【F:src/state/timelineStore.ts†L284-L375】

### E. Internal feature dependency simplification

1. **Scene element APIs**
    - Centralize per-element feature intents by defining descriptor presets (e.g., for oscilloscope RMS) that map high-level options to descriptors. Encapsulate in helpers within `audioFeatureUtils` so element authors request features via intent templates rather than manual descriptors.【F:src/core/scene/elements/audioFeatureUtils.ts†L18-L200】
    - Update existing AREs (spectrum, oscilloscope, volume meter) to consume the helpers, reducing the need for manual feature selection in properties while keeping overrides for advanced users.
2. **Lightweight transformations**
    - Document and implement lightweight calculations (e.g., L/R → M/S) inside the element render path rather than as feature tracks. Add utility functions near the element implementations and cite the guideline inside `audio-cache-system.md` once implemented.

### F. Failure handling & diagnostics

1. **Failure notice**
    - Extend the bottom-left notice to surface failed status entries (state `failed`) with retry and “View log” options. Retry calls the same regenerate helper, while “View log” opens diagnostics panel filtered to the track.【F:src/state/timelineStore.ts†L284-L375】【F:src/workspace/layout/MidiVisualizer.tsx†L200-L360】
2. **History logging**
    - Ensure manual Analyse actions record entries in the diagnostics history for traceability, leveraging the existing `recordHistory` utility in the diagnostics store.【F:src/state/audioDiagnosticsStore.ts†L470-L520】

## Decisions

-   Reuse the diagnostics store as the single source of truth for outstanding feature requirements to avoid duplicating dependency analysis.
-   Maintain deferred re-analysis after parameter changes by marking caches as `stale` until the user confirms via the shared Analyse control.

## Open questions

-   Should the Analyse button respect per-track calculator concurrency limits (one job per source) or queue sequentially through the diagnostics store?
-   Do we need variant copy for multi-track selection in the notice when multiple AREs request different features from the same source?
-   How should the UI communicate when required calculators are unavailable (e.g., custom plugins missing) before triggering analysis?
