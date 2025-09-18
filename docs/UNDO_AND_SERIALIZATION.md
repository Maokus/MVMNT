## Undo, Serialization, and Deserialization

This document explains how the current undo/redo system works, how document serialization/deserialization is implemented, what operations are undoable today, and outlines a plan to support undo for scene element transforms (move/scale/rotate/etc.).

### TL;DR

-   The app uses a document store built on Zustand + Immer patches. All undoable changes must go through `@state/document/actions` which wrap `documentStore.commit()` to generate patches.
-   Undo/redo operates on Immer patches; grouping compresses multiple commits (e.g., a drag) into one undo step.
-   Serialization/deserialization is handled via a gateway and a tolerant serializer that version-stamps documents and drops unknown keys.
-   Today, timeline actions and any scene actions routed via `@state/document/actions` are undoable; direct mutations in the runtime scene builder are not tracked by the document store and therefore are not undoable.
-   When you drag/move a scene element in the canvas, it currently updates runtime element bindings directly rather than committing a document action; pressing Ctrl/Cmd+Z won’t move the element back because no document patch was recorded.

---

## Architecture Overview

### Document Store (Zustand + Immer)

Files:

-   `src/state/document/documentStore.ts`
-   `src/state/document/actions.ts`
-   `src/context/UndoContext.tsx`

Key points:

-   The private, mutable document is held inside a Zustand store. External code cannot mutate it directly; mutations must be done via `commit((draft) => { ... }, meta)` which uses Immer to produce forward and inverse patches.
-   History stacks (`past` and `future`) contain patch entries. `undo()` applies `inversePatches`; `redo()` reapplies `patches`.
-   Grouping API (`beginGroup(label)` / `endGroup()`) accumulates patches across multiple commits and pushes a single combined history entry when the group ends.
-   `replace(next)` swaps the entire document and clears history (per contract). Use this for imports or hard resets.
-   Convenience flags `canUndo`/`canRedo` are derived from the history stacks.

### Actions API (Single mutation surface)

File:

-   `src/state/document/actions.ts`

Actions provide the only supported mutation surface for the app. Examples:

-   Timeline: `setTimelineName`, `setGlobalBpm`, `setPlayheadTick`, `nudgePlayheadTicks`, `setTransportPlaying`, `addTrack`, `removeTrack`.
-   Scene: `addSceneElement`, `updateSceneElement(id, updater)`, `removeSceneElement`.
-   Document: `replaceDocument(next)`.

Any user interaction that should be undoable must call one of these actions (or new actions added with the same pattern). Direct state mutation in other modules will bypass the patch history and will not be undoable.

### Keyboard integration

File:

-   `src/context/UndoContext.tsx`

The provider wires global keyboard shortcuts:

-   `Cmd/Ctrl+Z` → `undo()`
-   `Shift+Cmd/Ctrl+Z` and `Cmd/Ctrl+Y` → `redo()`

It queries `canUndo()`/`canRedo()` and maps to the document store actions. Components can also consume this context for UI controls and status.

### Serialization / Deserialization

Files:

-   `src/state/document/gateway.ts`
-   `src/persistence/document-serializer.ts`
-   `src/persistence/export.ts` and `src/persistence/import.ts` (legacy scene envelope + document export/import)

Gateway:

-   `createDocumentGateway()` unifies access to the document: `get/snapshot`, `replace`, `apply(patches)`, `serialize`, `deserialize`.

Serializer:

-   `serializeDocument(doc)` wraps the document in an envelope `{ version: 1, doc }` and uses `serializeStable` for deterministic JSON.
-   `deserializeDocument(json)` is tolerant: accepts either the versioned envelope, a legacy Phase 1 scene envelope (`{ schemaVersion, format: 'mvmnt.scene', timeline, scene }`), or a bare `{ timeline, scene }` doc. Unknown keys are dropped via a template-based clone of the current store snapshot shape.

Legacy scene import/export:

-   `exportScene()` and `importScene()` are still provided for the older, visualizer-centric scene format. They work directly with the runtime scene builder and the timeline store. The newer document export/import is `exportDocument()` / `importDocument()` via the gateway and serializer.

---

## What is Undoable Today

Undoability depends on whether an interaction ultimately calls `documentStore.commit()` via `@state/document/actions`.

Undoable (implemented in `actions.ts`):

-   Timeline
    -   `setTimelineName(name)`
    -   `setGlobalBpm(bpm)`
    -   `setPlayheadTick(tick)` and `nudgePlayheadTicks(delta)`
    -   `setTransportPlaying(isPlaying)` (also updates `transport.state`)
    -   `addTrack(trackId, track)` / `removeTrack(trackId)` (tracks and `tracksOrder`)
-   Scene
    -   `addSceneElement(el)` pushes an element config into `doc.scene.elements`
    -   `updateSceneElement(id, updater)` mutates a single element by `id`
    -   `removeSceneElement(id)` removes by `id`
-   Document
    -   `replaceDocument(next)` replaces the entire document and clears history (cannot be undone by design)

Important nuance:

-   Even though scene element actions exist, they only contribute to undo if the UI routes element mutations through them. If the UI directly mutates the runtime scene builder (without touching the document store), then no document patches are recorded and Ctrl/Cmd+Z won’t revert those runtime changes.

### Not Undoable (current system)

-   Direct runtime scene builder changes (e.g., dragging/moving elements on canvas) unless explicitly bridged into document actions. This is the root cause of “move element then press Ctrl+Z does nothing.”
-   Macro value changes and property-binding mutations managed by `globalMacroManager` are not recorded in the document store today.
-   Import/Replace operations performed via `replaceDocument()` clear the undo/redo stacks by contract. After an import, there is nothing to undo until new commits occur.
-   External side effects (e.g., image/font resource loading, export pipeline steps) are outside the document model and not undoable.

---

## Why element moves don’t undo currently

The canvas interactions update the runtime `SceneElement` instances (property bindings like `offsetX`/`offsetY`, etc.). Those changes are not currently mirrored into the document store via `@state/document/actions.updateSceneElement`. Because the document store never receives a `commit()`, it doesn’t generate patches; therefore Ctrl/Cmd+Z has no effect on the runtime state of that element.

---

## Document Model and Format

Document shape (TypeScript):

-   `DocumentStateV1` is `{ timeline: TimelineDoc; scene: SceneDoc }`
-   `SceneDoc` is currently:
    -   `elements: any[]` – array of element configs (persistable data, not live objects)
    -   `sceneSettings?: any`
    -   `macros?: any`

Serializer behavior:

-   Versioned envelope `{ version: 1, doc }` with stable key order.
-   On deserialize, unknown keys are dropped by cloning only keys present in the current store snapshot template to prevent unrecognized state from entering the app.

---

## Plan: Enable Undo for Scene Element Transforms

Goal: Moving/scaling/rotating an element on the canvas should commit document patches so that `Ctrl/Cmd+Z` reverts the element to its previous transform.

### Design Options

1. Document as Canonical Source for Scene Config (recommended)

-   Route all element property writes through `@state/document/actions`.
-   Scene builder becomes a renderer/consumer of the document state. On document changes, update the runtime elements.

2. Runtime as Canonical with Bidirectional Bridge

-   Keep the scene builder as the source of truth for interactive edits, but on each runtime change, emit a corresponding `updateSceneElement` action to mirror the change into the document store for undo/redo and persistence.
-   Requires a re-entrancy guard to avoid loops when applying document-driven updates back to runtime.

Both approaches can share much of the plumbing. The recommended path is (1) for long-term consistency, but (2) may be simpler as an incremental step.

### Implementation Steps

1. Define Persisted Transform Properties

-   For each element, agree on the persisted transform fields: `offsetX`, `offsetY`, `elementScaleX`, `elementScaleY`, `elementRotation`, `elementSkewX`, `elementSkewY`, `anchorX`, `anchorY`, `zIndex`, `visible`.
-   Ensure runtime bindings map 1:1 to these persisted keys so a document update can be applied deterministically to the runtime element.

2. Add a Scene Sync Adapter (Bridge)

-   New module (e.g., `src/core/scene/scene-doc-bridge.ts`):
    -   Subscribes to `useDocumentStore` revisions; diffs `doc.scene.elements` vs. runtime and applies necessary creates/updates/removes to the scene builder.
    -   Exposes methods for the canvas tools to call on user interactions:
        -   `onDragStart(elementIds)` → `beginGroup('drag-elements')`
        -   `onDragMove(elementId, partialTransform)` → `updateSceneElement(elementId, el => Object.assign(el, partialTransform))`
        -   `onDragEnd()` → `endGroup()`
    -   Provides a re-entrancy guard flag, e.g. `isApplyingFromDoc`, to ignore bridge callbacks while applying document-driven changes to runtime.

3. Wire Canvas Tools to Actions

-   Whenever the user drags an element:
    -   Start a group on pointer down.
    -   Throttle `updateSceneElement` calls during pointer move (e.g., requestAnimationFrame or 10–20ms throttle) to avoid excessive history size.
    -   End the group on pointer up/cancel.
-   For multi-select moves, iterate over all selected IDs within the same group.

4. Ensure Serializer Includes Scene Elements

-   The document serializer already clones the current document snapshot. With the bridge in place, `doc.scene.elements` will be kept in sync, so `exportDocument()` produces a correct, versioned JSON snapshot.
-   On `importDocument(json)`, `replaceDocument` will clear history and set the new state. The bridge should react to the doc change and rebuild the runtime scene accordingly.

5. Tests

-   Add unit tests validating undo/redo for element transforms via the document store:
    -   `updateSceneElement` modifies `offsetX/offsetY` → `undo()` restores previous values → `redo()` reapplies.
    -   Grouping test: multiple updates within a group produce a single undo step.
    -   Multi-element update within a group.

6. Performance & UX

-   Set a reasonable history cap (default: 200) via `setHistoryCap(n)` if needed for memory pressure.
-   Use grouping for drags and keyboard nudges to prevent history spam.
-   Include `meta.label` (e.g., `dragElement`, `moveSelection`) in commits to aid debugging.

7. Edge Cases

-   Element ID not found: `updateSceneElement` should be a no-op; the bridge should guard against stale IDs.
-   Elements created/deleted during a drag: ensure `endGroup()` still runs on pointer up.
-   Macro-bound transforms: if a property is bound to a macro, decide whether drag moves update the macro value or convert to constant for that element. Document this behavior and keep it consistent.

### Minimal Code Touch Points

-   Canvas interaction layer: call bridge hooks on pointer events.
-   New bridge module to translate between document and runtime scene builder.
-   Optional: a small helper in `actions.ts` for bulk updates, e.g., `updateSceneElements(ids: string[], updater)` for multi-select operations.

---

## Debugging & Operational Notes

-   If Ctrl/Cmd+Z doesn’t revert a change, confirm whether the action ultimately invoked `documentStore.commit()`.
-   Use `meta.label` on commits for easier inspection via a custom `setHistoryLogger(fn)` hook (already present in the store).
-   Remember that `replaceDocument` clears history by design. After an import, `canUndo` will be false until new commits occur.

---

## Summary

Undo/redo is reliable and efficient for any changes routed through the document store’s action layer. Serialization uses a versioned envelope with stable ordering and a tolerant deserializer that conforms input to the current document shape. The missing piece for element transforms is a bridge that routes canvas edits through the document actions (with grouping), enabling true undo/redo for moves and other transform operations. The plan above provides a low-risk path to implement this without large-scale refactors, and it sets the groundwork for making the document the canonical source for the scene configuration over time.
