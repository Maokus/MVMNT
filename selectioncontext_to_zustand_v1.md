## 1. Research Summary (Current State)

### SceneSelectionContext

SceneSelectionContext.tsx currently:

-   Holds both transient UI state (selected element id, refresh counters) and operational scene graph actions (add/update/move/duplicate/delete elements).
-   Derives `sceneBuilder` from `visualizer.getSceneBuilder()` and maintains a sorted `elements` list.
-   Performs DOM side effects (manually mutating `#propertiesHeader`) and syncs selection back into `visualizer.setInteractionState`.
-   Listens to window events (`scene-refresh`) to reconcile removed elements, and increments triggers to force React re-renders (e.g., `propertyPanelRefresh`).

### Coupling Points

SidePanels.tsx orchestrates:

-   Selection clearing on outside click / Escape key.
-   Passing of selection-derived props into `PropertiesPanel` (element + schema) and `SceneElementPanel`.
-   Element creation and deletion are invoked via context-exposed actions.
    Effectively it acts as a mediator; both child panels could instead subscribe directly to a store.

### Consumers

-   `SceneElementPanel` needs: `elements`, `selectedElementId`, and element actions.
-   `PropertiesPanel` needs: selected element (or none), schema, and mutation fn `updateElementConfig`.
-   Both panels also indirectly rely on the `visualizer` (through context) for export / debug settings (those stay in `VisualizerContext`).

### Existing Zustand Usage

A large, well-structured `timelineStore` already exists: pattern uses a single `create()` invocation, plain JS (no middleware currently), explicit action methods (mutating via set). This gives a precedent: adding another store (or extending that one) with similar ergonomics is consistent.

### Separation of Concerns Target

Goal: Move selection + element list + element operations into a dedicated _UI / Scene Elements_ Zustand slice:

-   Remove DOM mutation inside state logic.
-   Let layout (`SidePanels`) become passive container (no business logic).
-   Keep all builder operations centralized & pure (except necessary builder mutation + visualizer invalidations).

### Visualizer Interop

Two synchronization responsibilities must remain:

1. Updating visualizer interaction state when selected element changes.
2. Re-binding scene builder whenever a new visualizer (or imported scene) provides a fresh builder.

These belong more naturally in `VisualizerContext` (as effects subscribing to the UI store), not inside the store itself—maintains store purity and avoids circular dependency.

## 2. Proposed Store Design

Create `src/state/uiStore.ts`:

```ts
export interface SceneSelectionSlice {
    sceneBuilder: HybridSceneBuilder | null;
    visualizer: any | null; // (optional, or we pass visualizer methods in actions)
    elements: any[];
    selectedElementId: string | null;
    selectedElement: any | null;
    selectedElementSchema: any | null;
    propertyPanelRefresh: number;
    refreshVersion: number; // replaces refreshTrigger
    error: string | null;

    // Actions
    setSceneBuilder: (builder: HybridSceneBuilder | null) => void;
    refreshElements: () => void;
    selectElement: (id: string | null) => void;
    clearSelection: () => void;
    addElement: (type: string) => void;
    updateElementConfig: (elementId: string, patch: Record<string, any>) => void;
    toggleElementVisibility: (id: string) => void;
    moveElement: (id: string, newDisplayIndex: number) => void;
    duplicateElement: (id: string) => void;
    deleteElement: (id: string) => void;
    updateElementId: (oldId: string, newId: string) => boolean;
    incrementPropertyPanelRefresh: () => void;
}
```

Store shape root:

```ts
export interface UIState {
    sceneSelection: SceneSelectionSlice;
    // (Future: panel collapse state, active tool, dark mode, etc.)
}
```

Implementation details:

-   Sorting logic for `elements` preserved (descending `zIndex`).
-   Actions encapsulate builder calls and guard null builder.
-   All DOM header mutation removed; header computed in render from `selectedElementId`.
-   `refreshVersion` lumps forced re-renders (if any component still keys off it).
-   `propertyPanelRefresh` incremented only when internal config updated but element identity stays constant (mirrors current behavior).

Selectors:

-   `useUIStore(s => s.sceneSelection.selectedElementId)` etc. to minimize re-renders.
-   Provide optional re-export helper hooks: `useSceneSelection()` wrapper for ergonomics (mimic old API, easing migration).

## 3. Component Refactors

| Component                 | Change                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SidePanels.tsx            | Remove all `useSceneSelection` logic; no outside click to clear selection? (Keep UX: re‑implement using store directly—logic remains but now calls store actions). Stop passing element/schema/refreshTrigger to children. Replace properties header dynamic text with inline expression.                                                                                                         |
| SceneElementPanel.tsx     | Replace context with store selectors; call actions directly. Remove `refreshTrigger` prop. Add an effect to call `refreshElements()` on mount or if `sceneBuilder` changes (store already handles `setSceneBuilder`).                                                                                                                                                                             |
| PropertiesPanel.tsx       | Stop accepting `element` & `schema` props from parent; derive from store internally (or pass nothing from parent). Simplify props to keep export & debug pieces only. Consider splitting into two distinct component responsibilities if needed later.                                                                                                                                            |
| `GlobalPropertiesPanel`   | No change (still needs visualizer from `VisualizerContext`).                                                                                                                                                                                                                                                                                                                                      |
| SceneSelectionContext.tsx | Delete file after migration (or temporarily deprecate with runtime warning until all imports removed).                                                                                                                                                                                                                                                                                            |
| VisualizerContext.tsx     | Add effect: on visualizer init or scene import, call `useUIStore.getState().sceneSelection.setSceneBuilder(visualizer.getSceneBuilder())`. Add subscription to `selectedElementId` to push into `visualizer.setInteractionState` (preserving previous sync). Add listener for `'scene-refresh'` event to call store `refreshElements()` + selection validation (removing logic from old context). |

## 4. Event & Lifecycle Handling

-   Window events:
    -   `scene-refresh`: handled in `VisualizerContext` effect (which already knows when visualizer/scene changes) or in a small `initSceneSelectionEffects()` function executed once when builder bound.
-   `timeline-track-added` etc. unaffected.
-   Undo/redo snapshot capturing remains—store actions still call builder methods; instrumentation listening to builder events (if any) remains unchanged.

## 5. Migration Strategy (Incremental & Low-Risk)

Phase 1: Introduce Store Slice

1. Add `uiStore.ts` with slice + hook re-export.
2. Add temporary adapter hook `useSceneSelection()` that simply proxies to store; keep old name so refactors can be gradual.

Phase 2: Refactor Consumers 3. Update `SceneElementPanel` to use adapter hook (minimal diff). 4. Update `PropertiesPanel` to read selection from store internally (simplify its parent usage). 5. Update `SidePanels` to stop pulling selection state—only layout + outside click handler (now calling store’s `clearSelection()`).

Phase 3: Integrate Visualizer 6. In `VisualizerContext`, wire builder + selection sync. 7. Move header label logic into JSX render (remove DOM writes).

Phase 4: Remove Legacy Context 8. Replace all imports of `SceneSelectionContext` with `uiStore` hook; delete file. 9. Run tests (including any referencing `useSceneSelection` — adapter retains signature so minimal breakage). 10. Update docs (ARCHITECTURE.md) noting selection now lives in UI Zustand store, not React context.

Phase 5: Cleanup & Validation 11. Search for `propertiesHeader` direct DOM updates — ensure removed. 12. Add lightweight unit test for store actions (selection, add, duplicate, delete, move reorder invariants). 13. Add integration test ensuring selecting an element causes header text to reflect truncated id.

## 6. Edge Cases & Handling

| Edge Case                                       | Handling Strategy                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Builder not yet ready                           | Store holds `sceneBuilder:null`; actions no-op safely. Components show loading skeleton (reuse existing logic or adapt). |
| Selected element deleted externally             | On `scene-refresh` or after any mutating action: if `selectedElementId` missing, auto-clear selection.                   |
| ID update collision                             | Action returns `false`; UI retains old ID and alerts (maintain existing UX).                                             |
| Move element re-index conflicts                 | Reuse original algorithm; ensure no mutation of underlying immutable config except via builder API.                      |
| Property panel stale values after config update | Keep `propertyPanelRefresh` counter and increment on config changes requiring forced re-mount.                           |
| Visualizer interaction state drift              | Subscription in `VisualizerContext` ensures push only when changed.                                                      |
| Importing a new scene (new builder instance)    | Effect rebinding `sceneBuilder` resets elements list + selection.                                                        |

## 7. Testing Plan

Unit (Jest/Vitest):

-   `uiStore.sceneSelection`:
    -   addElement → element appears with incremented zIndex.
    -   updateElementConfig modifies config and increments refreshVersion (if relevant).
    -   duplicateElement produces unique ID.
    -   deleteElement clears selection if it was selected.
    -   moveElement adjusts relative ordering (simulate zIndex diff).
    -   updateElementId handles collisions.

Integration (React testing library):

-   Render `SidePanels` + stub visualizer/builder:
    -   Selecting element updates header.
    -   Pressing Escape clears selection.
    -   Outside click clears selection while inside click does not.

Regression:

-   Ensure no reference to `SceneSelectionContext` remains (grep).
-   Ensure no direct DOM mutation of `#propertiesHeader`.

## 8. API Changes Summary

Removed (after cleanup):

-   `SceneSelectionProvider` component.
-   `useSceneSelection` from context file (re-implemented as store hook proxy).

Added:

-   `useUIStore` / `useSceneSelection()` (store-based).
-   `uiStore.ts` with `SceneSelectionSlice`.

Breaking Changes:

-   `PropertiesPanel` no longer needs `element` or `schema` props (can maintain backward-compatible signature temporarily by ignoring them).

## 9. Risks & Mitigations

| Risk                                              | Mitigation                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Visualizer not yet ready when components mount    | Defensive null checks; “Initializing…” placeholder stays.                                                |
| Subscription causing extra renders                | Use granular selectors; avoid returning whole slice.                                                     |
| Hidden coupling resurfaces (e.g., header updates) | Centralize header rendering in a single component (no imperative DOM).                                   |
| Undo capture duplication                          | Store actions mirror prior context logic; no new events introduced. Monitor undo ring size in manual QA. |

## 10. Implementation Order (Task List)

1. Scaffold `uiStore.ts` with slice + hook.
2. Add adapter `useSceneSelection` (store-based).
3. Wire visualizer → store (builder + selection mirroring).
4. Refactor `SceneElementPanel`.
5. Refactor `PropertiesPanel` & header rendering.
6. Simplify `SidePanels`.
7. Delete old context + fix imports.
8. Add tests & update docs.
9. Final grep & lint, run test suite.

## 11. Future Extensions (Optional After Migration)

-   Persist UI preferences (panel widths, collapsed state) in same store (not scene export).
-   Add devtools middleware only in dev builds (`process.env.NODE_ENV` guard).
-   Memoized selectors for derived data (e.g., visible elements, sorted list) to reduce recomputation.

## 12. Acceptance Criteria

-   No imports of `SceneSelectionContext`.
-   Selecting elements updates UI and visualizer interaction state.
-   Removing selected element clears selection automatically.
-   Side panels contain zero business logic aside from click/Escape delegation.
-   All existing export & debug functionality unaffected.
-   Tests pass and docs updated.

---

If you’re happy with this plan, I can proceed to implement Phase 1 (store slice + adapter) next. Let me know if you’d like any adjustments before execution.
