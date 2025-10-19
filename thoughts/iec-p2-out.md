# Import Alias Consistency Report

Status: Completed analysis

This report lists every module imported via both alias and relative paths, evaluates whether the usage aligns with the "alias for cross-domain, relative for intra-folder" guideline, and suggests canonical forms.

## src/animation/anim-math.ts
- Module domain: `animation`
- Inconsistent import locations:
- src/animation/note-animations/press.ts — used alias `@animation/anim-math` but expected relative import (e.g., `./anim-math`).
- src/animation/note-animations/template.ts — used alias `@animation/anim-math` but expected relative import (e.g., `./anim-math`).
- src/animation/note-animations/scale.ts — used alias `@animation/anim-math` but expected relative import (e.g., `./anim-math`).
- Suggested canonical form: Use relative paths within `src/animation` (e.g., `./anim-math`).

## src/audio/features/analysisIntents.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/features/__tests__/sceneApi.test.ts — used alias `@audio/features/analysisIntents` but expected relative import (e.g., `./analysisIntents`).
- src/audio/features/__tests__/useAudioFeature.test.tsx — used alias `@audio/features/analysisIntents` but expected relative import (e.g., `./analysisIntents`).
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./analysisIntents`) and alias imports for other domains (e.g., `@audio/features/analysisIntents`).

## src/audio/features/audioFeatureAnalysis.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/__tests__/audioFeatureAnalysis.test.ts — used alias `@audio/features/audioFeatureAnalysis` but expected relative import (e.g., `./audioFeatureAnalysis`).
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./audioFeatureAnalysis`) and alias imports for other domains (e.g., `@audio/features/audioFeatureAnalysis`).

## src/audio/features/audioFeatureRegistry.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/__tests__/audioFeatureAnalysis.test.ts — used alias `@audio/features/audioFeatureRegistry` but expected relative import (e.g., `./audioFeatureRegistry`).
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./audioFeatureRegistry`) and alias imports for other domains (e.g., `@audio/features/audioFeatureRegistry`).

## src/audio/features/audioFeatureTypes.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/__tests__/channelResolution.test.ts — used alias `@audio/features/audioFeatureTypes` but expected relative import (e.g., `./audioFeatureTypes`).
- src/audio/features/__tests__/audioSamplingOptions.test.ts — used alias `@audio/features/audioFeatureTypes` but expected relative import (e.g., `./audioFeatureTypes`).
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./audioFeatureTypes`) and alias imports for other domains (e.g., `@audio/features/audioFeatureTypes`).

## src/audio/features/descriptorBuilder.ts
- Module domain: `audio`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./descriptorBuilder`) and alias imports for other domains (e.g., `@audio/features/descriptorBuilder`).

## src/audio/features/sceneApi.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/features/__tests__/sceneApi.test.ts — used alias `@audio/features/sceneApi` but expected relative import (e.g., `./sceneApi`).
- src/audio/features/__tests__/subscriptionSync.test.ts — used alias `@audio/features/sceneApi` but expected relative import (e.g., `./sceneApi`).
- src/audio/features/__tests__/useAudioFeature.test.tsx — used alias `@audio/features/sceneApi` but expected relative import (e.g., `./sceneApi`).
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./sceneApi`) and alias imports for other domains (e.g., `@audio/features/sceneApi`).

## src/audio/offline-audio-mixer.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/export/__tests__/waveform-and-normalization.test.ts — used relative `../../audio/offline-audio-mixer` but expected alias import (e.g., `@audio/offline-audio-mixer`).
- Suggested canonical form: Use alias imports such as `@audio/offline-audio-mixer`.

## src/context/UndoContext.tsx
- Module domain: `context`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/context` (e.g., `./UndoContext`) and alias imports for other domains (e.g., `@context/UndoContext`).

## src/context/VisualizerContext.tsx
- Module domain: `context`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/context` (e.g., `./VisualizerContext`) and alias imports for other domains (e.g., `@context/VisualizerContext`).

## src/context/visualizer/types.ts
- Module domain: `context`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/context` (e.g., `./visualizer/types`) and alias imports for other domains (e.g., `@context/visualizer/types`).

## src/core/default-scene-loader.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./default-scene-loader`) and alias imports for other domains (e.g., `@core/default-scene-loader`).

## src/core/interaction/snapping.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/visualizer-core.ts — used alias `@core/interaction/snapping` but expected relative import (e.g., `../snapping`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `../snapping`) and alias imports for other domains (e.g., `@core/interaction/snapping`).

## src/core/midi/midi-library.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./midi-library`) and alias imports for other domains (e.g., `@core/midi/midi-library`).

## src/core/midi/note-event.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/index.ts — used alias `@core/midi/note-event` but expected relative import (e.g., `./note-event`).
- src/core/scene/elements/time-unit-piano-roll/note-block.ts — used alias `@core/midi/note-event` but expected relative import (e.g., `./note-event`).
- src/core/midi/music-theory/chord-estimator.ts — used alias `@core/midi/note-event` but expected relative import (e.g., `./note-event`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./note-event`) and alias imports for other domains (e.g., `@core/midi/note-event`).

## src/core/render/modular-renderer.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./render/modular-renderer`) and alias imports for other domains (e.g., `@core/render/modular-renderer`).

## src/core/scene/elements/audio-oscilloscope.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElements.test.ts — used alias `@core/scene/elements/audio-oscilloscope` but expected relative import (e.g., `./audio-oscilloscope`).
- Suggested canonical form: Use relative paths within `src/core` (e.g., `./audio-oscilloscope`).

## src/core/scene/elements/audio-spectrum.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audio-spectrum.test.ts — used alias `@core/scene/elements/audio-spectrum` but expected relative import (e.g., `./audio-spectrum`).
- Suggested canonical form: Use relative paths within `src/core` (e.g., `./audio-spectrum`).

## src/core/scene/elements/audio-volume-meter.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElements.test.ts — used alias `@core/scene/elements/audio-volume-meter` but expected relative import (e.g., `./audio-volume-meter`).
- Suggested canonical form: Use relative paths within `src/core` (e.g., `./audio-volume-meter`).

## src/core/scene/elements/audioElementMetadata.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElementMetadata.test.ts — used alias `@core/scene/elements/audioElementMetadata` but expected relative import (e.g., `./audioElementMetadata`).
- src/core/scene/elements/__tests__/baseSceneElement.test.ts — used alias `@core/scene/elements/audioElementMetadata` but expected relative import (e.g., `./audioElementMetadata`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./audioElementMetadata`) and alias imports for other domains (e.g., `@core/scene/elements/audioElementMetadata`).

## src/core/scene/elements/audioFeatureUtils.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElements.test.ts — used alias `@core/scene/elements/audioFeatureUtils` but expected relative import (e.g., `./audioFeatureUtils`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./audioFeatureUtils`) and alias imports for other domains (e.g., `@core/scene/elements/audioFeatureUtils`).

## src/core/scene/elements/base.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/time-unit-piano-roll/time-unit-piano-roll.ts — used alias `@core/scene/elements/base` but expected relative import (e.g., `./base`).
- src/core/scene/elements/__tests__/baseSceneElement.test.ts — used alias `@core/scene/elements/base` but expected relative import (e.g., `./base`).
- src/core/scene/elements/moving-notes-piano-roll/moving-notes-piano-roll.ts — used alias `@core/scene/elements/base` but expected relative import (e.g., `./base`).
- Suggested canonical form: Use relative paths within `src/core` (e.g., `./base`).

## src/core/scene/elements/time-unit-piano-roll/note-block.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./note-block`) and alias imports for other domains (e.g., `@core/scene/elements/time-unit-piano-roll/note-block`).

## src/core/timing/note-query.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/timing/__tests__/timeline-phase5.test.ts — used alias `@core/timing/note-query` but expected relative import (e.g., `../note-query`).
- src/core/timing/__tests__/timeline-mapping.test.ts — used alias `@core/timing/note-query` but expected relative import (e.g., `../note-query`).
- src/core/timing/__tests__/timeline-service.test.ts — used alias `@core/timing/note-query` but expected relative import (e.g., `../note-query`).
- Suggested canonical form: Use relative paths within `src/core` (e.g., `../note-query`).

## src/core/timing/ppq.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/timing/__tests__/timeline-phase5.test.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/timing/__tests__/time-domain.conversions.test.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/timing/__tests__/timeline-mapping.test.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/timing/__tests__/note-query.test.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/timing/__tests__/timeline-service.test.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/render/compile.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/render/scheduler-bridge.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/render/__tests__/scheduler-bridge.phase5.test.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/render/__tests__/compile.phase3.test.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/midi/midi-ingest.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/midi/midi-parser.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- src/core/midi/midi-manager.ts — used alias `@core/timing/ppq` but expected relative import (e.g., `./timing/ppq`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./timing/ppq`) and alias imports for other domains (e.g., `@core/timing/ppq`).

## src/core/timing/tempo-mapper.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./tempo-mapper`) and alias imports for other domains (e.g., `@core/timing/tempo-mapper`).

## src/core/timing/tempo-utils.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/render/compile.ts — used alias `@core/timing/tempo-utils` but expected relative import (e.g., `./tempo-utils`).
- src/core/render/scheduler-bridge.ts — used alias `@core/timing/tempo-utils` but expected relative import (e.g., `./tempo-utils`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./tempo-utils`) and alias imports for other domains (e.g., `@core/timing/tempo-utils`).

## src/core/timing/time-domain.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./time-domain`) and alias imports for other domains (e.g., `@core/timing/time-domain`).

## src/core/timing/timing-manager.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/midi/midi-manager.ts — used alias `@core/timing/timing-manager` but expected relative import (e.g., `./timing-manager`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./timing-manager`) and alias imports for other domains (e.g., `@core/timing/timing-manager`).

## src/core/timing/types.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/render/compile.ts — used alias `@core/timing/types` but expected relative import (e.g., `./types`).
- src/core/render/__tests__/compile.phase3.test.ts — used alias `@core/timing/types` but expected relative import (e.g., `./types`).
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./types`) and alias imports for other domains (e.g., `@core/timing/types`).

## src/export/export-clock.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/video-exporter.ts — used alias `@export/export-clock` but expected relative import (e.g., `./export-clock`).
- src/export/image-sequence-generator.ts — used alias `@export/export-clock` but expected relative import (e.g., `./export-clock`).
- src/export/__tests__/export-timing-snapshot.test.ts — used alias `@export/export-clock` but expected relative import (e.g., `./export-clock`).
- Suggested canonical form: Use relative paths within `src/export` (e.g., `./export-clock`).

## src/export/export-timing-snapshot.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/video-exporter.ts — used alias `@export/export-timing-snapshot` but expected relative import (e.g., `./export-timing-snapshot`).
- src/export/image-sequence-generator.ts — used alias `@export/export-timing-snapshot` but expected relative import (e.g., `./export-timing-snapshot`).
- src/export/__tests__/export-timing-snapshot.test.ts — used alias `@export/export-timing-snapshot` but expected relative import (e.g., `./export-timing-snapshot`).
- Suggested canonical form: Use relative paths within `src/export` (e.g., `./export-timing-snapshot`).

## src/export/mp3-encoder-loader.ts
- Module domain: `export`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/export` (e.g., `./mp3-encoder-loader`) and alias imports for other domains (e.g., `@export/mp3-encoder-loader`).

## src/export/repro-hash.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/__tests__/offline-mixer-and-hash.test.ts — used alias `@export/repro-hash` but expected relative import (e.g., `./repro-hash`).
- Suggested canonical form: Use relative paths within `src/export` (e.g., `./repro-hash`).

## src/export/video-exporter.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/__tests__/filename-export.test.ts — used alias `@export/video-exporter` but expected relative import (e.g., `./video-exporter`).
- Suggested canonical form: Use relative paths within `src/export` (e.g., `./video-exporter`).

## src/math/transforms/types.ts
- Module domain: `math`
- Inconsistent import locations:
- src/math/geometry.ts — used alias `@math/transforms/types` but expected relative import (e.g., `./types`).
- Suggested canonical form: Use relative paths inside `src/math` (e.g., `./types`) and alias imports for other domains (e.g., `@math/transforms/types`).

## src/persistence/document-gateway.ts
- Module domain: `persistence`
- Inconsistent import locations:
- src/persistence/__tests__/persistence.baseline.scene-regression.test.ts — used alias `@persistence/document-gateway` but expected relative import (e.g., `./document-gateway`).
- src/persistence/__tests__/tempo-restore.test.ts — used alias `@persistence/document-gateway` but expected relative import (e.g., `./document-gateway`).
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./document-gateway`) and alias imports for other domains (e.g., `@persistence/document-gateway`).

## src/persistence/export.ts
- Module domain: `persistence`
- Inconsistent import locations:
- src/persistence/__tests__/persistence.selection-omission.test.ts — used alias `@persistence/export` but expected relative import (e.g., `./export`).
- src/persistence/__tests__/audioFeatureCache.persistence.test.ts — used alias `@persistence/export` but expected relative import (e.g., `./export`).
- Suggested canonical form: Use relative paths within `src/persistence` (e.g., `./export`).

## src/persistence/font-binary-store.ts
- Module domain: `persistence`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./font-binary-store`) and alias imports for other domains (e.g., `@persistence/font-binary-store`).

## src/persistence/import.ts
- Module domain: `persistence`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./import`) and alias imports for other domains (e.g., `@persistence/import`).

## src/persistence/index.ts
- Module domain: `persistence`
- Inconsistent import locations:
- src/persistence/__tests__/persistence.midi-assets.test.ts — used alias `@persistence/index` but expected relative import (e.g., `../index`).
- src/persistence/__tests__/persistence.scene-elements.test.ts — used alias `@persistence/index` but expected relative import (e.g., `../index`).
- src/persistence/__tests__/audioFeatureCache.persistence.test.ts — used alias `@persistence/index` but expected relative import (e.g., `../index`).
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `../index`) and alias imports for other domains (e.g., `@persistence/index`).

## src/persistence/migrations/audioSystemV4.ts
- Module domain: `persistence`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./migrations/audioSystemV4`) and alias imports for other domains (e.g., `@persistence/migrations/audioSystemV4`).

## src/persistence/migrations/removeSmoothingFromDescriptor.ts
- Module domain: `persistence`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./removeSmoothingFromDescriptor`) and alias imports for other domains (e.g., `@persistence/migrations/removeSmoothingFromDescriptor`).

## src/persistence/migrations/unifyChannelField.ts
- Module domain: `persistence`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./unifyChannelField`) and alias imports for other domains (e.g., `@persistence/migrations/unifyChannelField`).

## src/persistence/scene-package.ts
- Module domain: `persistence`
- Inconsistent import locations:
- src/persistence/__tests__/audioFeatureCache.persistence.test.ts — used alias `@persistence/scene-package` but expected relative import (e.g., `./scene-package`).
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./scene-package`) and alias imports for other domains (e.g., `@persistence/scene-package`).

## src/persistence/stable-stringify.ts
- Module domain: `persistence`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `./stable-stringify`) and alias imports for other domains (e.g., `@persistence/stable-stringify`).

## src/state/scene/commandGateway.ts
- Module domain: `state`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./commandGateway`) and alias imports for other domains (e.g., `@state/scene/commandGateway`).

## src/state/scene/fonts.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/sceneStore.ts — used alias `@state/scene/fonts` but expected relative import (e.g., `./fonts`).
- src/state/scene/__tests__/sceneStore.test.ts — used alias `@state/scene/fonts` but expected relative import (e.g., `./fonts`).
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./fonts`) and alias imports for other domains (e.g., `@state/scene/fonts`).

## src/state/scene/macroSyncService.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/scene/__tests__/macroRuntimeIntegration.test.ts — used alias `@state/scene/macroSyncService` but expected relative import (e.g., `./macroSyncService`).
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./macroSyncService`) and alias imports for other domains (e.g., `@state/scene/macroSyncService`).

## src/state/scene/runtimeAdapter.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/scene/__tests__/runtimeAdapter.test.ts — used alias `@state/scene/runtimeAdapter` but expected relative import (e.g., `./runtimeAdapter`).
- Suggested canonical form: Use relative paths within `src/state` (e.g., `./runtimeAdapter`).

## src/state/scene/sceneTelemetry.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/undo/patch-undo.ts — used alias `@state/scene/sceneTelemetry` but expected relative import (e.g., `./sceneTelemetry`).
- Suggested canonical form: Use relative paths within `src/state` (e.g., `./sceneTelemetry`).

## src/state/scene/selectors.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/scene/__tests__/storeMigration.acceptance.test.tsx — used alias `@state/scene/selectors` but expected relative import (e.g., `./selectors`).
- src/state/scene/__tests__/sceneStore.test.ts — used alias `@state/scene/selectors` but expected relative import (e.g., `./selectors`).
- Suggested canonical form: Use relative paths within `src/state` (e.g., `./selectors`).

## src/state/sceneStore.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/undo/__tests__/patch-undo.test.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/__tests__/sceneStore.migrations.test.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/commandGateway.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/fonts.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/hooks.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/runtimeAdapter.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/storeElementFactory.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/macroSyncService.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/fixtures/edgeMacroScene.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/__tests__/storeMigration.acceptance.test.tsx — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/__tests__/macroRuntimeIntegration.test.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/__tests__/sceneStore.test.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/__tests__/runtimeAdapter.test.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/__tests__/commandGateway.test.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- src/state/scene/__tests__/macroIndex.fuzz.test.ts — used alias `@state/sceneStore` but expected relative import (e.g., `../sceneStore`).
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../sceneStore`) and alias imports for other domains (e.g., `@state/sceneStore`).

## src/state/selectors/timelineSelectors.ts
- Module domain: `state`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../selectors/timelineSelectors`) and alias imports for other domains (e.g., `@selectors/timelineSelectors`).

## src/state/timeline/commands/addTrackCommand.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/timeline/__tests__/commandGateway.test.ts — used alias `@state/timeline/commands/addTrackCommand` but expected relative import (e.g., `./timeline/commands/addTrackCommand`).
- Suggested canonical form: Use relative paths within `src/state` (e.g., `./timeline/commands/addTrackCommand`).

## src/state/timeline/patches.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/undo/patch-undo.ts — used alias `@state/timeline/patches` but expected relative import (e.g., `./patches`).
- Suggested canonical form: Use relative paths within `src/state` (e.g., `./patches`).

## src/state/timeline/quantize.ts
- Module domain: `state`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./timeline/quantize`) and alias imports for other domains (e.g., `@state/timeline/quantize`).

## src/state/timeline/timelineTelemetry.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/undo/patch-undo.ts — used alias `@state/timeline/timelineTelemetry` but expected relative import (e.g., `./timelineTelemetry`).
- src/state/timeline/__tests__/commandGateway.test.ts — used alias `@state/timeline/timelineTelemetry` but expected relative import (e.g., `./timelineTelemetry`).
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./timelineTelemetry`) and alias imports for other domains (e.g., `@state/timeline/timelineTelemetry`).

## src/state/timelineStore.ts
- Module domain: `state`
- Inconsistent import locations:
- src/persistence/document-gateway.ts — used relative `../state/timelineStore` but expected alias import (e.g., `@state/timelineStore`).
- src/persistence/export.ts — used relative `../state/timelineStore` but expected alias import (e.g., `@state/timelineStore`).
- src/persistence/__tests__/persistence.phase1.test.ts — used relative `../../state/timelineStore` but expected alias import (e.g., `@state/timelineStore`).
- src/state/sceneStore.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/undo/patch-undo.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/undo/__tests__/patch-undo.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/undo/__tests__/audioFeatureCache.undo.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/tests/playheadAdvances.playing.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/tests/pause.noJump.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/__tests__/audioBpmScaling.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/__tests__/audioTrack.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/__tests__/audioDiagnosticsStore.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/__tests__/audioFeatureAutoAnalysis.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/__tests__/audioFeatureCache.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/__tests__/hybridCacheRollout.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/timeline/__tests__/commandGateway.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/scene/storeElementFactory.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/scene/__tests__/storeMigration.acceptance.test.tsx — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/scene/__tests__/sceneStore.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/scene/__tests__/commandGateway.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/selectors/audioFeatureSelectors.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- src/state/selectors/__tests__/audioFeatureSampling.test.ts — used alias `@state/timelineStore` but expected relative import (e.g., `../state/timelineStore`).
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../state/timelineStore`) and alias imports for other domains (e.g., `@state/timelineStore`).

## src/state/timelineTypes.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/timelineTime.ts — used alias `@state/timelineTypes` but expected relative import (e.g., `../timelineTypes`).
- src/state/timelineStore.ts — used alias `@state/timelineTypes` but expected relative import (e.g., `../timelineTypes`).
- src/state/__tests__/timelineTime.test.ts — used alias `@state/timelineTypes` but expected relative import (e.g., `../timelineTypes`).
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../timelineTypes`) and alias imports for other domains (e.g., `@state/timelineTypes`).

## src/state/undo/patch-undo.ts
- Module domain: `state`
- Inconsistent import locations:
- src/persistence/index.ts — used relative `../state/undo/patch-undo` but expected alias import (e.g., `@state/undo/patch-undo`).
- src/state/undo/__tests__/patch-undo.test.ts — used alias `@state/undo/patch-undo` but expected relative import (e.g., `../state/undo/patch-undo`).
- src/state/undo/__tests__/audioFeatureCache.undo.test.ts — used alias `@state/undo/patch-undo` but expected relative import (e.g., `../state/undo/patch-undo`).
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../state/undo/patch-undo`) and alias imports for other domains (e.g., `@state/undo/patch-undo`).

## src/utils/base64.ts
- Module domain: `utils`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/utils` (e.g., `./base64`) and alias imports for other domains (e.g., `@utils/base64`).

## src/workspace/form/inputs/FontInput.tsx
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/panels/properties/MacroConfig.tsx — used alias `@workspace/form/inputs/FontInput` but expected relative import (e.g., `./FontInput`).
- Suggested canonical form: Use relative paths within `src/workspace` (e.g., `./FontInput`).

## src/workspace/form/inputs/TimelineTrackSelect.tsx
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/panels/properties/MacroConfig.tsx — used alias `@workspace/form/inputs/TimelineTrackSelect` but expected relative import (e.g., `./TimelineTrackSelect`).
- Suggested canonical form: Use relative paths within `src/workspace` (e.g., `./TimelineTrackSelect`).

## src/workspace/form/inputs/useNumberDrag.ts
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/panels/properties/MacroConfig.tsx — used alias `@workspace/form/inputs/useNumberDrag` but expected relative import (e.g., `./useNumberDrag`).
- Suggested canonical form: Use relative paths within `src/workspace` (e.g., `./useNumberDrag`).

## src/workspace/panels/properties/MacroConfig.tsx
- Module domain: `workspace`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/workspace` (e.g., `./MacroConfig`) and alias imports for other domains (e.g., `@workspace/panels/properties/MacroConfig`).

## src/workspace/templates/types.ts
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/layout/MenuBar.tsx — used alias `@workspace/templates/types` but expected relative import (e.g., `./types`).
- Suggested canonical form: Use relative paths inside `src/workspace` (e.g., `./types`) and alias imports for other domains (e.g., `@workspace/templates/types`).
