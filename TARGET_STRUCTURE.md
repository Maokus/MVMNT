# Target Directory Structure (Post-Refactor)

Authoritative, exhaustive final layout after the restructuring. Lists every CURRENT source file re-homed plus new conceptual folders. Notes in parentheses show origin or rename. Only the `src/` tree (and a few root-level supportive docs) is enumerated. Future expansion placeholders are included (empty folders) to clarify intended boundaries.

Legend:
- (from X) = simple move
- [renamed] = filename or extension changed (logic unchanged)
- (NEW) = new placeholder / not yet implemented
- OPTIONAL = choose one location (decide in migration phase)

```text
src/
  app/
    App.tsx                (from App.tsx)
    App.css                (from App.css)
    index.tsx              (from index.tsx)
    index.css              (from index.css)
    reportWebVitals.ts     (from reportWebVitals.ts)
    react-app-env.d.ts     (from react-app-env.d.ts)
    env.d.ts               (from env.d.ts)

  pages/
    AboutPage.tsx          (from components/about/AboutPage.tsx)
    AnimationTestPage.tsx  (from components/animation-test/AnimationTestPage.tsx)
    animationTest.css      (from components/animation-test/animationTest.css)

  context/
    MacroContext.tsx       (from components/context/MacroContext.tsx)
    SceneContext.tsx       (from components/context/SceneContext.tsx)
    SceneSelectionContext.tsx (from components/context/SceneSelectionContext.tsx)
    VisualizerContext.tsx  (from components/context/VisualizerContext.tsx)

  hooks/
    useMenuBar.ts          (from components/hooks/useMenuBar.ts)

  providers/               (NEW placeholder for composed context providers)

  ui/
    layout/
      MidiVisualizer.tsx   (from components/layout/MidiVisualizer.tsx)
      MenuBar.tsx          (from components/layout/MenuBar.tsx)
      PreviewPanel.tsx     (from components/layout/PreviewPanel.tsx)
      SidePanels.tsx       (from components/layout/SidePanels.tsx)
      canvasInteractionUtils.ts (from components/layout/canvasInteractionUtils.ts)

    panels/
      properties/
        PropertiesPanel.tsx        (from components/layout/properties-panel/PropertiesPanel.tsx)
        GlobalPropertiesPanel.tsx  (from components/layout/properties-panel/GlobalPropertiesPanel.tsx)
        ElementPropertiesPanel.tsx (from components/layout/properties-panel/ElementPropertiesPanel.tsx)
        MacroConfig.tsx            (from components/layout/properties-panel/MacroConfig.tsx)
        PropertyGroupPanel.tsx     (from components/layout/properties-panel/PropertyGroupPanel.tsx)
        index.ts                   (from components/layout/properties-panel/index.ts)
      scene-elements/
        SceneElementPanel.tsx      (from components/layout/scene-element-panel/SceneElementPanel.tsx)
        ElementDropdown.tsx        (from components/layout/scene-element-panel/ElementDropdown.tsx)
        ElementList.tsx            (from components/layout/scene-element-panel/ElementList.tsx)
        ElementListItem.tsx        (from components/layout/scene-element-panel/ElementListItem.tsx)
        index.ts                   (from components/layout/scene-element-panel/index.ts)

    form/
      inputs/ (initial direct moves; later generic rename)
        BooleanInputRow.tsx (from components/layout/properties-panel/input-rows/BooleanInputRow.tsx)
        ColorInputRow.tsx   (from components/layout/properties-panel/input-rows/ColorInputRow.tsx)
        FileInputRow.tsx    (from components/layout/properties-panel/input-rows/FileInputRow.tsx)
        FontInputRow.tsx    (from components/layout/properties-panel/input-rows/FontInputRow.tsx)
        NumberInputRow.tsx  (from components/layout/properties-panel/input-rows/NumberInputRow.tsx)
        RangeInputRow.tsx   (from components/layout/properties-panel/input-rows/RangeInputRow.tsx)
        SelectInputRow.tsx  (from components/layout/properties-panel/input-rows/SelectInputRow.tsx)
        TextInputRow.tsx    (from components/layout/properties-panel/input-rows/TextInputRow.tsx)

    components/            (NEW placeholder – shared UI atoms/molecules)
    utils/                 (NEW placeholder – UI-only helpers)

  core/
    index.ts               (from visualizer/index.ts)
    visualizer-core.ts     (from visualizer/visualizer-core.ts)
    timing-manager.ts      (from visualizer/timing-manager.js) [renamed]
    builder.ts             (from visualizer/scene-builder.ts)
    name-generator.ts      (from visualizer/scene-name-generator.js) [renamed]
    types.ts               (from visualizer/types.ts)

    midi/
      midi-parser.ts       (from visualizer/midi-parser.ts)
      midi-manager.ts      (from visualizer/midi-manager.ts)
      note-event.ts        (from visualizer/note-event.ts)

    scene/
      elements/
        background.ts       (from visualizer/scene-elements/background.ts)
        base.ts             (from visualizer/scene-elements/base.ts)
        debug.ts            (from visualizer/scene-elements/debug.ts)
        image.ts            (from visualizer/scene-elements/image.ts)
        index.ts            (from visualizer/scene-elements/index.ts)
        progress-display.ts (from visualizer/scene-elements/progress-display.ts)
        text-overlay.ts     (from visualizer/scene-elements/text-overlay.ts)
        time-display.ts     (from visualizer/scene-elements/time-display.ts)
        time-unit-piano-roll/
          time-unit-piano-roll.ts  (from visualizer/scene-elements/time-unit-piano-roll/time-unit-piano-roll.ts)
          animation-controller.ts  (from visualizer/scene-elements/time-unit-piano-roll/animation-controller.ts)
          note-block.ts            (from visualizer/scene-elements/time-unit-piano-roll/note-block.ts)
      registry/
        scene-element-registry.ts (from visualizer/scene-element-registry.ts)

    render/
      modular-renderer.ts  (from visualizer/modular-renderer.ts)
      render-objects/
        base.ts            (from visualizer/render-objects/base.ts)
        empty.ts           (from visualizer/render-objects/empty.ts)
        image.ts           (from visualizer/render-objects/image.ts)
        index.ts           (from visualizer/render-objects/index.ts)
        line.ts            (from visualizer/render-objects/line.ts)
        poly.ts            (from visualizer/render-objects/poly.ts)
        rectangle.ts       (from visualizer/render-objects/rectangle.ts)
        text.ts            (from visualizer/render-objects/text.ts)

  animation/
    animations.ts          (from visualizer/utils/animations.ts)
    animations.test.ts     (from visualizer/utils/animations.test.ts)
    easings.ts             (from visualizer/utils/easings.ts)
    note-animations/
      base.ts              (from visualizer/scene-elements/time-unit-piano-roll/note-animations/base.ts)
      debug.ts             (from visualizer/scene-elements/time-unit-piano-roll/note-animations/debug.ts)
      expand.ts            (from visualizer/scene-elements/time-unit-piano-roll/note-animations/expand.ts)
      explode.ts           (from visualizer/scene-elements/time-unit-piano-roll/note-animations/explode.ts)
      fade.ts              (from visualizer/scene-elements/time-unit-piano-roll/note-animations/fade.ts)
      factory.ts           (from visualizer/scene-elements/time-unit-piano-roll/note-animations/factory.ts)
      index.ts             (from visualizer/scene-elements/time-unit-piano-roll/note-animations/index.ts)
      press.ts             (from visualizer/scene-elements/time-unit-piano-roll/note-animations/press.ts)
      registry.ts          (from visualizer/scene-elements/time-unit-piano-roll/note-animations/registry.ts)
      scale.ts             (from visualizer/scene-elements/time-unit-piano-roll/note-animations/scale.ts)
      slide.ts             (from visualizer/scene-elements/time-unit-piano-roll/note-animations/slide.ts)
      template.ts          (from visualizer/scene-elements/time-unit-piano-roll/note-animations/template.ts)

  export/
    image-sequence-generator.ts (from visualizer/image-sequence-generator.ts)
    video-exporter.ts           (from visualizer/video-exporter.ts)

  bindings/
    property-bindings.ts   (from visualizer/property-bindings.ts)
    macro-manager.ts       (from visualizer/macro-manager.ts)

  math/
    geometry.ts            (from visualizer/math/geometry.ts)
    interaction.ts         (from visualizer/math/interaction.ts)
    numeric.ts             (from visualizer/math/mathUtils.ts) [renamed]
    types.ts               (from visualizer/math/types.ts)
    transforms/
      transformHelpers.ts  (from visualizer/math/transformHelpers.ts)
      mouseToTransforms.ts (from visualizer/math/mouseToTransforms.ts)
      mouseToTransforms.test.ts (from visualizer/math/mouseToTransforms.test.ts)

  interaction.ts           (OPTIONAL alternative: promote from math/interaction.ts instead of keeping duplicate)

  utils/
    debug-log.ts           (from visualizer/utils/debug-log.js) [renamed]

  shared/
    services/
      fonts/
        font-loader.ts       (from utils/font-loader.ts)
        google-fonts-list.ts (from utils/google-fonts-list.ts)
    types/ (NEW placeholder – cross-layer types)

  assets/
    logo.svg               (from logo.svg)

  tests/                   (OPTIONAL central test folder if adopted later)
  types.ts                 (OPTIONAL aggregator re-export file)

setupTests.ts              (from setupTests.ts)
components/types.ts        (Evaluate: merge into shared/types or delete if redundant)
```

Decision Items (document in PR):
1. Choose placement of `interaction.ts` (root vs keep only under `math/`).
2. Fate of `components/types.ts` (merge or remove).
3. Whether to introduce central `tests/` folder or keep co-located tests.

This tree underpins the move order in `MOVE_MAP.md` and procedures in `REFACTOR_GUIDE.md`.
