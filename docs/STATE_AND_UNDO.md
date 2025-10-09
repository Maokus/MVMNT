# Store State and Undo Overview

## Zustand Store Architecture
- Zustand stores live under `src/state/` and expose typed hooks created with `create`.
- `sceneStore` and `timelineStore` maintain normalized slices for authoring and playback.
- Each store exports action functions instead of mutating data directly in components.

## Scene Command Pipeline
- `dispatchSceneCommand` (in `scene/commandGateway.ts`) is the only mutation entry for the scene store.
- The gateway normalizes config payloads, syncs macros, and tags mutations with a source label.
- Command execution emits telemetry events through `emitSceneCommandTelemetry`.

## Patch-Based Undo Controller
- `createPatchUndoController` registers a scene command listener and records undo/redo patches.
- Undo entries capture scene command arrays so replay uses the same gateway APIs.
- Entries sharing a `mergeKey` may coalesce, enabling drag gestures to produce single history steps.
- `undo()` and `redo()` re-dispatch stored commands via `dispatchSceneCommand`, ensuring parity with live edits.

## Timeline Store Responsibilities
- `timelineStore` tracks playback metadata (`timeline`, `transport`, `timelineView`) and per-track state.
- MIDI and audio caches are updated through `ingestMidiToCache` and `ingestAudioToCache`. Hybrid audio
  caches are normalized via `hydrateHybridAudioCache` so the real-time schema remains canonical while
  selectors project tempo-aligned views through the shared mapper.
- Transport helpers (`play`, `pause`, `setLoopRangeTicks`, `seekTick`) update playback status while preserving quantization semantics.
- Mutations such as `removeTracks`, `updateTrack`, and `setTrackOffsetTicks` adjust track collections and trigger range recalculations.

## Undo Coverage Gaps
- Timeline actions update state eagerly without emitting command patches.
- Comments around `removeTracks` highlight a desire for batching but no history snapshots exist yet.
- Extending undo to the timeline will require emitting structured patches or routing mutations through a command gateway similar to the scene store.
