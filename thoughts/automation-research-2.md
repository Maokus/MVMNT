# Automation Implementation Plan

**Status:** Planning

**Purpose:** Translate prior automation research into an implementable plan that addresses open questions, outlines responsible subsystems, and prepares the timeline overhaul for keyframe authoring.

## Guiding Principles

- Preserve determinism by storing automation data in the scene store and evaluating it from tick-aligned playback.
- Treat automation as an extension of existing binding semantics so current scenes remain valid.
- Deliver UX that scales from rapid keyframe drops to advanced curve editing without overwhelming newcomers.

## Architecture Outline

1. **Automation Binding Model**
    - Extend the binding union with `type: 'keyframes'` that references automation channels keyed by `{elementId}.{propertyPath}`.
    - Store channels in a central registry under the scene root; each channel contains ordered keyframes `{ tick, value, easing, handles? }`.
    - When users adjust a property during playback, create (or update) the keyframe at the transport tick, honoring the decision that manual overrides author new automation data.

2. **Curve & Easing Infrastructure**
    - Upgrade `FloatCurve` to a piecewise evaluator supporting linear, stepped, and cubic-handle interpolation.
    - Maintain a preset library (ease-in/out, etc.) and expose custom curves through reusable definitions that can be attached across channels.
    - Cache compiled curve segments per channel and invalidate only on keyframe/easing changes to avoid render-loop regressions.

3. **Evaluation Engine**
    - During playback/export, resolve automation channels at the active tick, convert to normalized segment progress, and apply the upgraded curve evaluator.
    - Surface evaluated values as transient macro-like outputs that the runtime adapter consumes before render.
    - Define precedence: automation result → macro modifier (additive/multiplicative) → constant fallback, ensuring predictable layering between systems.

4. **Timeline & Authoring Surface**
    - Rebuild the timeline panel around tick-based transport with per-property tracks grouped by element or macro.
    - Provide a dope-sheet view for quick keyframe placement plus an optional curve editor pane for precise easing control.
    - Implement beat-aligned snapping, magnetic guides, and keyboard nudging by musical subdivisions to improve accuracy.
    - Support copy/paste of channels and promotion to shared automation entries for reuse across elements.

## UX Considerations

- Offer a dual-mode easing picker: presets for newcomers, advanced handle editing for experts, satisfying the directive to accommodate both audiences.
- Defer multi-parameter rigs; focus on scalar channels while leaving track metadata extensible for future vector/color automation.
- Address current timeline lag by consolidating pointer handling, virtualizing long track lists, and reducing React local state in favor of memoized selectors.

## Interoperability & Persistence

- Integrate automation commands into the existing `SceneCommand` flow with undo-friendly batching for drag edits.
- Update import/export to serialize automation registries while defaulting missing channels to constants for backwards compatibility.
- Allow automation outputs to feed existing macros so legacy bindings benefit without duplication.

## Potential Developer Confusions & Mitigations

- **Binding Priority:** Developers may be unsure how automation, macros, and constants interact. → Document precedence in the binding union and add helper utilities/tests that mirror runtime layering.
- **Channel Identification:** Shared channel IDs could be mistaken for per-property data. → Provide factory functions that generate IDs and enforce registration through typed helpers.
- **Curve Editing Math:** Translating cubic handles into evaluators may be opaque. → Supply reference diagrams and unit tests that map handle positions to easing outcomes.
- **Timeline State Source:** Mixing local component state with store-derived data risks drift. → Centralize selectors/hooks and discourage ad-hoc state via lint rules or reviewer checklists.

## Plan Issues & Mitigations

- **Performance Risk:** Evaluating many channels per frame could regress render times. → Cache compiled segments and schedule evaluations only on tick advancement; profile with synthetic stress scenes early.
- **Serialization Bloat:** Storing handles and presets inline might inflate scene files. → Deduplicate presets via IDs and compress contiguous linear segments during save.
- **Undo Complexity:** Frequent keyframe edits can spam the history stack. → Merge sequential edits within a debounce window and expose grouped commands for drag operations.
- **Timeline Rebuild Scope:** Replacing the panel may overrun estimates. → Phase delivery: foundational track architecture first, curve editor second, advanced snapping third, with internal milestones for validation.

## Next Steps

1. Prototype the automation registry schema and associated `SceneCommand` mutations.
2. Implement the upgraded curve evaluator with preset mapping and caching.
3. Build a minimal timeline track rendering pipeline to validate performance improvements.
4. Ship an initial property automation (e.g., opacity) to confirm evaluation, undo, and export flows before expanding coverage.

## Follow-Up Questions

- Gather product feedback on easing presets vs. custom curves to refine default UX.
- Audit existing timeline bugs to prioritize which fixes ship with the rebuild vs. later phases.
- Monitor early adopter scenes to quantify performance headroom and guide future optimization work.
