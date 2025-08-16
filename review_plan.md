Collecting a full list of files under src to ground the structural review. Taking the current src layout, here’s a focused structural review with improvement proposals and likely newcomer pain points.

## High‑level observations

-   Naming layers (`scene-elements`, `render-objects`, `property-*`, `macro-*`) not explicitly mapped; mental model isn’t codified.
-   Tests sparse and scattered (`math/`, `utils/`) without a consistent pattern.
-   Multiple index.html/public/build artifacts suggest legacy / redundancy.

## Likely newcomer confusion

1. Difference between `scene-elements` vs `render-objects` vs `scene-builder` vs `scene-element-registry`.
2. Where to add a new visual effect: note animations vs element types vs render objects.
3. Registry & factory patterns (registry.ts, factory.ts) only in some subdomains (note animations) but not consistently elsewhere.
4. Multiple sources of “time” (timing-manager.js, MIDI timing, animation controllers).
5. Role overlap: property-bindings.ts, properties panels in React, and macro / automation logic.
6. Export flow (how video-exporter.ts, image-sequence-generator.ts, rendering loop, and UI trigger connect).
7. Math utilities scattered (mathUtils.ts, geometry.ts, transformHelpers.ts) without a barrel-driven taxonomy (linear algebra? interaction? transforms?).
8. Input rows explosion (`input-rows/*`) implies ad‑hoc component proliferation without shared form abstraction.

Suggestions

1. Unify registries: create a generic `Registry<T>` utility; apply to scene elements, note animations, macros.
2. Extract form input patterns: wrap repetitive `*InputRow` components in a generic `<PropertyField type="color" />` system (schema-driven).
3. Split “engine vs UI” boundaries: expose a stable façade index.ts consumed by React; hide internal folders.
4. Consolidate utils: decide rule—core-specific helpers stay in `core/utils`, UI-only in `ui/utils` (or eliminate root `utils/`).
5. Introduce naming conventions doc: e.g., “Element = high-level scene entity”, “RenderObject = immediate drawable primitive”.
6. Apply consistent barrel exports: each domain folder has an index.ts exporting its public surface; remove deep relative paths.
7. Add dependency direction check (optional): lightweight ESLint import rules to prevent UI importing from internal core submodules (only barrels).
8. Strengthen testing around temporal logic (timing-manager) and animation interpolation (add property-based or snapshot tests).
9. Introduce a simple plug-in guide for adding new note animations (template already exists—document its lifecycle).
10. Improve font subsystem: move fonts logic into `shared/services/fonts` with a small cache + types.

## Naming & layering clarifications

-   SceneElement (composition, stateful) → produces 1..n RenderObjects (stateless draw instructions) per frame.
-   AnimationController / timing manager orchestrates frame progression and schedules property evaluation.
-   Property bindings connect macro/midi-driven values to element properties at evaluation time.
    Document this explicitly.

## Architectural guardrails (add to ESLint / config)

-   No cross-import from `core/**/internal` (mark internal folders with an underscore or `internal/`).
-   UI never imports from subfolders except via `core/index`.
-   Tests can import internals but reside adjacent.

## Quick wins

-   Rename ambiguous mathUtils.ts to something descriptive (e.g., `interpolation.ts` or `numeric.ts`).
-   Add missing type defs for debug/logging (debug-log.js to `.ts`).
-   Centralize animation easing + curve types; export a typed registry.
-   Provide a `createSceneElement` helper to standardize element initialization.

## Potential tech debt flags

-   Export pipeline likely CPU-bound; consider worker boundary (there’s already a worker file in build assets—formalize source).
-   Runtime determinism (needed for video export) depends on pure functions; mark impure modules.

## Onboarding aids

Add a “Start here” section:

1. Load MIDI (midi-manager)
2. Build scene (scene-builder)
3. Register elements (registry)
4. Render loop (visualizer-core + modular-renderer)
5. Export (video-exporter)

## Suggested documentation files to add

-   ARCHITECTURE.md
-   CONTRIBUTING.md (naming, testing, adding elements/animations)
-   PLUGINS.md (how to add new note animation or scene element)
-   INTERNALS_TIMING.md (timing & frame progression contract)

## Risk-managed migration approach

-   Phase 3: Registry unification + form abstraction.
-   Phase 4: Test coverage expansion & lint import boundaries.

## Summary

Root causes of confusion are unclear layering, inconsistent typing, and diffuse naming. Adopt a domain-based folder structure, codify boundaries via barrels + lint rules, convert straggler JS, unify registry patterns, and document lifecycle/terminology. Start with docs + type normalization for fastest clarity gain.

If you want, I can draft the initial ARCHITECTURE.md and tsconfig path aliases next—just say the word.
