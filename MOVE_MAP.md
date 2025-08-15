# File Move & Rename Map (Ordered Phases)

Comprehensive table listing each move, grouped into safe phases. Execute phases sequentially; within a phase follow ascending order. Always run type check & tests after each phase.

| Phase                | Order | Current Path                                        | New Path                                                             | Action                | Notes                     |
| -------------------- | ----- | --------------------------------------------------- | -------------------------------------------------------------------- | --------------------- | ------------------------- |
| 1 Prep & Low-Risk    | 1     | src/visualizer/scene-name-generator.js              | src/core/name-generator.ts                                           | move+rename           | Alias test; low deps      |
| 1                    | 2     | src/visualizer/timing-manager.js                    | src/core/timing-manager.ts                                           | move+rename           | Convert to .ts minimal    |
| 1                    | 3     | src/visualizer/utils/debug-log.js                   | src/utils/debug-log.ts                                               | move+rename           | Logging utility           |
| 1                    | 4     | src/visualizer/math/mathUtils.ts                    | src/math/numeric.ts                                                  | move+rename           | Establish math folder     |
| 1                    | 5     | src/visualizer/math/mouseToTransforms.test.ts       | src/math/transforms/mouseToTransforms.test.ts                        | move                  | Keep with impl            |
| 1                    | 6     | src/visualizer/math/mouseToTransforms.ts            | src/math/transforms/mouseToTransforms.ts                             | move                  |                           |
| 1                    | 7     | src/visualizer/math/transformHelpers.ts             | src/math/transforms/transformHelpers.ts                              | move                  |                           |
| 1                    | 8     | src/visualizer/math/geometry.ts                     | src/math/geometry.ts                                                 | move                  |                           |
| 1                    | 9     | src/visualizer/math/interaction.ts                  | src/math/interaction.ts                                              | move                  | Decide final later        |
| 1                    | 10    | src/visualizer/math/types.ts                        | src/math/types.ts                                                    | move                  |                           |
| 1                    | 11    | src/visualizer/utils/easings.ts                     | src/animation/easings.ts                                             | move                  | Seed animation domain     |
| 1                    | 12    | src/visualizer/utils/animations.ts                  | src/animation/animations.ts                                          | move                  |                           |
| 1                    | 13    | src/visualizer/utils/animations.test.ts             | src/animation/animations.test.ts                                     | move                  |                           |
| 2 Core Extraction    | 1     | src/visualizer/types.ts                             | src/core/types.ts                                                    | move                  | Base types                |
| 2                    | 2     | src/visualizer/index.ts                             | src/core/index.ts                                                    | move                  | Public façade             |
| 2                    | 3     | src/visualizer/visualizer-core.ts                   | src/core/visualizer-core.ts                                          | move                  |                           |
| 2                    | 4     | src/visualizer/scene-builder.ts                     | src/core/builder.ts                                                  | move                  |                           |
| 2                    | 5     | src/visualizer/scene-element-registry.ts            | src/core/scene/registry/scene-element-registry.ts                    | move                  |                           |
| 2                    | 6     | src/visualizer/modular-renderer.ts                  | src/core/render/modular-renderer.ts                                  | move                  |                           |
| 2                    | 7     | src/visualizer/render-objects/base.ts               | src/core/render/render-objects/base.ts                               | move                  |                           |
| 2                    | 8     | src/visualizer/render-objects/empty.ts              | src/core/render/render-objects/empty.ts                              | move                  |                           |
| 2                    | 9     | src/visualizer/render-objects/image.ts              | src/core/render/render-objects/image.ts                              | move                  |                           |
| 2                    | 10    | src/visualizer/render-objects/index.ts              | src/core/render/render-objects/index.ts                              | move                  |                           |
| 2                    | 11    | src/visualizer/render-objects/line.ts               | src/core/render/render-objects/line.ts                               | move                  |                           |
| 2                    | 12    | src/visualizer/render-objects/poly.ts               | src/core/render/render-objects/poly.ts                               | move                  |                           |
| 2                    | 13    | src/visualizer/render-objects/rectangle.ts          | src/core/render/render-objects/rectangle.ts                          | move                  |                           |
| 2                    | 14    | src/visualizer/render-objects/text.ts               | src/core/render/render-objects/text.ts                               | move                  |                           |
| 2                    | 15    | src/visualizer/midi-parser.ts                       | src/core/midi/midi-parser.ts                                         | move                  |                           |
| 2                    | 16    | src/visualizer/midi-manager.ts                      | src/core/midi/midi-manager.ts                                        | move                  |                           |
| 2                    | 17    | src/visualizer/note-event.ts                        | src/core/midi/note-event.ts                                          | move                  |                           |
| 2                    | 18    | src/visualizer/property-bindings.ts                 | src/bindings/property-bindings.ts                                    | move                  |                           |
| 2                    | 19    | src/visualizer/macro-manager.ts                     | src/bindings/macro-manager.ts                                        | move                  |                           |
| 2                    | 20    | src/visualizer/image-sequence-generator.ts          | src/export/image-sequence-generator.ts                               | move                  |                           |
| 2                    | 21    | src/visualizer/video-exporter.ts                    | src/export/video-exporter.ts                                         | move                  |                           |
| 3 Scene Elements     | 1     | src/visualizer/scene-elements/index.ts              | src/core/scene/elements/index.ts                                     | move                  |                           |
| 3                    | 2     | src/visualizer/scene-elements/base.ts               | src/core/scene/elements/base.ts                                      | move                  |                           |
| 3                    | 3     | src/visualizer/scene-elements/background.ts         | src/core/scene/elements/background.ts                                | move                  |                           |
| 3                    | 4     | src/visualizer/scene-elements/debug.ts              | src/core/scene/elements/debug.ts                                     | move                  |                           |
| 3                    | 5     | src/visualizer/scene-elements/image.ts              | src/core/scene/elements/image.ts                                     | move                  |                           |
| 3                    | 6     | src/visualizer/scene-elements/progress-display.ts   | src/core/scene/elements/progress-display.ts                          | move                  |                           |
| 3                    | 7     | src/visualizer/scene-elements/text-overlay.ts       | src/core/scene/elements/text-overlay.ts                              | move                  |                           |
| 3                    | 8     | src/visualizer/scene-elements/time-display.ts       | src/core/scene/elements/time-display.ts                              | move                  |                           |
| 3                    | 9     | .../time-unit-piano-roll/time-unit-piano-roll.ts    | src/core/scene/elements/time-unit-piano-roll/time-unit-piano-roll.ts | move                  |                           |
| 3                    | 10    | .../time-unit-piano-roll/animation-controller.ts    | src/core/scene/elements/time-unit-piano-roll/animation-controller.ts | move                  |                           |
| 3                    | 11    | .../time-unit-piano-roll/note-block.ts              | src/core/scene/elements/time-unit-piano-roll/note-block.ts           | move                  |                           |
| 4 Note Animations    | 1     | .../note-animations/base.ts                         | src/animation/note-animations/base.ts                                | move                  |                           |
| 4                    | 2     | (all other note-animations/\*.ts)                   | src/animation/note-animations/                                       | move                  | Maintain relative imports |
| 5 UI Pages & Context | 1     | src/components/about/AboutPage.tsx                  | src/pages/AboutPage.tsx                                              | move                  |                           |
| 5                    | 2     | src/components/animation-test/AnimationTestPage.tsx | src/pages/AnimationTestPage.tsx                                      | move                  |                           |
| 5                    | 3     | src/components/animation-test/animationTest.css     | src/pages/animationTest.css                                          | move                  |                           |
| 5                    | 4     | src/components/context/MacroContext.tsx             | src/context/MacroContext.tsx                                         | move                  |                           |
| 5                    | 5     | src/components/context/SceneContext.tsx             | src/context/SceneContext.tsx                                         | move                  |                           |
| 5                    | 6     | src/components/context/SceneSelectionContext.tsx    | src/context/SceneSelectionContext.tsx                                | move                  |                           |
| 5                    | 7     | src/components/context/VisualizerContext.tsx        | src/context/VisualizerContext.tsx                                    | move                  |                           |
| 5                    | 8     | src/components/hooks/useMenuBar.ts                  | src/hooks/useMenuBar.ts                                              | move                  |                           |
| 6 UI Layout & Panels | 1     | src/components/layout/MidiVisualizer.tsx            | src/ui/layout/MidiVisualizer.tsx                                     | move                  |                           |
| 6                    | 2     | src/components/layout/MenuBar.tsx                   | src/ui/layout/MenuBar.tsx                                            | move                  |                           |
| 6                    | 3     | src/components/layout/PreviewPanel.tsx              | src/ui/layout/PreviewPanel.tsx                                       | move                  |                           |
| 6                    | 4     | src/components/layout/SidePanels.tsx                | src/ui/layout/SidePanels.tsx                                         | move                  |                           |
| 6                    | 5     | src/components/layout/canvasInteractionUtils.ts     | src/ui/layout/canvasInteractionUtils.ts                              | move                  |                           |
| 6                    | 6     | properties-panel/PropertiesPanel.tsx                | src/ui/panels/properties/PropertiesPanel.tsx                         | move                  |                           |
| 6                    | 7     | properties-panel/GlobalPropertiesPanel.tsx          | src/ui/panels/properties/GlobalPropertiesPanel.tsx                   | move                  |                           |
| 6                    | 8     | properties-panel/ElementPropertiesPanel.tsx         | src/ui/panels/properties/ElementPropertiesPanel.tsx                  | move                  |                           |
| 6                    | 9     | properties-panel/MacroConfig.tsx                    | src/ui/panels/properties/MacroConfig.tsx                             | move                  |                           |
| 6                    | 10    | properties-panel/PropertyGroupPanel.tsx             | src/ui/panels/properties/PropertyGroupPanel.tsx                      | move                  |                           |
| 6                    | 11    | properties-panel/index.ts                           | src/ui/panels/properties/index.ts                                    | move                  |                           |
| 6                    | 12    | scene-element-panel/SceneElementPanel.tsx           | src/ui/panels/scene-elements/SceneElementPanel.tsx                   | move                  |                           |
| 6                    | 13    | scene-element-panel/ElementDropdown.tsx             | src/ui/panels/scene-elements/ElementDropdown.tsx                     | move                  |                           |
| 6                    | 14    | scene-element-panel/ElementList.tsx                 | src/ui/panels/scene-elements/ElementList.tsx                         | move                  |                           |
| 6                    | 15    | scene-element-panel/ElementListItem.tsx             | src/ui/panels/scene-elements/ElementListItem.tsx                     | move                  |                           |
| 6                    | 16    | scene-element-panel/index.ts                        | src/ui/panels/scene-elements/index.ts                                | move                  |                           |
| 6                    | 17    | input-rows/BooleanInputRow.tsx                      | src/ui/form/inputs/BooleanInputRow.tsx                               | move                  |                           |
| 6                    | 18    | input-rows/ColorInputRow.tsx                        | src/ui/form/inputs/ColorInputRow.tsx                                 | move                  |                           |
| 6                    | 19    | input-rows/FileInputRow.tsx                         | src/ui/form/inputs/FileInputRow.tsx                                  | move                  |                           |
| 6                    | 20    | input-rows/FontInputRow.tsx                         | src/ui/form/inputs/FontInputRow.tsx                                  | move                  |                           |
| 6                    | 21    | input-rows/NumberInputRow.tsx                       | src/ui/form/inputs/NumberInputRow.tsx                                | move                  |                           |
| 6                    | 22    | input-rows/RangeInputRow.tsx                        | src/ui/form/inputs/RangeInputRow.tsx                                 | move                  |                           |
| 6                    | 23    | input-rows/SelectInputRow.tsx                       | src/ui/form/inputs/SelectInputRow.tsx                                | move                  |                           |
| 6                    | 24    | input-rows/TextInputRow.tsx                         | src/ui/form/inputs/TextInputRow.tsx                                  | move                  |                           |
| 7 Shared & Assets    | 1     | src/utils/font-loader.ts                            | src/shared/services/fonts/font-loader.ts                             | move                  |                           |
| 7                    | 2     | src/utils/google-fonts-list.ts                      | src/shared/services/fonts/google-fonts-list.ts                       | move                  |                           |
| 7                    | 3     | src/logo.svg                                        | src/assets/logo.svg                                                  | move                  |                           |
| 8 App Bootstrap      | 1     | src/App.tsx                                         | src/app/App.tsx                                                      | move                  |                           |
| 8                    | 2     | src/App.css                                         | src/app/App.css                                                      | move                  |                           |
| 8                    | 3     | src/index.tsx                                       | src/app/index.tsx                                                    | move                  |                           |
| 8                    | 4     | src/index.css                                       | src/app/index.css                                                    | move                  |                           |
| 8                    | 5     | src/reportWebVitals.ts                              | src/app/reportWebVitals.ts                                           | move                  |                           |
| 8                    | 6     | src/react-app-env.d.ts                              | src/app/react-app-env.d.ts                                           | move                  |                           |
| 8                    | 7     | src/env.d.ts                                        | src/app/env.d.ts                                                     | move                  |                           |
| 9 Cleanup            | 1     | src/components/types.ts                             | src/shared/types/components.d.ts                                     | move+rename OR delete | Evaluate usage            |
| 9                    | 2     | (empty leftover dirs)                               | (delete)                                                             | delete                | Remove defunct paths      |
| 9                    | 3     | tsconfig paths                                      | tsconfig                                                             | edit                  | Remove legacy fallbacks   |

Validation after each phase: `tsc --noEmit`, `npm test -- --watch=false`, quick manual UI smoke.

Use commit messages: `refactor(structure): <description>`.

This table plus `TARGET_STRUCTURE.md` and `REFACTOR_GUIDE.md` are the authoritative reference during migration.
