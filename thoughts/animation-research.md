# Keyframe Animation Research

**Status:** Research

## Objectives
- Understand the current animation-related infrastructure inside MVMNT.
- Identify integration points for a generalized, keyframe-based property animation workflow.
- Survey established animation workflows in other creative tools to inform UX and technical requirements.

## Current Capabilities in MVMNT

### Note Animation Pipeline
- The runtime already supports modular note animations for piano roll elements via `BaseNoteAnimation` subclasses (e.g., `ExpandAnimation`, `FadeAnimation`). Each animation receives an `AnimationContext` that includes the ADSR phase, normalized progress, geometry, and color data before returning `RenderObject` instances.【F:src/animation/note-animations/base.ts†L1-L41】【F:src/animation/note-animations/expand.ts†L1-L34】
- A registry (`registerAnimation` / `createAnimationInstance`) instantiates animations on demand and exposes the available options to UI selectors. Animations auto-register at module load through Vite's `import.meta.glob` usage.【F:src/animation/note-animations/registry.ts†L1-L39】【F:src/animation/note-animations/index.ts†L1-L14】
- `AnimationController` for the time-unit piano roll derives ADSR-style phases per note by comparing the target playback time with note/window boundaries, then delegates rendering to the animation instance. It caches animation objects, clamps geometry to the window, and falls back to a neutral draw when animation is disabled.【F:src/core/scene/elements/time-unit-piano-roll/animation-controller.ts†L1-L211】
- The moving-notes piano roll reuses the same animation registry but computes progress relative to a static playhead instead of a sliding window.【F:src/core/scene/elements/moving-notes-piano-roll/animation-controller.ts†L1-L170】

**Implications:** The runtime already consumes normalized `[0,1]` progress inputs and easing functions. A keyframe system could emit compatible `AnimationContext` data for non-note properties, reusing easing math like `FloatCurve` for interpolation.【F:src/animation/anim-math.ts†L1-L87】

### Property Binding & Macros
- Scene elements expose configurable properties through schemas (e.g., animation durations and types in the time-unit piano roll) that render inside the properties panel.【F:src/core/scene/elements/time-unit-piano-roll/time-unit-piano-roll.ts†L731-L833】
- User edits dispatch `SceneCommand`s through the command gateway. The gateway normalizes bindings, supports constant values, macro references, and audio feature bindings, and ensures undo/redo fidelity.【F:src/state/scene/commandGateway.ts†L1-L523】
- Macros provide reusable values (numbers, colors, booleans, etc.) that multiple properties can bind to, with tooling in the property panel highlighting macro-driven fields.【F:src/state/scene/macros.ts†L1-L31】【F:src/workspace/panels/properties/PropertyGroupPanel.tsx†L320-L392】

**Implications:** A timeline-driven animation system will need to coexist with existing bindings. We may either introduce a new binding type (e.g., `type: 'keyframes'`) or emit macro values procedurally via an animation engine that feeds macro bindings in real time.

### Timing & Playback Foundations
- The canonical timeline operates in ticks, with seconds derived via `TimingManager`. Playback/export rely on deterministic tick iteration, suggesting keyframe storage should align with ticks (or beats) for consistency.【F:docs/TIME_DOMAIN.md†L1-L120】
- The scene runtime adapter hydrates element instances and invalidates caches when bindings change, so any animation state must integrate with store-derived snapshots to remain deterministic.【F:docs/SCENE_STORE.md†L1-L53】

## External Workflow Survey

| Tool | Key Concepts | Notes |
| --- | --- | --- |
| Adobe After Effects | Layer timelines with keyframes on properties, graph editor for easing, precomps for grouping | Uses per-layer timelines in seconds/frames. Keyframes store value + interpolation (linear, bezier). Expressions allow procedural control. Suggests need for per-property curves and editor UX. |
| Blender (Dope Sheet / Graph Editor) | Keyframes stored per data path, editable via F-curves with interpolation modes and modifiers | Operates on frame numbers; supports drivers (similar to macros) and curve modifiers. Highlights benefits of curve reuse and layering (e.g., constraints). |
| Figma Smart Animate | Auto interpolates between component states, supports easing presets and custom cubic bezier curves | Focus on ease-of-use: timeline is minimal, transitions triggered by variant changes. Could inspire quick animations between saved states or presets. |
| Rive | State machines that blend keyframes, allows nested components and listeners | Combines keyframed timelines with runtime logic. Demonstrates how triggers/conditions could drive animation sequences beyond linear playback. |
| CSS Keyframes / Web Animations API | Declarative keyframes with percent offsets, easing per segment | Maps naturally to normalized `[0,1]` progress; browser handles interpolation. Useful for thinking about normalized curves and property channels. |

**Observations:** Mature tools separate:
- **Data model:** keyframe channels per property with interpolation metadata.
- **Playback driver:** timeline scrubbing, expressions/state machines to trigger animations.
- **Authoring UX:** timeline editors, graph views, presets, copy/paste, easing libraries.

## Potential Integration Approach

1. **Data Model Extension**
   - Add a `keyframes` binding type representing one or more channels per property (`[{ timeTick, value, easing }]`).
   - Store channels in the scene store alongside macros to keep serialization centralized. Each channel references property+element IDs.
   - Reuse `FloatCurve` or expand it to support arbitrary control-point easing (Bezier, steps, hold).

2. **Evaluation Engine**
   - During playback/export, evaluate active keyframe channels at the current tick. Convert ticks to normalized progress per segment, apply easing, and emit the resulting value.
   - Expose evaluated outputs as either transient macro values (feeding existing bindings) or direct overrides inside the runtime adapter before render.
   - Cache compiled curves per element for performance; invalidate when keyframes or timing settings change.

3. **Authoring Surface**
   - Introduce a timeline panel that lists animatable properties. Use the tick-based transport as the horizontal axis for consistency with other time-based tools in MVMNT.
   - Provide presets/easing pickers inspired by After Effects and Figma for quick results.
   - Support copy/paste and alignment aids (snapping to beats/bars leveraging the tick timeline).

4. **Interoperability**
   - Allow keyframe channels to modulate macro values so existing macro-driven workflows benefit (e.g., animate a macro once, reuse across elements).
   - Ensure export determinism by evaluating channels deterministically per frame/tick, similar to current note animation controllers.
   - Consider bridging with audio feature bindings (e.g., combine audio-reactive modulation with keyframes via layering or blending).

## Engineering Considerations
- **Store Size & Performance:** Large keyframe datasets must remain efficient. Consider sparse storage (array of keyframes) with memoized curve compilation.
- **Undo/Redo:** Extend `SceneCommand` handling to cover keyframe creation, move, delete, easing changes. Maintain ergonomic merge semantics for drag edits.【F:src/state/scene/commandGateway.ts†L205-L523】
- **Serialization:** Update scene import/export to include keyframe channels while preserving backwards compatibility (default to static values when absent).【F:docs/SCENE_STORE.md†L1-L53】
- **Playback Loop:** The visualizer render loop already schedules via `requestAnimationFrame`; ensure evaluating additional channels does not regress frame times. Consider precomputing curves or evaluating only on change.【F:src/context/visualizer/useRenderLoop.ts†L1-L184】
- **Testing:** Add unit tests for curve interpolation and integration tests verifying deterministic exports when keyframes are present.

## Open Questions
- How should keyframe priority resolve against manual property overrides and macro bindings? (e.g., last-write wins, blend, or layering system?)
- Do we need multi-parameter rigs (position X/Y) with linked handles to support path-based animation, or is scalar-only acceptable initially?
- Should easing support custom curves beyond what `FloatCurve` offers (e.g., Bezier handles, hold/step modes)?
- What UX is required to balance simplicity (Figma-style) with power (After Effects graph editor)?
- Can audio-reactive features blend with keyframes via modifiers (additive/multiplicative) without large performance cost?

## Next Steps
- Prototype a store schema for keyframe channels and update the command gateway to mutate them safely.
- Build a minimal evaluator that drives one property (e.g., opacity) from keyframes to validate playback/export integration.
- Design timeline UI mocks referencing UX inspirations noted above; gather feedback before full implementation.
- Audit export pipeline for additional requirements (e.g., caching evaluated frames, CLI render integration).

