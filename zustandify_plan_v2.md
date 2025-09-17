# Plan: Eliminate singletons and migrate React contexts to Zustand slices

Date: 2025-09-17
Target branch: `0.12.1` → feature branch (e.g., `feat/zustandify-v2`)
Status: Draft v2

## Objectives

-   Remove application-wide singletons and replace them with store-managed services or injected instances.
-   Migrate selected React Contexts to colocated Zustand slices to improve legibility, testability, and serialization.
-   Preserve external behavior and public APIs during the transition with thin shims where necessary.
-   Make state observable via selectors (no CustomEvent as a primary mechanism), serializable where appropriate, and debuggable through devtools and time travel.

## Guiding principles

-   Single source of truth: colocate state in store slices; only keep non-serializable service objects in an explicit services slice.
-   Provide an injection pathway: support a Provider-backed store instance in app runtime; allow multiple isolated store instances in tests in the future.
-   Prefer fine-grained selectors and memoization over global events for UI updates.
-   Keep non-serializable runtime objects (e.g., `TimingManager`, `PlaybackClock`, Visualizer instance) in a dedicated, non-persisted slice.
-   Migrate incrementally, using deprecated shims to avoid breaking changes; remove shims once references are gone.

---

## Current inventory (as of 0.12.1)

### Singletons and global event usage

-   Macro manager singleton: `src/bindings/macro-manager.ts`
    -   Exports `globalMacroManager` and class `MacroManager` with listener bus.
-   Shared timing manager: module-level `_tmSingleton = new TimingManager()` inside `src/state/timelineStore.ts`.
    -   Re-exported via `getSharedTimingManager()` / `sharedTimingManager`.
-   Window CustomEvents used as a global bus in various places (`timeline-play-snapped`, `timeline-track-added`, `scene-refresh`, `font-loaded`, render modal events, etc.).
-   Re-exports from `src/core/index.ts` expose macro manager symbols globally.

### React contexts and hooks slated for consolidation

-   `src/context/MacroContext.tsx` – wraps `globalMacroManager` for UI.
-   `src/context/SceneContext.tsx` – scene name and scene menu actions (save/load/clear/new), dispatches `scene-refresh`.
-   `src/context/SceneSelectionContext.tsx` – selection state, element list management, property panel refresh, actions on elements via `SceneBuilder` from Visualizer.
-   `src/context/UndoContext.tsx` – snapshot-based undo controller glued to persistence v1.
-   `src/context/VisualizerContext.tsx` – owns canvas/visualizer instance, playback loop/clock bridging to store, export settings and progress overlay, convenience hooks to timeline store.
-   `src/context/useMenuBar.ts` – hook layered over persistence and `globalMacroManager`.

### Other consumers to refactor

-   Property bindings: `src/bindings/property-bindings.ts` imports `globalMacroManager` to read/update macro values.
-   Persistence: `src/persistence/{export.ts, import.ts, undo/snapshot-undo.ts}` call `globalMacroManager`.
-   Core runtime: `src/core/scene-builder.ts`, `src/core/scene/elements/base.ts` use `globalMacroManager` and macro listeners.
-   UI: `src/ui/panels/properties/MacroConfig.tsx` assumes manager.

---

## Target architecture (Zustand-first)

### Root store and slice composition

-   Introduce a root store that composes slices:

    -   `timelineSlice` – keep existing `timelineStore.ts` logic but remove module-level singletons.
    -   `macroSlice` – as per `macro_manager_to_zustand_v1.md` (macrosById + actions, value validation helpers).
    -   `sceneSlice` – scene name and high-level scene actions (invokes persistence/import/export; see below about side effects).
    -   `selectionSlice` – selected element id, property panel refresh trigger, and element ordering helpers (bridges to `SceneBuilder`).
    -   `undoSlice` (or middleware integration) – snapshot controller binding with enable/disable.
    -   `uiSlice` – UI-only flags and panels (e.g., render modal state), if beneficial.
    -   `servicesSlice` – non-serializable runtime instances and adapters, e.g., `TimingManager`, `PlaybackClock`, and optionally the Visualizer instance. This slice is never persisted.

-   Store creation pattern:
    -   Phase 1: Export a module-level `useRootStore` (alias existing `useTimelineStore` to minimize churn), plus `useRootStoreShallow`.
    -   Phase 2: Introduce `RootStoreProvider` with Zustand’s `Provider` to support multiple stores. All non-React code must accept a store reference (dependency injection) instead of importing a global.

### Services slice

-   Maintain a `services` object in-store containing:
    -   `timingManager: TimingManager`
    -   `playbackClock?: PlaybackClock`
    -   `visualizer?: MIDIVisualizerCore`
    -   Optional gateways: `sceneBuilder?: HybridSceneBuilder`
-   Expose actions to initialize/replace services and to update them in response to changes (e.g., tempo map/BPM updates write through to `TimingManager`).
-   These objects are excluded from serialization/export; they exist for coordination only.

### Eventing model

-   Replace CustomEvents and custom listener buses with store subscriptions/selectors.
-   Keep DOM events for true cross-subsystem notifications that must leave the React/store world (e.g., `font-loaded` dispatched from `fonts/font-loader.ts`).
-   For bridging during migration, dispatch minimal DOM events from actions only where legacy code relies on them (behind a temporary flag).

---

## Migration map by module

### 1) Macro manager → macro slice (Phase 1)

-   Implement `src/state/slices/macroSlice.ts` exporting `createMacroSlice: StateCreator<MacroSlice>` with:
    -   `macrosById: Record<string, Macro>`
    -   Actions: `createMacro`, `deleteMacro`, `updateMacroValue`, `getMacro`, `getAllMacros`, `exportMacros`, `importMacros`, `clearMacros`.
-   Extract `_validateValue` from `macro-manager.ts` to `validateMacroValue(type, value, options)` and reuse in the slice.
-   Integrate into root store (initially extend existing `timelineStore.ts` state to include macro fields/actions to reduce churn).
-   Add a deprecated shim in `src/bindings/macro-manager.ts` that delegates to the slice so external imports do not break immediately. Mark with `@deprecated` and console warn.
-   Update direct consumers gradually:
    -   `src/bindings/property-bindings.ts`: replace `globalMacroManager` with `useTimelineStore.getState().{getMacro, updateMacroValue}`.
    -   `src/context/MacroContext.tsx`: replace with hooks to the slice; or remove in favor of components using `useTimelineStore(selectors)` directly.
    -   Persistence (`export.ts`, `import.ts`, undo snapshot): use slice `exportMacros`/`importMacros`.
    -   Core and UI references (scene-builder, base element, MacroConfig) rewritten to slice. Where imperative listeners were used, subscribe via store or poll until eliminated.

Acceptance for Phase 1 macro:

-   All macro features function via the slice; the shim exists but has zero remaining in-app imports (tests may still reference until updated).

### 2) Shared timing manager singleton → services slice (Phase 1→2)

-   Remove `_tmSingleton` from `timelineStore.ts`. Instead, place a `TimingManager` instance in `servicesSlice` with actions:
    -   `initTimingManager()` – construct if absent; set bpm/map from current state.
    -   `setBPM(bpm)` and `setTempoMap(map)` actions in `timelineSlice` also write through to the `timingManager` instance (if present).
    -   Provide helpers `beatsToTicks`, `ticksToBeats`, `beatsToSeconds`, `secondsToBeats` using the in-slice manager.
-   Update usages:
    -   `VisualizerContext` to read `timingManager` via store instead of `getSharedTimingManager()`.
    -   Rulers/components using comments like “shared singleton timing manager” to instead call selectors that compute conversions through the service.
-   If multiple stores become supported, each store instance has its own `TimingManager`; tests can initialize it per store.

### 3) Scene selection context → selection slice (Phase 2)

-   Create `selectionSlice` with state:
    -   `selectedElementId: string | null`
    -   `selectedElementSchema: any | null`
    -   `propertyPanelRefresh: number`
    -   `elements: any[]` (display-sorted cache)
    -   `error?: string`
-   Actions mirroring existing behavior:
    -   `selectElement`, `clearSelection`
    -   `refreshElements` (reads `sceneBuilder` service)
    -   `updateElementConfig`, `toggleElementVisibility`, `moveElement`, `duplicateElement`, `deleteElement`, `updateElementId`
    -   `incrementRefreshTrigger`, `incrementPropertyPanelRefresh`
-   Implementation detail: actions may read `services.sceneBuilder` (set by `VisualizerContext` or a dedicated scene service init action) to avoid passing the builder around.
-   Replace `SceneSelectionContext` provider/consumer usage with selector hooks; delete context post-migration.

### 4) Scene context and menu bar → scene slice (Phase 2)

-   Create `sceneSlice` with:
    -   `sceneName: string`
    -   Actions: `setSceneName(name)`, `saveScene()`, `loadScene(fileOrText?)`, `clearScene()`, `createNewDefaultScene()`.
-   Extract logic from `useMenuBar.ts` (and `SceneContext.tsx`) into these actions. Keep side effects local (e.g., file I/O prompts), or route through a UI service if you prefer thinner slices.
-   Where legacy code dispatches `scene-refresh`, instead directly update dependent slices and components via selectors. If necessary, keep a temporary DOM dispatch.

### 5) Undo provider → undo middleware/slice (Phase 2)

-   Integrate the snapshot controller with a slice and/or Zustand middleware (`subscribeWithSelector`) to capture state changes and produce undo/redo stacks.
-   Provide actions `undo`, `redo`, `reset`, and selectors `canUndo`, `canRedo` directly from the store.
-   Remove `UndoContext`; consumers use `useRootStore(selectUndoState)`.

### 6) Visualizer context → services + thin context (Phase 2→3)

-   Keep Visualizer’s canvas ref and instance in `servicesSlice` (non-serializable). Maintain the render loop and IO-heavy operations here or in a very thin `VisualizerContext` that only provides the canvas ref and imperative methods.
-   Move export settings and progress overlay to a `ui/exportSlice` so non-visualizer UI can read/write this state without context plumbing.
-   Expose convenience hooks: `useTransport` already derive from the timeline slice; keep this pattern.

### 7) Window events → store subscriptions (Phase 2)

-   Replace `timeline-play-snapped`, `timeline-track-added`, `scene-refresh` where they only serve in-app communication. Instead, the relevant components should subscribe to the slice state that changes.
-   Keep true external signals (e.g., from browser, file loaders, JSZip ready) as DOM events or convert to explicit service actions that fire within the store.

---

## Store structure sketch

```
// src/state/rootStore.ts (new)
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createTimelineSlice } from './slices/timelineSlice' // extracted from timelineStore
import { createMacroSlice } from './slices/macroSlice'
import { createSceneSlice } from './slices/sceneSlice'
import { createSelectionSlice } from './slices/selectionSlice'
import { createServicesSlice } from './slices/servicesSlice'

export type RootState = TimelineSlice & MacroSlice & SceneSlice & SelectionSlice & ServicesSlice

export const useRootStore = create<RootState>()(
  devtools((set, get, api) => ({
    ...createServicesSlice(set, get, api),
    ...createTimelineSlice(set, get, api),
    ...createMacroSlice(set, get, api),
    ...createSceneSlice(set, get, api),
    ...createSelectionSlice(set, get, api),
  }), { name: 'MVMNT' })
)

// Optional Provider pattern for multiple stores later
```

Notes:

-   In Phase 1 you may extend the existing `timelineStore.ts` with the macro and services slices to minimize churn, then split to `rootStore.ts` in Phase 2.

---

## File-by-file action list (initial critical path)

Phase 1 (safe, incremental):

-   Add `src/state/slices/macroSlice.ts` and wire into `timelineStore.ts`.
-   Add temporary shim in `src/bindings/macro-manager.ts` that delegates to the slice and logs deprecation.
-   Replace imports of `globalMacroManager` in the following files with slice calls:
    -   `src/bindings/property-bindings.ts`
    -   `src/context/MacroContext.tsx`
    -   `src/context/useMenuBar.ts`
    -   `src/persistence/export.ts`
    -   `src/persistence/import.ts`
    -   `src/persistence/undo/snapshot-undo.ts`
    -   `src/persistence/__tests__/persistence.scene-elements.test.ts`
    -   `src/persistence/__tests__/undo.scene-move.test.ts`
    -   `src/core/scene-builder.ts`
    -   `src/core/scene/elements/base.ts`
    -   `src/ui/panels/properties/MacroConfig.tsx`
    -   `src/core/index.ts` (remove re-exports)
-   In `timelineStore.ts`, prepare for timing manager extraction by:
    -   Moving helpers that use `_tmSingleton` behind small adapter functions.
    -   Creating a `services` sub-object with `timingManager` and using it in conversions.

Phase 2 (architecture consolidation):

-   Split `timelineStore.ts` into slices and create `rootStore.ts`.
-   Create `servicesSlice` for `TimingManager`, `PlaybackClock`, `Visualizer`.
-   Replace `getSharedTimingManager()` imports with `useRootStore.getState().services.timingManager` or selectors.
-   Create `selectionSlice` and migrate `SceneSelectionContext.tsx` consumers to selectors.
-   Create `sceneSlice` to own scene name and actions. Collapse `useMenuBar.ts` into this slice. Delete `SceneContext.tsx` and update callers.
-   Integrate undo into store (middleware or slice). Remove `UndoContext.tsx`.
-   Move export settings/progress overlay to UI slice; slim down `VisualizerContext.tsx` to a thin provider of `canvasRef` and imperative controls if still desired, or eliminate it in favor of hooks reading from store + a small `VisualizerHost` component.
-   Remove/replace window CustomEvents used for internal coordination.

Phase 3 (cleanup and hardening):

-   Remove deprecated `macro-manager` shim and any remaining imports.
-   Remove comments referencing “singleton” patterns.
-   Ensure persistence export/import captures macro state and timeline state consistently.
-   Optimize selectors with `zustand/shallow` where needed.

---

## Persistence and serialization

-   Persistable slices: `timeline`, `macro`, `scene` (minus non-serializable fields), potentially `selection`.
-   Non-persisted slices: `services`, UI ephemeral like progress overlays.
-   Macro export/import must avoid non-serializable `File` objects – validation already disallows storing `File` in long-term state; store references/ids instead if needed.
-   Scene export/import (v1) should include macros via `macroSlice.exportMacros()` and set via `importMacros()`.

---

## Testing plan

-   Unit tests:
    -   Macro slice: create/update/delete/validate/import/export.
    -   Timing services: BPM and tempo map write-through from timeline actions.
    -   Selection slice: element selection lifecycle with a mocked `sceneBuilder` in services.
    -   Scene slice: save/load/clear/new scene calls (mock persistence and visualizer methods).
-   Integration tests:
    -   Undo/redo stack manipulating timeline and macro state.
    -   Export → Import roundtrip preserves macros and timeline.
-   UI tests (lightweight): verify components re-render via selectors (no event-bus dependency).

---

## Performance and UX considerations

-   Use fine-grained selectors for `macrosById` to avoid re-render storms on frequent macro value updates.
-   Memoize derived arrays (e.g., `Object.values(macrosById)`) or provide `selectMacrosArray` to keep stable references.
-   Keep `services` updates cheap; avoid recreating instances unless necessary.
-   Ensure playback clock sync semantics remain identical when moving off the `_tmSingleton`.

---

## Risks and mitigations

-   Non-React consumers (classes) currently import singletons:
    -   Mitigation: expose `useRootStore.getState()` accessors and allow passing a store reference to constructors where feasible; long-term, inject store explicitly.
-   Event bus removal might miss edge triggers:
    -   Mitigation: maintain temporary DOM event dispatch behind a flag during migration; remove after verification.
-   Persisting unintended data:
    -   Mitigation: clearly separate persistable state and `services` slice; add tests for serialization payloads.

---

## Acceptance criteria

-   No direct uses of `globalMacroManager` remain in app code; macro functionality is provided by the macro slice.
-   No module-level singletons remain for timing; each store instance maintains its own `TimingManager` service.
-   React contexts replaced where beneficial: Macro, Scene, Selection, Undo; Visualizer minimized and state moved into slices.
-   Export/import paths include macros via the slice; roundtrip preserves values.
-   All tests pass; new unit tests added for slices and services; performance is at least on par.

---

## Work breakdown (suggested PRs)

1. Add macro slice + shim; migrate property bindings and MacroContext consumers; wire persistence (feature branch).
2. Extract services slice; move timing manager into it; update `timelineStore.ts` references.
3. Create root store; split `timelineStore` into slices; adjust imports to `useRootStore`.
4. Migrate SceneSelectionContext → selection slice; adapt UI panels.
5. Migrate SceneContext and useMenuBar → scene slice; delete context; update UI.
6. Integrate undo into store; remove UndoContext; add tests.
7. Move export settings/progress overlay to UI slice; slim down VisualizerContext (or replace with `VisualizerHost`).
8. Remove deprecated shims and leftover CustomEvent usages; finalize docs.

---

## Appendix

### Macro slice type (reference from v1 plan)

See `macro_manager_to_zustand_v1.md` for the detailed slice shape and validation helper; reuse as-is.

### Known files referencing `globalMacroManager` (to be migrated)

-   `src/bindings/macro-manager.ts` (replaced by shim then removed)
-   `src/bindings/property-bindings.ts`
-   `src/context/MacroContext.tsx`
-   `src/context/useMenuBar.ts`
-   `src/persistence/export.ts`
-   `src/persistence/import.ts`
-   `src/persistence/undo/snapshot-undo.ts`
-   `src/persistence/__tests__/persistence.scene-elements.test.ts`
-   `src/persistence/__tests__/undo.scene-move.test.ts`
-   `src/core/scene-builder.ts`
-   `src/core/scene/elements/base.ts`
-   `src/ui/panels/properties/MacroConfig.tsx`
-   `src/core/index.ts`

### Notes on Visualizer services

-   Keep the visualizer instance and playback clock out of persisted state; expose a small number of imperative actions via services.
-   Derive UI state (playing, time labels, export settings) from slices so components stay declarative.
