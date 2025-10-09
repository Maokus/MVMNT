# Align audio feature bindings with macro infrastructure

_Last reviewed: 2025-02-17_

## Current binding differences

### MIDI track bindings
- Scene properties that point at MIDI data usually store timeline track IDs as plain constants or via
  `midiTrackRef` macros, so the element asks the timeline selectors for the notes it needs at
  runtime.【F:src/core/scene/elements/moving-notes-piano-roll/moving-notes-piano-roll.ts†L104-L139】【F:src/core/scene/elements/moving-notes-piano-roll/moving-notes-piano-roll.ts†L673-L714】【F:src/state/scene/macros.ts†L1-L30】
- Because the binding layer only sees constants/macros here, MIDI selections already integrate with
  macro assignments, undo, and serialization without any custom property-binding subtype.

### Audio feature bindings
- `AudioFeatureBinding` is a custom binding subtype that stores the track ID, calculator metadata,
  band/channel selection, smoothing radius, and the most recently sampled frame inside the binding
  itself.【F:src/bindings/property-bindings.ts†L13-L232】
- Audio elements bind their properties directly to this subtype and then read the frame payload from
  the property, so the property value becomes an audio sample instead of a track reference.
  `AudioSpectrumElement`, for example, pulls the binding, updates smoothing, and calls
  `getValueWithContext` to fetch the current frame before rendering.【F:src/core/scene/elements/audio-spectrum.ts†L317-L348】
- Because the binding returns samples, these properties cannot be macro-bound today, and the binding
  layer has to understand feature metadata in addition to the usual constant/macro variants.【F:src/state/sceneStore.ts†L6-L28】

## Goals
- Treat audio-driven properties the same way as MIDI-driven properties: bindings should point to a
  track (constant or macro), and elements should request the concrete feature data they need at
  render time.
- Make audio-feature-based controls eligible for macro assignments without special casing in the
  property binding runtime.
- Reduce hidden state stored inside `AudioFeatureBinding` (e.g., cached frames, smoothing) so that
  serialization and inspector panels have a single source of truth.

## Proposed implementation plan

### 1. Introduce track-oriented binding metadata
- Add a general `TimelineTrackBindingState` (or rename the existing `midiTrackRef` type to
  `timelineTrackRef`) so scene bindings and macros can describe any track selection—MIDI or audio—by
  ID plus optional track kind. Update macro definitions to expose the new type while keeping
  `midiTrackRef` as an alias for migration purposes.【F:src/state/scene/macros.ts†L1-L30】
- Extend inspector inputs that currently handle `midiTrackRef` to support audio tracks and expose the
  same picker UI, ensuring macro dialogs and property panels reuse the same component tree.

### 2. Split audio element configuration
- Replace `featureBinding` properties with two pieces: a track binding that resolves to a timeline
  track ID (constant or macro) and a lightweight feature descriptor (feature key, optional calculator
  override, band/channel index, smoothing). The descriptor stays as a regular constant property so it
  can still participate in macros if needed.【F:src/core/scene/elements/audio-spectrum.ts†L317-L348】
- Update audio elements to read the track ID via the binding/macro system, then call
  `selectAudioFeatureFrame` or `sampleAudioFeatureRange` using the descriptor to fetch the desired
  feature data each frame.【F:src/state/selectors/audioFeatureSelectors.ts†L60-L210】
- Cache per-frame results inside the element instance (if needed) rather than the binding so binding
  objects remain pure data containers.

### 3. Refactor property binding infrastructure
- Deprecate the custom `AudioFeatureBinding` subclass. `PropertyBinding.fromSerialized` should map the
  legacy `audioFeature` payload into the new track-binding + descriptor fields when hydrating older
  scenes, and the scene store should write the new structure going forward.【F:src/bindings/property-bindings.ts†L64-L232】
- Simplify `SceneRuntimeAdapter` and `sceneStore` binding serializers to stop treating audio features
  as a special binding type once migration logic is in place.【F:src/state/sceneStore.ts†L6-L28】
- Add migration utilities in the scene command gateway so incoming patches that still supply the old
  `audioFeature` shape convert to the new fields before reaching the store, keeping undo/redo stable.

### 4. Update persistence and export flows
- Adjust timeline and scene persistence layers to persist track bindings plus feature descriptors
  instead of the old binding payload. Reuse existing migration helpers to auto-convert legacy scenes
  during import/export without data loss.【F:src/persistence/document-gateway.ts†L23-L135】【F:src/state/timelineStore.ts†L93-L213】
- Ensure audio feature caches remain keyed by audio source IDs; only the binding metadata shifts to
  store track IDs. Verify selectors continue to resolve track → source → cache transparently.【F:src/state/selectors/audioFeatureSelectors.ts†L60-L210】

### 5. Extend macro tooling and UX
- Allow macros to reference audio tracks via the new track-ref type so creators can drive multiple
  audio elements from a single macro assignment (mirroring existing MIDI workflows). Update macro
  validation to accept strings or arrays of track IDs just like `midiTrackRef` does today.【F:src/state/sceneStore.ts†L440-L520】
- Refresh inspector help text and default scenes so users learn that audio feature controls now bind
  to tracks; surface feature metadata (e.g., calculator label) in the element UI instead of the
  binding editor.

### 6. Testing and rollout
- Expand unit tests covering binding serialization, macro assignments, and runtime sampling to cover
  both track kinds. Add fixture scenes that combine MIDI and audio bindings to guard against
  regression in undo/export flows.【F:src/state/scene/__tests__/sceneStore.test.ts†L207-L261】【F:src/export/__tests__/audio-feature-export-parity.test.ts†L1-L120】
- Provide a migration note in release docs describing how legacy bindings are auto-upgraded and how
  to troubleshoot missing audio analysis.

## Anticipated developer confusions

### Within the binding refactor
- **Track vs. source IDs:** Timeline tracks resolve to audio-source IDs under the hood; developers may
  forget this indirection when sampling features. Document the helper `resolveAudioSourceTrack` and
  prefer selectors to hand-rolled lookups.【F:src/state/selectors/audioFeatureSelectors.ts†L60-L114】
- **Smoothing ownership:** Smoothing currently lives on the binding and mutates during rendering. In
  the new flow it should move to the feature descriptor, otherwise two elements referencing the same
  track could unintentionally diverge. Highlight this in code comments and tests.【F:src/bindings/property-bindings.ts†L168-L232】
- **Macro value shapes:** Reusing the `midiTrackRef` shape for audio means macros may hold strings or
  string arrays. Ensure inspector inputs normalize both forms consistently to avoid bugs in
  multi-select scenarios.【F:src/state/sceneStore.ts†L440-L520】

### Broader audio feature system
- **Cache lifecycle:** Audio feature caches are invalidated per audio source, not per track; clearing a
  cache affects every track pointing at that source. Misunderstanding this can lead to unexpected
  re-analysis cascades.【F:src/state/timelineStore.ts†L261-L1030】
- **Timeline offsets and regions:** Feature sampling accounts for track offsets and region trimming,
  so forgetting to apply those when writing bespoke selectors will desync visuals from audio.【F:src/state/selectors/audioFeatureSelectors.ts†L160-L210】
- **Format-specific data:** Waveform features return `{ min, max }` pairs while other calculators use
  plain vectors; mixing the two without checking `format` can corrupt visualizations or exports.
  Always branch on `featureTrack.format` before interpreting data.【F:src/state/selectors/audioFeatureSelectors.ts†L120-L210】

## Open questions
- Do we need dedicated macros for feature descriptors (e.g., switching between RMS and spectrogram),
  or is per-element configuration sufficient?
- How should we expose calculator-specific parameters (band ranges, thresholds) once bindings move to
  track-level data—should they live in the descriptor or migrate into calculator-specific inspector
  controls?
