# Import Alias Consistency Report

Status: Completed analysis

This report lists every module imported via both alias and relative paths, evaluates whether the usage aligns with the "alias for cross-domain, relative for intra-folder" guideline, and suggests canonical forms.

## src/animation/anim-math.ts
- Module domain: `animation`
- Inconsistent import locations:
- src/animation/note-animations/press.ts — used alias `@animation/anim-math` but should import relatively (`../anim-math`).
- src/animation/note-animations/template.ts — used alias `@animation/anim-math` but should import relatively (`../anim-math`).
- src/animation/note-animations/scale.ts — used alias `@animation/anim-math` but should import relatively (`../anim-math`).
- Suggested canonical form: Use relative paths for intra-domain imports (e.g., `../anim-math` from other `note-animations/*` files).

## src/audio/features/analysisIntents.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/features/__tests__/sceneApi.test.ts — used alias `@audio/features/analysisIntents`; prefer the relative path `../analysisIntents`.
- src/audio/features/__tests__/useAudioFeature.test.tsx — used alias `@audio/features/analysisIntents`; prefer the relative path `../analysisIntents`.
- Suggested canonical form: Use relative paths within `src/audio/features` (e.g., `./analysisIntents` or `../analysisIntents` depending on depth) and reserve alias imports for cross-domain usage (e.g., `@audio/features/analysisIntents`).

## src/audio/features/audioFeatureAnalysis.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/__tests__/audioFeatureAnalysis.test.ts — used alias `@audio/features/audioFeatureAnalysis`; prefer the relative path `../features/audioFeatureAnalysis`.
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./audioFeatureAnalysis` from sibling modules or `../features/audioFeatureAnalysis` from tests) and alias imports for other domains (e.g., `@audio/features/audioFeatureAnalysis`).

## src/audio/features/audioFeatureRegistry.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/__tests__/audioFeatureAnalysis.test.ts — used alias `@audio/features/audioFeatureRegistry`; prefer the relative path `../features/audioFeatureRegistry`.
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./audioFeatureRegistry` or `../features/audioFeatureRegistry`) and alias imports for other domains (e.g., `@audio/features/audioFeatureRegistry`).

## src/audio/features/audioFeatureTypes.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/__tests__/channelResolution.test.ts — used alias `@audio/features/audioFeatureTypes`; prefer the relative path `../features/audioFeatureTypes`.
- src/audio/features/__tests__/audioSamplingOptions.test.ts — used alias `@audio/features/audioFeatureTypes`; prefer the relative path `../audioFeatureTypes`.
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./audioFeatureTypes` or folder-aware equivalents) and alias imports for other domains (e.g., `@audio/features/audioFeatureTypes`).

## src/audio/features/descriptorBuilder.ts
- Module domain: `audio`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `./descriptorBuilder`) and alias imports for other domains (e.g., `@audio/features/descriptorBuilder`).

## src/audio/features/sceneApi.ts
- Module domain: `audio`
- Inconsistent import locations:
- src/audio/features/__tests__/sceneApi.test.ts — used alias `@audio/features/sceneApi`; prefer the relative path `../sceneApi`.
- src/audio/features/__tests__/subscriptionSync.test.ts — used alias `@audio/features/sceneApi`; prefer the relative path `../sceneApi`.
- src/audio/features/__tests__/useAudioFeature.test.tsx — used alias `@audio/features/sceneApi`; prefer the relative path `../sceneApi`.
- Suggested canonical form: Use relative paths inside `src/audio` (e.g., `../sceneApi` from feature tests) and alias imports for other domains (e.g., `@audio/features/sceneApi`).

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
- src/core/visualizer-core.ts — used alias `@core/interaction/snapping`; prefer the relative path `./interaction/snapping`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./interaction/snapping` from `visualizer-core.ts`) and alias imports for other domains (e.g., `@core/interaction/snapping`).

## src/core/midi/midi-library.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./midi-library`) and alias imports for other domains (e.g., `@core/midi/midi-library`).

## src/core/midi/note-event.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/index.ts — used alias `@core/midi/note-event`; prefer the relative path `./midi/note-event`.
- src/core/scene/elements/time-unit-piano-roll/note-block.ts — used alias `@core/midi/note-event`; prefer the relative path `../../midi/note-event`.
- src/core/midi/music-theory/chord-estimator.ts — used alias `@core/midi/note-event`; prefer the relative path `../note-event`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., paths like `./midi/note-event` or `../../midi/note-event`) and alias imports for other domains (e.g., `@core/midi/note-event`).

## src/core/render/modular-renderer.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./render/modular-renderer`) and alias imports for other domains (e.g., `@core/render/modular-renderer`).

## src/core/scene/elements/audio-oscilloscope.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElements.test.ts — used alias `@core/scene/elements/audio-oscilloscope`; prefer the relative path `../audio-oscilloscope`.
- Suggested canonical form: Use relative paths within `src/core` (e.g., `../audio-oscilloscope` from the test suite).

## src/core/scene/elements/audio-spectrum.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audio-spectrum.test.ts — used alias `@core/scene/elements/audio-spectrum`; prefer the relative path `../audio-spectrum`.
- Suggested canonical form: Use relative paths within `src/core` (e.g., `../audio-spectrum` from the test suite).

## src/core/scene/elements/audio-volume-meter.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElements.test.ts — used alias `@core/scene/elements/audio-volume-meter`; prefer the relative path `../audio-volume-meter`.
- Suggested canonical form: Use relative paths within `src/core` (e.g., `../audio-volume-meter` from the test suite).

## src/core/scene/elements/audioElementMetadata.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElementMetadata.test.ts — used alias `@core/scene/elements/audioElementMetadata`; prefer the relative path `../audioElementMetadata`.
- src/core/scene/elements/__tests__/baseSceneElement.test.ts — used alias `@core/scene/elements/audioElementMetadata`; prefer the relative path `../audioElementMetadata`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `../audioElementMetadata` from test suites) and alias imports for other domains (e.g., `@core/scene/elements/audioElementMetadata`).

## src/core/scene/elements/audioFeatureUtils.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/__tests__/audioElements.test.ts — used alias `@core/scene/elements/audioFeatureUtils`; prefer the relative path `../audioFeatureUtils`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `../audioFeatureUtils` from test suites) and alias imports for other domains (e.g., `@core/scene/elements/audioFeatureUtils`).

## src/core/scene/elements/base.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/scene/elements/time-unit-piano-roll/time-unit-piano-roll.ts — used alias `@core/scene/elements/base`; prefer the relative path `../base`.
- src/core/scene/elements/__tests__/baseSceneElement.test.ts — used alias `@core/scene/elements/base`; prefer the relative path `../base`.
- src/core/scene/elements/moving-notes-piano-roll/moving-notes-piano-roll.ts — used alias `@core/scene/elements/base`; prefer the relative path `../base`.
- Suggested canonical form: Use relative paths within `src/core` (e.g., `../base` from nested element folders).

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
- src/core/timing/__tests__/timeline-phase5.test.ts — used alias `@core/timing/ppq`; prefer the relative path `../ppq`.
- src/core/timing/__tests__/time-domain.conversions.test.ts — used alias `@core/timing/ppq`; prefer the relative path `../ppq`.
- src/core/timing/__tests__/timeline-mapping.test.ts — used alias `@core/timing/ppq`; prefer the relative path `../ppq`.
- src/core/timing/__tests__/note-query.test.ts — used alias `@core/timing/ppq`; prefer the relative path `../ppq`.
- src/core/timing/__tests__/timeline-service.test.ts — used alias `@core/timing/ppq`; prefer the relative path `../ppq`.
- src/core/render/compile.ts — used alias `@core/timing/ppq`; prefer the relative path `../timing/ppq`.
- src/core/render/scheduler-bridge.ts — used alias `@core/timing/ppq`; prefer the relative path `../timing/ppq`.
- src/core/render/__tests__/scheduler-bridge.phase5.test.ts — used alias `@core/timing/ppq`; prefer the relative path `../timing/ppq`.
- src/core/render/__tests__/compile.phase3.test.ts — used alias `@core/timing/ppq`; prefer the relative path `../timing/ppq`.
- src/core/midi/midi-ingest.ts — used alias `@core/timing/ppq`; prefer the relative path `../timing/ppq`.
- src/core/midi/midi-parser.ts — used alias `@core/timing/ppq`; prefer the relative path `../timing/ppq`.
- src/core/midi/midi-manager.ts — used alias `@core/timing/ppq`; prefer the relative path `../timing/ppq`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `../ppq` from timing tests or `../timing/ppq` from render/midi modules) and alias imports for other domains (e.g., `@core/timing/ppq`).

## src/core/timing/tempo-mapper.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./tempo-mapper`) and alias imports for other domains (e.g., `@core/timing/tempo-mapper`).

## src/core/timing/tempo-utils.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/render/compile.ts — used alias `@core/timing/tempo-utils`; prefer the relative path `../timing/tempo-utils`.
- src/core/render/scheduler-bridge.ts — used alias `@core/timing/tempo-utils`; prefer the relative path `../timing/tempo-utils`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `../timing/tempo-utils` from render modules) and alias imports for other domains (e.g., `@core/timing/tempo-utils`).

## src/core/timing/time-domain.ts
- Module domain: `core`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `./time-domain`) and alias imports for other domains (e.g., `@core/timing/time-domain`).

## src/core/timing/timing-manager.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/midi/midi-manager.ts — used alias `@core/timing/timing-manager`; prefer the relative path `../timing/timing-manager`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `../timing/timing-manager` from MIDI modules) and alias imports for other domains (e.g., `@core/timing/timing-manager`).

## src/core/timing/types.ts
- Module domain: `core`
- Inconsistent import locations:
- src/core/render/compile.ts — used alias `@core/timing/types`; prefer the relative path `../timing/types`.
- src/core/render/__tests__/compile.phase3.test.ts — used alias `@core/timing/types`; prefer the relative path `../timing/types`.
- Suggested canonical form: Use relative paths inside `src/core` (e.g., `../timing/types` from render modules) and alias imports for other domains (e.g., `@core/timing/types`).

## src/export/export-clock.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/video-exporter.ts — used alias `@export/export-clock`; prefer the relative path `./export-clock`.
- src/export/image-sequence-generator.ts — used alias `@export/export-clock`; prefer the relative path `./export-clock`.
- src/export/__tests__/export-timing-snapshot.test.ts — used alias `@export/export-clock`; prefer the relative path `../export-clock`.
- Suggested canonical form: Use relative paths within `src/export` (e.g., `./export-clock` from sibling modules or `../export-clock` from tests).

## src/export/export-timing-snapshot.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/video-exporter.ts — used alias `@export/export-timing-snapshot`; prefer the relative path `./export-timing-snapshot`.
- src/export/image-sequence-generator.ts — used alias `@export/export-timing-snapshot`; prefer the relative path `./export-timing-snapshot`.
- src/export/__tests__/export-timing-snapshot.test.ts — used alias `@export/export-timing-snapshot`; prefer the relative path `../export-timing-snapshot`.
- Suggested canonical form: Use relative paths within `src/export` (e.g., `./export-timing-snapshot` from sibling modules or `../export-timing-snapshot` from tests).

## src/export/mp3-encoder-loader.ts
- Module domain: `export`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/export` (e.g., `./mp3-encoder-loader`) and alias imports for other domains (e.g., `@export/mp3-encoder-loader`).

## src/export/repro-hash.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/__tests__/offline-mixer-and-hash.test.ts — used alias `@export/repro-hash`; prefer the relative path `../repro-hash`.
- Suggested canonical form: Use relative paths within `src/export` (e.g., `../repro-hash` from tests) and alias imports for other domains (e.g., `@export/repro-hash`).

## src/export/video-exporter.ts
- Module domain: `export`
- Inconsistent import locations:
- src/export/__tests__/filename-export.test.ts — used alias `@export/video-exporter`; prefer the relative path `../video-exporter`.
- Suggested canonical form: Use relative paths within `src/export` (e.g., `./video-exporter` from sibling modules or `../video-exporter` from tests).

## src/math/transforms/types.ts
- Module domain: `math`
- Inconsistent import locations:
- src/math/geometry.ts — used alias `@math/transforms/types`; prefer the relative path `./transforms/types`.
- Suggested canonical form: Use relative paths inside `src/math` (e.g., `./transforms/types`) and alias imports for other domains (e.g., `@math/transforms/types`).

## src/persistence/document-gateway.ts
- Module domain: `persistence`
- Inconsistent import locations:
- src/persistence/__tests__/persistence.baseline.scene-regression.test.ts — used alias `@persistence/document-gateway`; prefer the relative path `../document-gateway`.
- src/persistence/__tests__/tempo-restore.test.ts — used alias `@persistence/document-gateway`; prefer the relative path `../document-gateway`.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `../document-gateway` from the test suites) and alias imports for other domains (e.g., `@persistence/document-gateway`).

## src/persistence/export.ts
- Module domain: `persistence`
- Inconsistent import locations:
- src/persistence/__tests__/persistence.selection-omission.test.ts — used alias `@persistence/export`; prefer the relative path `../export`.
- src/persistence/__tests__/audioFeatureCache.persistence.test.ts — used alias `@persistence/export`; prefer the relative path `../export`.
- Suggested canonical form: Use relative paths within `src/persistence` (e.g., `../export` from test suites).

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
- src/persistence/__tests__/audioFeatureCache.persistence.test.ts — used alias `@persistence/scene-package`; prefer the relative path `../scene-package`.
- Suggested canonical form: Use relative paths inside `src/persistence` (e.g., `../scene-package` from test suites) and alias imports for other domains (e.g., `@persistence/scene-package`).

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
- src/state/sceneStore.ts — used alias `@state/scene/fonts`; prefer the relative path `./scene/fonts`.
- src/state/scene/__tests__/sceneStore.test.ts — used alias `@state/scene/fonts`; prefer the relative path `../fonts`.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./scene/fonts` from `sceneStore.ts` or `../fonts` from scene tests) and alias imports for other domains (e.g., `@state/scene/fonts`).

## src/state/scene/macroSyncService.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/scene/__tests__/macroRuntimeIntegration.test.ts — used alias `@state/scene/macroSyncService`; prefer the relative path `../macroSyncService`.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../macroSyncService` from scene tests) and alias imports for other domains (e.g., `@state/scene/macroSyncService`).

## src/state/scene/runtimeAdapter.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/scene/__tests__/runtimeAdapter.test.ts — used alias `@state/scene/runtimeAdapter`; prefer the relative path `../runtimeAdapter`.
- Suggested canonical form: Use relative paths within `src/state` (e.g., `../runtimeAdapter` from scene tests).

## src/state/scene/sceneTelemetry.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/undo/patch-undo.ts — used alias `@state/scene/sceneTelemetry`; prefer the relative path `../scene/sceneTelemetry`.
- Suggested canonical form: Use relative paths within `src/state` (e.g., `../scene/sceneTelemetry` from undo modules).

## src/state/scene/selectors.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/scene/__tests__/storeMigration.acceptance.test.tsx — used alias `@state/scene/selectors`; prefer the relative path `../selectors`.
- src/state/scene/__tests__/sceneStore.test.ts — used alias `@state/scene/selectors`; prefer the relative path `../selectors`.
- Suggested canonical form: Use relative paths within `src/state` (e.g., `../selectors` from scene tests).

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
- src/state/timeline/__tests__/commandGateway.test.ts — used alias `@state/timeline/commands/addTrackCommand`; prefer the relative path `../commands/addTrackCommand`.
- Suggested canonical form: Use relative paths within `src/state` (e.g., `../commands/addTrackCommand` from timeline tests).

## src/state/timeline/patches.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/undo/patch-undo.ts — used alias `@state/timeline/patches`; prefer the relative path `../timeline/patches`.
- Suggested canonical form: Use relative paths within `src/state` (e.g., `../timeline/patches` from undo modules).

## src/state/timeline/quantize.ts
- Module domain: `state`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./timeline/quantize`) and alias imports for other domains (e.g., `@state/timeline/quantize`).

## src/state/timeline/timelineTelemetry.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/undo/patch-undo.ts — used alias `@state/timeline/timelineTelemetry`; prefer the relative path `../timeline/timelineTelemetry`.
- src/state/timeline/__tests__/commandGateway.test.ts — used alias `@state/timeline/timelineTelemetry`; prefer the relative path `../timelineTelemetry`.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../timeline/timelineTelemetry` or `../timelineTelemetry` depending on depth) and alias imports for other domains (e.g., `@state/timeline/timelineTelemetry`).

## src/state/timelineStore.ts
- Module domain: `state`
- Inconsistent import locations:
- src/persistence/document-gateway.ts — used relative `../state/timelineStore`; prefer the alias `@state/timelineStore` for cross-domain access.
- src/persistence/export.ts — used relative `../state/timelineStore`; prefer the alias `@state/timelineStore` for cross-domain access.
- src/persistence/__tests__/persistence.phase1.test.ts — used relative `../../state/timelineStore`; prefer the alias `@state/timelineStore` for cross-domain access.
- src/state/sceneStore.ts — used alias `@state/timelineStore`; prefer the relative path `./timelineStore`.
- src/state/undo/patch-undo.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/undo/__tests__/patch-undo.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/undo/__tests__/audioFeatureCache.undo.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/tests/playheadAdvances.playing.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/tests/pause.noJump.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/__tests__/audioBpmScaling.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/__tests__/audioTrack.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/__tests__/audioDiagnosticsStore.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/__tests__/audioFeatureAutoAnalysis.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/__tests__/audioFeatureCache.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/__tests__/hybridCacheRollout.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/timeline/__tests__/commandGateway.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/scene/storeElementFactory.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/scene/__tests__/storeMigration.acceptance.test.tsx — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/scene/__tests__/sceneStore.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/scene/__tests__/commandGateway.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/selectors/audioFeatureSelectors.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- src/state/selectors/__tests__/audioFeatureSampling.test.ts — used alias `@state/timelineStore`; prefer the relative path `../timelineStore`.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./timelineStore` or `../timelineStore` depending on depth) and alias imports for other domains (e.g., `@state/timelineStore`).

## src/state/timelineTypes.ts
- Module domain: `state`
- Inconsistent import locations:
- src/state/timelineTime.ts — used alias `@state/timelineTypes`; prefer the relative path `./timelineTypes`.
- src/state/timelineStore.ts — used alias `@state/timelineTypes`; prefer the relative path `./timelineTypes`.
- src/state/__tests__/timelineTime.test.ts — used alias `@state/timelineTypes`; prefer the relative path `../timelineTypes`.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `./timelineTypes` from sibling modules or `../timelineTypes` from tests) and alias imports for other domains (e.g., `@state/timelineTypes`).

## src/state/undo/patch-undo.ts
- Module domain: `state`
- Inconsistent import locations:
- src/persistence/index.ts — used relative `../state/undo/patch-undo`; prefer the alias `@state/undo/patch-undo` for cross-domain access.
- src/state/undo/__tests__/patch-undo.test.ts — used alias `@state/undo/patch-undo`; prefer the relative path `../patch-undo`.
- src/state/undo/__tests__/audioFeatureCache.undo.test.ts — used alias `@state/undo/patch-undo`; prefer the relative path `../patch-undo`.
- Suggested canonical form: Use relative paths inside `src/state` (e.g., `../patch-undo` from undo tests) and alias imports for other domains (e.g., `@state/undo/patch-undo`).

## src/utils/base64.ts
- Module domain: `utils`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/utils` (e.g., `./base64`) and alias imports for other domains (e.g., `@utils/base64`).

## src/workspace/form/inputs/FontInput.tsx
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/panels/properties/MacroConfig.tsx — used alias `@workspace/form/inputs/FontInput`; prefer the relative path `../../form/inputs/FontInput`.
- Suggested canonical form: Use relative paths within `src/workspace` (e.g., `../../form/inputs/FontInput` from `panels/properties`).

## src/workspace/form/inputs/TimelineTrackSelect.tsx
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/panels/properties/MacroConfig.tsx — used alias `@workspace/form/inputs/TimelineTrackSelect`; prefer the relative path `../../form/inputs/TimelineTrackSelect`.
- Suggested canonical form: Use relative paths within `src/workspace` (e.g., `../../form/inputs/TimelineTrackSelect` from `panels/properties`).

## src/workspace/form/inputs/useNumberDrag.ts
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/panels/properties/MacroConfig.tsx — used alias `@workspace/form/inputs/useNumberDrag`; prefer the relative path `../../form/inputs/useNumberDrag`.
- Suggested canonical form: Use relative paths within `src/workspace` (e.g., `../../form/inputs/useNumberDrag` from `panels/properties`).

## src/workspace/panels/properties/MacroConfig.tsx
- Module domain: `workspace`
- Inconsistent import locations:
- None; current usage follows the guideline.
- Suggested canonical form: Use relative paths inside `src/workspace` (e.g., `./MacroConfig`) and alias imports for other domains (e.g., `@workspace/panels/properties/MacroConfig`).

## src/workspace/templates/types.ts
- Module domain: `workspace`
- Inconsistent import locations:
- src/workspace/layout/MenuBar.tsx — used alias `@workspace/templates/types`; prefer the relative path `../templates/types`.
- Suggested canonical form: Use relative paths inside `src/workspace` (e.g., `../templates/types` from layout components) and alias imports for other domains (e.g., `@workspace/templates/types`).
