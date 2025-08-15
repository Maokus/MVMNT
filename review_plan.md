Collecting a full list of files under src to ground the structural review. Taking the current src layout, here’s a focused structural review with improvement proposals and likely newcomer pain points.

## High‑level observations

-   Two intertwined domains: (1) Core visualization engine (scene graph, MIDI, rendering, animation, export) under `visualizer/`. (2) React application UI under `components/` + root app files.
-   Mixed JS + TS inside `visualizer/` (risk: type gaps, harder refactors).
-   Naming layers (`scene-elements`, `render-objects`, `property-*`, `macro-*`) not explicitly mapped; mental model isn’t codified.
-   Tests sparse and scattered (`math/`, `utils/`) without a consistent pattern.
-   Multiple index.html/public/build artifacts suggest legacy / redundancy.

## Likely newcomer confusion

1. Difference between `scene-elements` vs `render-objects` vs `scene-builder` vs `scene-element-registry`.
2. Where to add a new visual effect: note animations vs element types vs render objects.
3. Mixed `.js` and `.ts`—why some core engine files lack types (visualizer-core.js, scene-builder.js, etc.).
4. Registry & factory patterns (registry.ts, factory.ts) only in some subdomains (note animations) but not consistently elsewhere.
5. Multiple sources of “time” (timing-manager.js, MIDI timing, animation controllers).
6. Role overlap: property-bindings.ts, properties panels in React, and macro / automation logic.
7. Export flow (how video-exporter.ts, image-sequence-generator.ts, rendering loop, and UI trigger connect).
8. Math utilities scattered (mathUtils.ts, geometry.ts, transformHelpers.ts) without a barrel-driven taxonomy (linear algebra? interaction? transforms?).
9. Tests inline with code in some spots, absent elsewhere—unclear expectation.
10. `utils/` in two places (utils and `visualizer/utils`)—ambiguous boundary (UI utility vs engine utility?).
11. Input rows explosion (`input-rows/*`) implies ad‑hoc component proliferation without shared form abstraction.
12. Global fonts logic (font-loader.ts, google-fonts-list.ts) sits at root `utils/` without a “services” or “infrastructure” concept.

## Suggested target structure (incremental path)

Proposed domain-first grouping (rename only when you touch code anyway):
src/
│
├── app/
│ ├── App.tsx
│ ├── index.tsx
│ └── routing/
│
├── pages/ # Route-level React pages
│ ├── AboutPage.tsx
│ └── AnimationTestPage.tsx
│
├── context/ # All React contexts
│
├── hooks/ # UI-only hooks
│
├── providers/ # Wrappers composing contexts
│
├── ui/
│ ├── components/
│ ├── panels/
│ ├── properties/
│ ├── elements/
│ ├── export/
│ └── form/
│ └── inputs/ # Generic input components
│ ├── Color.tsx
│ ├── Number.tsx
│ ├── Range.tsx
│ ├── Select.tsx
│ ├── File.tsx
│ ├── Font.tsx
│ └── Text.tsx
│
├── layout/
│
├── overlays/
│
├── core/ # Core logic (consider renaming current visualizer/)
│ ├── midi/
│ │ ├── midi-parser.ts
│ │ ├── midi-manager.ts
│ │ └── note-event.ts
│ │
│ ├── scene/
│ │ ├── elements/ # Current scene-elements
│ │ └── registry/ # Unify element + animation registries
│ │
│ ├── builder.ts
│ ├── name-generator.ts
│ │
│ ├── render/
│ │ ├── render-objects/
│ │ └── modular-renderer.ts # Convert from .js + typed
│ │
│ ├── visualizer-core.ts
│ └── timing-manager.ts
│
├── animation/
│ ├── note-animations/
│ ├── easings.ts
│ └── animations.ts
│
├── export/
│ ├── video-exporter.ts
│ └── image-sequence-generator.ts
│
├── bindings/
│ ├── property-bindings.ts
│ └── macro-manager.ts
│
├── math/
│ ├── geometry.ts
│ ├── transforms/
│ │ ├── transformHelpers.ts
│ │ └── mouseToTransforms.ts # (+ test)
│
├── interaction.ts
│
├── types.ts # Core-wide shared types
│
├── utils/
│ └── debug-log.ts # Shared pure helpers only
│
├── assets/ # Static font metadata, maybe move google-fonts-list
│
├── shared/
│ ├── types/ # Cross UI-core contracts
│ └── services/ # e.g., font-loader.ts, etc.

Tests:

-   Co-locate as `*.test.ts` or group under `__tests__/` mirrors: pick one and codify in README (recommend co-location).
-   Add contract-level tests for: scene building, timing manager, export pipeline, note animation registration.

## Concrete improvement steps (prioritized)

1. Add ARCHITECTURE.md: diagram data flow (MIDI -> scene elements -> render objects -> animation loop -> export).
2. Normalize types: convert remaining `.js` in `visualizer/` to `.ts` with minimal `any` scaffolding; introduce `// TODO typify` markers.
3. Unify registries: create a generic `Registry<T>` utility; apply to scene elements, note animations, macros.
4. Extract form input patterns: wrap repetitive `*InputRow` components in a generic `<PropertyField type="color" />` system (schema-driven).
5. Split “engine vs UI” boundaries: expose a stable façade index.ts consumed by React; hide internal folders.
6. Consolidate utils: decide rule—core-specific helpers stay in `core/utils`, UI-only in `ui/utils` (or eliminate root `utils/`).
7. Introduce naming conventions doc: e.g., “Element = high-level scene entity”, “RenderObject = immediate drawable primitive”.
8. Apply consistent barrel exports: each domain folder has an index.ts exporting its public surface; remove deep relative paths.
9. Add dependency direction check (optional): lightweight ESLint import rules to prevent UI importing from internal core submodules (only barrels).
10. Strengthen testing around temporal logic (timing-manager) and animation interpolation (add property-based or snapshot tests).
11. Introduce a simple plug-in guide for adding new note animations (template already exists—document its lifecycle).
12. Improve font subsystem: move fonts logic into `shared/services/fonts` with a small cache + types.

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

-   Phase 1: Docs + barrels + JS→TS conversions (no logic changes).
-   Phase 2: Folder reshuffle guarded by path alias (`paths` in tsconfig) to avoid breakages—move then update imports.
-   Phase 3: Registry unification + form abstraction.
-   Phase 4: Test coverage expansion & lint import boundaries.

## Summary

Root causes of confusion are unclear layering, inconsistent typing, and diffuse naming. Adopt a domain-based folder structure, codify boundaries via barrels + lint rules, convert straggler JS, unify registry patterns, and document lifecycle/terminology. Start with docs + type normalization for fastest clarity gain.

If you want, I can draft the initial ARCHITECTURE.md and tsconfig path aliases next—just say the word.
