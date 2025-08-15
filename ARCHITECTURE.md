## Architecture Overview

This document summarizes the current (Phase 1) architecture of the MIDI Social Visualizer after the initial cleanup pass.

### High-Level Layers

1. Core Engine (`src/visualizer/` – to be renamed `core/` in a later phase)
    - MIDI parsing & management
    - Scene elements (stateful, user‑configurable entities)
    - Render objects (stateless draw primitives) built each frame from scene elements
    - Animation & timing helpers
    - Property & macro binding system
    - Export (image sequence / video frame generation)
2. React Application (`src/components/` + root app files)
    - UI panels (element list, properties, preview, export progress)
    - Context providers (macro, scene, selection, visualizer instance)
    - Form/input components for editing element + macro configs

### Core Runtime Flow

```
MIDI File → MIDIParser → MIDI Events / NoteEvents
        ↓
Macros (midiFile, tempo, beatsPerBar, animationType ...)  ← user edits
        ↓ (binding system resolves values per frame)
Scene Elements (e.g. TimeUnitPianoRollElement, TextOverlayElement, BackgroundElement ...)
        ↓ buildRenderObjects(config, time)
Render Objects (primitives: rectangle, line, text, image, poly, etc.)
        ↓
ModularRenderer.render(ctx, renderObjects, config, time)
        ↓ (optional frame capture)
Export (VideoExporter / ImageSequenceGenerator)
```

### Key Concepts

| Concept              | Responsibility                                                                         | Notes                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| SceneElement         | Holds configuration, transforms, bindings; produces render objects each frame          | Stateful; includes visibility / zIndex / anchor / scaling    |
| RenderObject         | Pure drawing instruction with `render(ctx, config, time)`                              | Should be stateless & deterministic for reproducible exports |
| HybridSceneBuilder   | Owns list of elements + scene settings; orchestrates building frame render object list | Also serializes/deserializes scenes                          |
| SceneElementRegistry | Factory + schema metadata for dynamic element creation                                 | Enables UI to list available element types                   |
| MacroManager         | Global macro definitions + values                                                      | PropertyBinding instances reference macro IDs                |
| Property Bindings    | Indirection layer mapping element properties to constants/macros                       | Future: additional binding types (expressions, curves)       |
| Timing Manager       | (Early abstraction) supplies frame pacing & time mapping                               | Integrated into scene settings; may be specialized later     |
| ModularRenderer      | Stateless renderer iterating render objects                                            | Handles background clearing fallback                         |

### Current Boundaries (Phase 1)

-   UI imports only the public surface from `visualizer/index.ts` (facade). Internals are still accessible but should be treated as private.
-   Mixed `.ts` / converted engine files now all TypeScript (minimal `any` still present to avoid blocking migration).
-   Scene settings (fps / width / height / prePadding / postPadding) are centralized in `HybridSceneBuilder`.

### Data / State Ownership

| State                             | Owner                                  | Access Path                                                           |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Element configuration             | SceneElement subclasses                | UI → SceneBuilder.updateElementConfig                                 |
| Scene settings                    | HybridSceneBuilder                     | UI → visualizerCore.updateExportSettings (delegates) / getSceneConfig |
| Macro values                      | MacroManager (singleton)               | UI contexts → globalMacroManager                                      |
| Playback (isPlaying, currentTime) | MIDIVisualizerCore                     | UI controls                                                           |
| Selection / Interaction           | MIDIVisualizerCore (interaction state) | UI dispatches via helper methods                                      |

### Extending the System

1. Add a new Scene Element

    - Create subclass of `SceneElement` in `scene-elements/`.
    - Implement static `getConfigSchema()` returning JSON schema–like metadata (name, description, properties & defaults).
    - Implement `buildRenderObjects(config, time)` returning an array of RenderObjects (first object may serve as a logical container with bounds helpers).
    - Register in `scene-element-registry.ts` via `registerElement`.

2. Add a new Note Animation (TimeUnit Piano Roll)

    - Implement animation strategy in `scene-elements/time-unit-piano-roll/note-animations/`.
    - Export via that folder's `index.ts` registry.
    - Ensure it provides a selectable option (factory/registry already pulls options for the macro).

3. Add a new Macro

    - Use `globalMacroManager.createMacro(id, type, defaultValue, options)`.
    - Bind properties: `element.bindToMacro(propertyName, macroId)`.

4. Add a new Render Primitive
    - Implement in `render-objects/` with a `render(ctx, config, time)` method.
    - Reference it inside a SceneElement's `buildRenderObjects` method.

### Determinism for Export

For reproducible exports (frame-perfect repeats):

-   RenderObjects must be pure given (`config`, `time`) & element config snapshot.
-   Avoid reading mutable global state or real-time clocks inside `render()`.
-   Time progression for exports should step with fixed frame increments (HybridSceneBuilder + export utilities enforce this).

### Known Technical Debt / Next Phases

| Item                                           | Issue                                                | Planned Phase                                          |
| ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Mixed responsibilities in `MIDIVisualizerCore` | Playback + interaction + rendering dispatch combined | Phase 2/3 split (PlaybackController, InteractionLayer) |
| Registry pattern ad hoc                        | Only scene elements + note animations                | Phase 2 generic `Registry<T>` utility                  |
| Scattered math utilities                       | Naming & grouping unclear                            | Phase 2 folder reshuffle (`math/` subdomains)          |
| Form input duplication                         | Many `*InputRow` components                          | Phase 3 schema-driven property editor                  |
| Incomplete typings                             | Heavily `any` in converted engine files              | Incremental refinement (ongoing)                       |

### Import & Path Conventions (Interim)

No absolute path aliases added yet; future plan: introduce `@core/*` for engine layer. For now, keep relative imports stable through migration.

### Glossary

| Term          | Definition                                                                             |
| ------------- | -------------------------------------------------------------------------------------- |
| Scene         | Collection of scene elements + settings producing frames over a timeline               |
| Scene Element | Stateful entity responsible for generating one or more render objects per frame        |
| Render Object | Stateless drawing instruction (encapsulates style + geometry + a render method)        |
| Macro         | User-configurable parameter (file, number, select, etc.) broadcast to bound properties |
| Binding       | Link from an element property to a macro (or constant) resolved per frame              |

---

This document will evolve in Phase 2 once the folder reshuffle and generic registries are introduced.
