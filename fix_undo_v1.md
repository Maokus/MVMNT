# Fix Undo v1: Make element transforms undoable

Goal: When the user drags, scales, rotates, anchors, or reorders a scene element in the canvas, Cmd/Ctrl+Z should revert the change, and Shift+Cmd/Ctrl+Z (or Cmd/Ctrl+Y) should redo it. All interactive transforms must emit document patches via `src/state/document/actions.ts`.

## Verification summary (today)

Evidence from current code shows drag interactions mutate the runtime scene directly and never call document actions:

-   `src/ui/panels/preview/canvasInteractionUtils.ts` updates via `sceneBuilder.updateElementConfig()` and `deps.updateElementConfig()` during drag handlers (`updateMoveDrag`, `updateScaleDrag`, `updateAnchorDrag`, `updateRotateDrag`). No calls to `@state/document/actions` occur, so no `documentStore.commit()` and no patches are recorded.
-   `src/context/SceneSelectionContext.tsx` defines `updateElementConfig` which writes through the runtime `sceneBuilder` and refreshes UI, but also does not route changes through `@state/document/actions`.
-   Undo keybindings are wired in `src/context/UndoContext.tsx` and map to `undo()`/`redo()` on the document store. With no patches created by canvas edits, these shortcuts appear to do nothing.

Conclusion: The suspicion is correct; element transform interactions bypass the document store, so undo/redo has nothing to act on.

---

## Non-invasive v1 plan

Approach: Keep the runtime scene builder as-is for now, but mirror every interactive transform into the document store using the existing actions API. Use grouping to coalesce a drag gesture into a single history entry, and throttle commits to avoid overwhelming history.

1. Persisted transform keys (contract)

-   Standardize on these persisted element keys so runtime ↔ document mapping is 1:1:
    -   `offsetX`, `offsetY`, `elementScaleX`, `elementScaleY`, `elementRotation`, `elementSkewX`, `elementSkewY`, `anchorX`, `anchorY`, `zIndex`, `visible`.
-   Ensure `sceneBuilder.updateElementConfig` and property getters correspond to these names (already largely aligned per current usage in drag code).

2. Add a tiny bridge API over actions

-   File: `src/state/document/actions.ts` (or a new helper `sceneActionsBridge.ts` nearby)
    -   Add bulk update helpers to reduce action chatter during multi-select or throttled updates:
        -   `updateSceneElements(ids: string[], updater: (el: any) => void, meta?: PatchMeta)`
        -   `beginHistoryGroup(label?: string)` and `endHistoryGroup()` that proxy to `useDocumentStore.getState().beginGroup/ endGroup`.
-   Keep existing single-element `updateSceneElement` for basic cases.

3. Wire canvas drag lifecycle to grouping + actions

-   File: `src/ui/panels/preview/canvasInteractionUtils.ts`
    -   On pointer-down when a drag begins:
        -   Call `beginHistoryGroup('drag-element')`.
    -   On pointer-move while dragging:
        -   Continue updating the runtime via `sceneBuilder.updateElementConfig` for immediate visual feedback.
        -   Additionally, invoke `updateSceneElement(id, el => Object.assign(el, partialTransform), { label: 'dragElement' })`.
        -   Throttle these commits using `requestAnimationFrame` or a ~16ms timer to avoid excessive patches within the group.
    -   On pointer-up/cancel:
        -   Call `endHistoryGroup()` to push a single grouped history entry.

4. Multi-select support (optional in v1)

-   If dragging multiple selected elements is supported, call `updateSceneElements` with a loop inside one group. If not implemented yet, keep scope to single-element drags and add multi-select in v1.1.

5. Reordering and visibility

-   File: `src/context/SceneSelectionContext.tsx`
    -   For `moveElement`, `toggleElementVisibility`, `duplicateElement`, `deleteElement`, and `updateElementId`:
        -   Where a change results in a different persisted config, mirror it with `updateSceneElement` (or `add/removeSceneElement`) so it is undoable.
        -   Wrap user-driven multi-steps (like `moveElement` cascading z-index shifts) in a history group.

6. Serializer compatibility

-   The serializer already clones `doc.scene.elements`. With the bridge, it will stay in sync. No changes needed, but add a smoke test to ensure `elementScaleX/Y`, `elementRotation`, etc. serialize and round-trip.

7. Tests to lock behavior

-   Add unit tests around the document store actions:
    -   Single element move: `updateSceneElement(id, el => { el.offsetX = 10; el.offsetY = 5; })` → `undo()` restores → `redo()` reapplies.
    -   Grouping: multiple updates within a group produce a single undo step.
    -   Optional: bulk updates across multiple ids.

8. Performance and safety

-   Use grouping for drags; add a 10–20ms throttle on action commits during pointer-move.
-   Consider a history cap via `setHistoryCap(200)` if not already configured (it is).
-   Add a simple guard to ignore updates if element id is not found in the document.

9. Developer ergonomics

-   Include a `meta.label` on commits like `dragElement`, `scaleElement`, `rotateElement` to improve logging via the document store’s `setHistoryLogger` if enabled.

---

## Minimal code touch list (v1)

-   `src/state/document/actions.ts`
    -   Export thin wrappers: `beginHistoryGroup`, `endHistoryGroup` (proxy to store), and optional `updateSceneElements`.
-   `src/ui/panels/preview/canvasInteractionUtils.ts`
    -   Call `beginHistoryGroup` on drag start and `endHistoryGroup` on drag end.
    -   During drag, throttle calls to `updateSceneElement` mirroring the runtime changes.
-   `src/context/SceneSelectionContext.tsx`
    -   Mirror property changes caused by UI actions (visibility, zIndex reordering, duplication, deletion) into document actions, optionally grouped.

---

## Follow-ups (v1.1+)

-   Make the document the canonical source of truth and rebuild runtime state from document deltas (one-way data flow). This removes the need to mirror changes but requires refactoring scene builder reads to subscribe to document.
-   Add macro-binding semantics to undo history if macro-bound transforms should be edited via drags.
-   Persist selection state in document if desired for session restore (non-undoable UI state).
