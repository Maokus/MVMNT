# Automation Research

**Status:** Research

**Terminology Note:** In this document, _automation_ refers to timeline-driven property changes orchestrated through keyframes. This avoids overloading "animation," which already names the runtime's note-visual effects system.

## Objectives

-   Understand the current animation-related infrastructure inside MVMNT.
-   Identify integration points for a generalized, keyframe-based property automation workflow.
-   Survey established animation workflows in other creative tools to inform UX and technical requirements.

## Current Capabilities in MVMNT

### Note Animation Pipeline

-   The runtime already supports modular note animations for piano roll elements via `BaseNoteAnimation` subclasses (e.g., `ExpandAnimation`, `FadeAnimation`). Each animation receives an `AnimationContext` that includes the ADSR phase, normalized progress, geometry, and color data before returning `RenderObject` instances.【F:src/animation/note-animations/base.ts†L1-L41】【F:src/animation/note-animations/expand.ts†L1-L34】
-   A registry (`registerAnimation` / `createAnimationInstance`) instantiates animations on demand and exposes the available options to UI selectors. Animations auto-register at module load through Vite's `import.meta.glob` usage.【F:src/animation/note-animations/registry.ts†L1-L39】【F:src/animation/note-animations/index.ts†L1-L14】
-   `AnimationController` for the time-unit piano roll derives ADSR-style phases per note by comparing the target playback time with note/window boundaries, then delegates rendering to the animation instance. It caches animation objects, clamps geometry to the window, and falls back to a neutral draw when animation is disabled.【F:src/core/scene/elements/time-unit-piano-roll/animation-controller.ts†L1-L211】
-   The moving-notes piano roll reuses the same animation registry but computes progress relative to a static playhead instead of a sliding window.【F:src/core/scene/elements/moving-notes-piano-roll/animation-controller.ts†L1-L170】

**Implications:** The runtime already consumes normalized `[0,1]` progress inputs and easing functions. An automation system could emit compatible `AnimationContext` data for non-note properties, reusing easing math like `FloatCurve` for interpolation.【F:src/animation/anim-math.ts†L1-L87】

### Property Binding & Macros

-   Scene elements expose configurable properties through schemas (e.g., animation durations and types in the time-unit piano roll) that render inside the properties panel.【F:src/core/scene/elements/time-unit-piano-roll/time-unit-piano-roll.ts†L731-L833】
-   User edits dispatch `SceneCommand`s through the command gateway. The gateway normalizes bindings, supports constant values, macro references, and audio feature bindings, and ensures undo/redo fidelity.【F:src/state/scene/commandGateway.ts†L1-L523】
-   Macros provide reusable values (numbers, colors, booleans, etc.) that multiple properties can bind to, with tooling in the property panel highlighting macro-driven fields.【F:src/state/scene/macros.ts†L1-L31】【F:src/workspace/panels/properties/PropertyGroupPanel.tsx†L320-L392】

**Implications:** A timeline-driven automation system will need to coexist with existing bindings. We may either introduce a new binding type (e.g., `type: 'keyframes'`) or emit macro values procedurally via an automation engine that feeds macro bindings in real time.

### Timing & Playback Foundations

-   The canonical timeline operates in ticks, with seconds derived via `TimingManager`. Playback/export rely on deterministic tick iteration, suggesting keyframe storage should align with ticks (or beats) for consistency.【F:docs/TIME_DOMAIN.md†L1-L120】
-   The scene runtime adapter hydrates element instances and invalidates caches when bindings change, so any animation state must integrate with store-derived snapshots to remain deterministic.【F:docs/SCENE_STORE.md†L1-L53】

## External Workflow Survey

| Tool                                | Key Concepts                                                                                       | Notes                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adobe After Effects                 | Layer timelines with keyframes on properties, graph editor for easing, precomps for grouping       | Uses per-layer timelines in seconds/frames. Keyframes store value + interpolation (linear, bezier). Expressions allow procedural control. Suggests need for per-property curves and editor UX. |
| Blender (Dope Sheet / Graph Editor) | Keyframes stored per data path, editable via F-curves with interpolation modes and modifiers       | Operates on frame numbers; supports drivers (similar to macros) and curve modifiers. Highlights benefits of curve reuse and layering (e.g., constraints).                                      |
| Figma Smart Animate                 | Auto interpolates between component states, supports easing presets and custom cubic bezier curves | Focus on ease-of-use: timeline is minimal, transitions triggered by variant changes. Could inspire quick animations between saved states or presets.                                           |
| Rive                                | State machines that blend keyframes, allows nested components and listeners                        | Combines keyframed timelines with runtime logic. Demonstrates how triggers/conditions could drive animation sequences beyond linear playback.                                                  |
| CSS Keyframes / Web Animations API  | Declarative keyframes with percent offsets, easing per segment                                     | Maps naturally to normalized `[0,1]` progress; browser handles interpolation. Useful for thinking about normalized curves and property channels.                                               |

**Observations:** Mature tools separate:

-   **Data model:** keyframe channels per property with interpolation metadata.
-   **Playback driver:** timeline scrubbing, expressions/state machines to trigger animations.
-   **Authoring UX:** timeline editors, graph views, presets, copy/paste, easing libraries.

## Potential Integration Approach

1. **Data Model Extension**

    - Add a `keyframes` binding type representing one or more automation channels per property (`[{ timeTick, value, easing, handles? }]`).
    - Store channels in the scene store alongside macros to keep serialization centralized. Each channel references property+element IDs.
    - Expand `FloatCurve` to support arbitrary control-point easing, including cubic Bezier handles, stepped/hold segments, and potentially user-defined tangents for custom interpolation families.

2. **Evaluation Engine**

    - During playback/export, evaluate active automation channels at the current tick. Convert ticks to normalized progress per segment, apply easing (using enhanced `FloatCurve` definitions), and emit the resulting value.
    - Expose evaluated outputs as either transient macro values (feeding existing bindings) or direct overrides inside the runtime adapter before render.
    - Cache compiled curves per element for performance; invalidate when keyframes or timing settings change.

3. **Authoring Surface**

    - Introduce a refreshed timeline panel that lists automatable properties. Use the tick-based transport as the horizontal axis for consistency with other time-based tools in MVMNT.
    - Provide presets/easing pickers inspired by After Effects and Figma for quick results, while also exposing a graph view for direct control-point manipulation.
    - Support copy/paste and alignment aids (snapping to beats/bars leveraging the tick timeline).

4. **Interoperability**
    - Allow keyframe channels to modulate macro values so existing macro-driven workflows benefit (e.g., animate a macro once, reuse across elements).
    - Ensure export determinism by evaluating channels deterministically per frame/tick, similar to current note animation controllers.
    - Consider bridging with audio feature bindings (e.g., combine audio-reactive modulation with keyframes via layering or blending).

## Automation Binding Model

### Binding Semantics

-   **Binding Types:** Extend the existing binding discriminated union with `type: 'keyframes'` (a.k.a. automation) while preserving `constant`, `macro`, and `audioFeature` options. The automation binding would reference a channel registry entry rather than inlining frames on every property instance to avoid redundant data.
-   **Channel Ownership:** Anchor channels at the scene root under a new automation registry, keyed by `{elementId}.{propertyPath}`. This enables reuse across multiple properties by pointing bindings to shared channel IDs and simplifies dependency analysis when properties are duplicated or instanced.
-   **Blending Rules:** Define how automation combines with other bindings. One proposal is: (1) evaluate automation, (2) apply macro overrides (allowing macros to modulate automation outputs multiplicatively or additively), then (3) fall back to constants when no automation exists. Documenting these semantics early avoids regressions when both systems coexist.

### Authoring Flows

-   **Channel Creation:** Adding a keyframe on a property should implicitly create the automation binding and channel if absent. Conversely, removing the last keyframe should prompt to revert to the prior binding type to keep the store minimal.
-   **Copy/Reuse:** Provide UI affordances to duplicate channels across elements or promote them to macros for global reuse, similar to how After Effects allows copying animation curves between layers.
-   **Serialization Hooks:** Ensure scene export/import flows snapshot automation channels with stable IDs, keeping compatibility with existing scenes by defaulting missing channels to static values.【F:docs/SCENE_STORE.md†L1-L53】

## FloatCurve Expansion Plan

-   **Representation:** Transition `FloatCurve` from simple easing enums to a piecewise representation: each segment references two keyframes plus optional handle data (`{ in: [x,y], out: [x,y] }`). For stepped/hold behavior, allow zero-duration tangents or explicit `mode: 'hold'` markers.
-   **Editing:** Build utilities for converting cubic Bezier control points into the normalized evaluator currently used for animations. Investigate whether we can adopt the same Hermite spline math as Blender's F-curves for consistent tangent behavior.
-   **Sampling:** Support both forward evaluation (given progress, find value) and inverse operations (given value, approximate time) to enable features like "jump to automation value" or snapping keyframes to a target output.
-   **Presets:** Maintain existing easing presets by mapping them to canonical handle positions (e.g., `easeInOut` translates to cubic handles). Provide a library so users can save custom curves and reapply them across channels.

## Timeline Rework Considerations

-   **Single Source of Time:** Align the timeline panel, transport controls, and playback engine around the same tick/beat abstraction to avoid current desync bugs. Any scrubbing or loop ranges in the timeline should update the global transport state to keep note rendering and automation evaluation in lockstep.
-   **Track Architecture:** Instead of the current monolithic timeline, introduce discrete tracks per automatable target (e.g., element property, macro, audio feature). Allow collapsing/expanding tracks, grouping them under elements, and filtering by property type to keep large scenes manageable.
-   **Keyframe Editing UX:** Adopt a combined dope-sheet + curve view. The dope sheet supports quick positioning/duplication, while an optional curve editor pane exposes precise easing control. Provide keyboard shortcuts for nudging keyframes by musical subdivisions (e.g., bar, beat, tick) to leverage MVMNT's music-first workflow.
-   **Snapping & Quantization:** Integrate beat grid snapping with configurable strength (hard snap vs. magnetic). Offer quantize commands that can batch-align selected keyframes to chosen subdivisions, helping users maintain musical timing.
-   **State Management:** Refactor timeline state to rely on the scene store as the source of truth, minimizing local React state that can drift out of sync. Utilize memoized selectors for visible time ranges and virtualization to keep performance reasonable with dense automation data.
-   **Bug Surface Reduction:** Audit existing timeline bugs (e.g., selection persistence, scroll jitter). Consolidate event handling so pointer events centralize in a canvas-like layer rather than many nested divs; this should reduce lost drag events and improve hit testing for tightly packed keyframes.
-   **Extensibility:** Design track metadata to accommodate future automation types (e.g., boolean toggles, color ramps). Even if v1 focuses on scalar floats, ensuring the UI can switch editors based on value type avoids redesign later.

## Engineering Considerations

-   **Store Size & Performance:** Large keyframe datasets must remain efficient. Consider sparse storage (array of keyframes) with memoized curve compilation.
-   **Undo/Redo:** Extend `SceneCommand` handling to cover keyframe creation, move, delete, easing changes. Maintain ergonomic merge semantics for drag edits.【F:src/state/scene/commandGateway.ts†L205-L523】
-   **Serialization:** Update scene import/export to include keyframe channels while preserving backwards compatibility (default to static values when absent).【F:docs/SCENE_STORE.md†L1-L53】
-   **Playback Loop:** The visualizer render loop already schedules via `requestAnimationFrame`; ensure evaluating additional channels does not regress frame times. Consider precomputing curves or evaluating only on change.【F:src/context/visualizer/useRenderLoop.ts†L1-L184】
-   **Testing:** Add unit tests for curve interpolation and integration tests verifying deterministic exports when keyframes are present.

## Open Questions

-   How should automation priority resolve against manual property overrides and macro bindings? (e.g., last-write wins, blend, or layering system?)
-   Do we need multi-parameter rigs (position X/Y) with linked handles to support path-based motion, or is scalar-only acceptable initially?
-   What guardrails are required so power users can expose cubic handles without overwhelming newcomers (e.g., preset libraries, simplified editors)?
-   Which timeline bugs are most painful today, and can we address them opportunistically during the rework (e.g., selection loss, scroll jumps)?
-   Can audio-reactive features blend with automation via modifiers (additive/multiplicative) without large performance cost?

## Open Question Answers

-   Manual property overrides (like by changing the value of the property through the properties panel or the gui) should create a new keyframe with that value at the time.
-   For now, we do not need multi parameter rigs.
-   Not sure, do more research into this and propose a ux flow that works for both newcomers and experienced users.
-   The timeline is in general quite laggy, and doesn't seem well positioned to adapt to these new changes. Consider the needs presented by this new automation feature and propose changes to the timeline accordingly.
-   They shouldn't cause too much of a problem, and anyways let's work on getting a prototype out first. We can concern ourselves with performance later.

## Next Steps

-   Prototype a store schema for automation channels and update the command gateway to mutate them safely.
-   Build a minimal evaluator that drives one property (e.g., opacity) from automation to validate playback/export integration.
-   Design timeline UI mocks referencing UX inspirations noted above; gather feedback before full implementation.
-   Audit export pipeline for additional requirements (e.g., caching evaluated frames, CLI render integration).
