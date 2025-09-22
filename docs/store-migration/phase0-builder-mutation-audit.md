# Phase 0 Builder Mutation Audit

Goal: catalogue every live entry point that mutates `HybridSceneBuilder` so the migration can either route those calls through the new command/store layer or provide shims. Scope includes runtime, UI, persistence, and template helpers (tests excluded unless they rely on production-only hooks).

## Summary

- Mutations are concentrated in five production surfaces: the visualizer core façade, scene selection context, menu/template flows, persistence gateway, and template utilities.
- All UI mutations ultimately flow through objects hanging off `window.vis` → `MIDIVisualizerCore.sceneBuilder`, which exposes the full builder API (including `elements` and `elementRegistry`).
- Undo instrumentation currently wraps only a subset of methods (`addElement`, `removeElement`, `updateElementConfig`, `moveElement`, `duplicateElement`, `clearElements`, `loadScene`, `updateSceneSettings`), leaving ID updates and scene-setting resets without automatic snapshot coverage.
- Template helpers (`createDefaultMIDIScene`, `createAllElementsDebugScene`, etc.) construct scenes imperatively and are invoked from both workspace bootstrapping and fallback menu actions; they require either command wrappers or dedicated store factories.

| Surface | File | Mutating APIs | Notes / Owner |
| --- | --- | --- | --- |
| Visualizer runtime façade | `src/core/visualizer-core.ts` | `addElementFromRegistry`, `removeElement`, `updateElementConfig`, `getElementConfig`, `moveElement`, `duplicateElement`, `clearElements` (via constructor template), `updateSceneSettings`, `resetSceneSettings` | Central imperative gateway used by UI + persistence via `window.vis`. Owner: Core runtime team. |
| Scene selection context | `src/context/SceneSelectionContext.tsx` | `updateElementConfig`, `addElement`, `duplicateElement`, `removeElement`, `updateElementId`, `moveElement`, direct reads of `sceneBuilder.elements` and `sceneBuilder.sceneElementRegistry` | High-traffic React context powering property panel, layer list, and duplication flows. Owner: Workspace UI. |
| Menu bar actions | `src/context/useMenuBar.ts` | `clearElements`, `resetSceneSettings`, `getSceneSettings` | Triggered by user actions (clear/export/import/new). Also clears macros directly. Owner: Workspace shell. |
| Workspace template loader | `src/workspace/layout/MidiVisualizer.tsx` | `clearElements`, `resetSceneSettings`, template functions (`createDefaultMIDIScene`, `createAllElementsDebugScene`, `createDebugScene`) | Handles deep-link imports and template presets; bypasses undo instrumentation today. Owner: Workspace shell. |
| Persistence gateway | `src/persistence/document-gateway.ts` | `serializeScene`, `clearElements`, `loadScene`, `addElementFromRegistry`, `updateSceneSettings` (implicitly through `loadScene`) | Source of truth for export/import, undo snapshots, and CLI flows; critical for parity validation. Owner: Persistence. |
| Scene templates | `src/core/scene-templates.ts` | `clearElements`, `addElementFromRegistry`, direct element configuration (binding setters) | Utility layer invoked by boot, menu fallbacks, and tests. Needs command-based equivalents or migration plan. Owner: Core runtime. |
| Undo instrumentation | `src/state/undo/snapshot-undo.ts` | Wraps `addElement`, `removeElement`, `updateElementConfig`, `moveElement`, `duplicateElement`, `clearElements`, `loadScene`, `updateSceneSettings` | Missing coverage for `updateElementId`, template resets, and raw registry writes; flag for extension during Phase 2. Owner: State/Undo infra. |

### Additional Observations

- Several components reach into `sceneBuilder.elements` directly (e.g., `SceneSelectionContext`, `VisualizerCore`). Once the store is authoritative these reads need memoized selectors to avoid array copies every render.
- Macro operations piggyback on builder mutation flows but also mutate `globalMacroManager` directly from UI (e.g., menu clear). Store migration must orchestrate dual writes between scene slice and macro manager until macro state is normalized.
- Tests and ad-hoc tooling rely on `window.vis` to obtain the builder; we should provide a store-aware dev helper or maintain a compatibility shim with deprecation logging during dual-write.

## Action Items for Later Phases

1. Introduce command-layer wrappers for every API above and update UI contexts (`SceneSelectionContext`, `useMenuBar`, `MidiVisualizer`) to dispatch commands instead of reaching into the builder.
2. Extend undo instrumentation to cover `updateElementId`, template resets, and any new command equivalents; ensure snapshot middleware integration stays deterministic under store control.
3. Provide store-first replacements for template helpers (`createDefaultMIDIScene`, etc.), ideally pure data factories consumed by both persistence and runtime boot.
4. Document `window.vis` deprecation path and create a migration guide for integrations/tests needing scene data (leveraging the new `snapshotBuilder` helper where possible).
