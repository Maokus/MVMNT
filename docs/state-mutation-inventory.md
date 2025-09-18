# State Mutation Inventory (Phase 0)

Date: 2025-09-17

Purpose: Catalog current mutation points touching global state to prepare for store segregation (document vs UI) in Phase 1+.

Legend

-   [UI] UI-only state (view, selection, playhead, playback controls)
-   [DOC] Persisted document data (tracks, MIDI cache references, timeline core data we intend to persist)
-   [MIXED] Call sites that mix UI + DOC updates

Primary Store: `src/state/timelineStore.ts`

High-level classification

-   timeline.timeline.currentTick, playheadAuthority → [UI]
-   timeline.timeline.globalBpm, beatsPerBar, masterTempoMap → [DOC]
-   tracks, tracksOrder → [DOC]
-   transport.\* (isPlaying, loop, rate, quantize, state) → [UI]
-   selection.selectedTrackIds → [UI]
-   timelineView.\* → [UI]
-   playbackRange, playbackRangeUserDefined → [UI]
-   midiCache → [DOC]
-   rowHeight → [UI]

Mutation APIs (selected)

-   addMidiTrack, removeTrack, updateTrack, setTrackOffsetTicks, setTrackRegionTicks → [DOC]
-   setMasterTempoMap, setGlobalBpm, setBeatsPerBar → [DOC]
-   setCurrentTick, seekTick, scrubTick → [UI]
-   play, pause, togglePlay, setRate, setQuantize → [UI]
-   setLoopEnabled, setLoopRangeTicks, toggleLoop → [UI]
-   reorderTracks → [DOC]
-   setTimelineViewTicks, selectTracks → [UI]
-   setPlaybackRangeTicks, setPlaybackRangeExplicitTicks → [UI]
-   ingestMidiToCache → [DOC]
-   clearAllTracks → [DOC]
-   setRowHeight → [UI]

Other mutation-like helpers

-   Auto-adjust scene range (`autoAdjustSceneRangeIfNeeded`) updates `playbackRange`/`timelineView` → [UI]

Known external mutation entry points

-   `src/persistence/import.ts` uses `useTimelineStore.setState` to hydrate timeline slices → Writes both [DOC] (tracks, timeline core) and [UI] (view, selection, rowHeight). Consider splitting later via gateway.
-   Legacy `src/persistence/undo/snapshot-undo.ts` removed in Phase 6. Undo/redo now flows through `documentStore.commit/undo/redo` and UI is separate.

Next steps

-   Phase 1: introduce `documentStore` (for [DOC]) and `uiStore` (for [UI]); adapt import/export in later phases.

Search hints used:

-   `set(\(|setState\(|use\w+Store\.getState\(|create\(.*zustand)`

This inventory will be refined as we migrate callers in Phase 5.
