# State Improvements v1: Undo/Persistence Abstraction and Store Segregation

Date: 2025-09-17

## Goals and Problem Statement

Current issue: Undo/redo operates on whole-application snapshots. Example: moving the timeline (UI concern) then moving a scene element (document/data concern), pressing `Ctrl+Z` reverts both. This is because the undo stack captures the entire Zustand state, coupling ephemeral UI with persisted document data.

Goals:

-   Decouple ephemeral UI state (e.g., playhead position, zoom, selection) from persisted document data (scenes, tracks, resources, keyframes, etc.).
-   Introduce a shared abstraction that both undo/redo and persistence (save/load) use to interact with the document state. Avoid duplicated logic and reduce surface area for bugs.
-   Redesign undo/redo to be patch-based and document-scoped, so timeline/UI changes never enter history.
-   Preserve backward compatibility in import/export; safely ignore legacy UI fields on load.
-   Provide a clear migration path and test coverage to ensure behavior doesn’t regress.

Success criteria:

-   Undo/redo only affects document data. UI state like `playhead`, `zoom`, `selection` remains unchanged by document undo/redo.
-   Save files contain only document data. Load sets only the document store. UI state initializes from defaults or separate UI persistence (if any).
-   Existing user files still load. Any old, UI-related fields in saved JSON are ignored.

---

## Design Overview

-   Two Zustand stores:
    -   `documentStore` (persisted data): the source of truth for scenes/tracks/resources/keyframes and any data that should be saved.
    -   `uiStore` (ephemeral UI): playhead, zoom, selection, viewport, guides, transient flags, last hovered, etc.
-   Unified state I/O abstraction (gateway) that exposes a minimal and consistent API for:
    -   Getting/replacing the document.
    -   Applying Immer patches.
    -   Serializing/deserializing documents.
-   Undo history built from Immer patches emitted by document mutations only.
-   Persistence implemented with the same gateway, ensuring one canonical path for reading/writing document state.

---

## Abstraction: Unified Document State Gateway

Responsibilities:

-   Provide a single entry point for undo/redo and for save/load to interact with the document.
-   Convert between in-memory document objects and serialized formats.
-   Apply and emit patches to support efficient history and collaborative flows later.

Types (TypeScript):

```ts
// src/state/document/types.ts
import type { Patch } from 'immer';

export type DocVersion = string; // e.g., '1'

export interface PatchMeta {
    label?: string; // human-readable action label (for UI)
    actor?: string; // optional source (e.g., 'user', 'macro')
    ts?: number; // timestamp
}

export interface HistoryEntry {
    patches: Patch[];
    inversePatches: Patch[];
    meta?: PatchMeta;
}

export interface DocumentStateGateway<D> {
    // Read current in-memory document
    get(): D;

    // Replace the entire document (e.g., on load)
    replace(next: D, meta?: PatchMeta): void;

    // Apply a set of patches (e.g., for undo/redo)
    apply(patches: Patch[], inverse?: Patch[], meta?: PatchMeta): void;

    // Deep snapshot for persistence or tests
    snapshot(): D;

    // Serialization/deserialization
    serialize(doc?: D): { version: DocVersion; data: unknown };
    deserialize(raw: unknown): D;
}
```

Reference implementation notes:

-   Use `immer`’s `applyPatches` internally to implement `apply`.
-   Use a thin `DocumentSerializer` (below) to handle versioning and shape mapping.
-   The gateway owns no UI logic and does not touch the UI store.

---

## DocumentSerializer and Versioning

`DocumentSerializer` encapsulates: (1) versioned on-disk format and (2) conversion to/from the in-memory document shape.

```ts
// src/persistence/document-serializer.ts
export interface DocumentSerializer<D> {
    version: DocVersion;
    toPersisted(doc: D): { version: DocVersion; data: unknown };
    fromPersisted(raw: unknown): D; // tolerant; ignores unknown/UI fields
}
```

Implementation guidelines:

-   `toPersisted` removes any UI fields if they somehow existed on the document (defensive).
-   `fromPersisted` supports reading older versions and normalizes to current in-memory document.
-   Leverage existing `stable-stringify` for deterministic outputs in `export`.

---

## Store Segregation: `documentStore` vs `uiStore`

New files:

-   `src/state/documentStore.ts` (persisted)
-   `src/state/uiStore.ts` (ephemeral)

Document store characteristics:

-   Contains only data that must be saved: scenes, tracks, resources, keyframes, document-level settings, macros/config that impact rendering.
-   Mutations go through an Immer-enabled `set` that can emit patches for the undo engine.
-   Exposes selectors for reading in views/components.

UI store characteristics:

-   Contains transient editor state: `playhead`, `timelineZoom`, `selection` (ids only), `scroll/viewport`, `hover`, `drag`, `fold states`, etc.
-   Never enters the undo history. Persistence is optional and, if desired, handled separately (e.g., localStorage) without polluting document persistence.

Example scaffolding:

```ts
// src/state/uiStore.ts
import { create } from 'zustand';

export interface SelectionState {
    sceneIds: string[];
    elementIds: string[];
}

export interface UIState {
    playhead: number; // seconds or ticks per existing convention
    timelineZoom: number;
    selection: SelectionState;
    // ... other ephemeral fields (viewport, hoveredId, isPlaying, etc.)
}

export const useUIStore = create<UIState>((set) => ({
    playhead: 0,
    timelineZoom: 1,
    selection: { sceneIds: [], elementIds: [] },
    // mutations only update UI store, never affecting document history
}));
```

```ts
// src/state/documentStore.ts
import { create } from 'zustand';
import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer';
import type { HistoryEntry } from './document/types';

enablePatches();

export interface DocumentState {
    /* scenes, tracks, resources, ... */
}

interface DocumentStore {
    doc: DocumentState;
    history: { past: HistoryEntry[]; future: HistoryEntry[] };
    commit: (recipe: (draft: DocumentState) => void, meta?: { label?: string }) => void;
    undo: () => void;
    redo: () => void;
    replace: (next: DocumentState, meta?: { label?: string }) => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
    doc: /* initial document */ {} as DocumentState,
    history: { past: [], future: [] },

    commit: (recipe, meta) =>
        set((state) => {
            const [nextDoc, patches, inversePatches] = produceWithPatches(state.doc, recipe);
            if (patches.length === 0) return state;
            return {
                doc: nextDoc,
                history: {
                    past: [...state.history.past, { patches, inversePatches, meta }],
                    future: [], // clear redo stack on new commit
                },
            };
        }),

    undo: () =>
        set((state) => {
            const entry = state.history.past[state.history.past.length - 1];
            if (!entry) return state;
            const prevDoc = applyPatches(state.doc, entry.inversePatches);
            return {
                doc: prevDoc,
                history: {
                    past: state.history.past.slice(0, -1),
                    future: [entry, ...state.history.future],
                },
            };
        }),

    redo: () =>
        set((state) => {
            const entry = state.history.future[0];
            if (!entry) return state;
            const nextDoc = applyPatches(state.doc, entry.patches);
            return {
                doc: nextDoc,
                history: {
                    past: [...state.history.past, entry],
                    future: state.history.future.slice(1),
                },
            };
        }),

    replace: (next, meta) =>
        set((state) => ({
            doc: next,
            history: { past: [], future: [] }, // reset history on full replace
        })),
}));
```

Notes:

-   Only `commit` triggers history entries. UI store mutations never call `commit`.
-   `replace` is used by load/import. Undo/redo stacks are cleared on replace.
-   If action grouping is desired (e.g., drag operations), introduce a `beginGroup`/`endGroup` or debounce-reducer pattern.

---

## Undo Engine Redesign (Document-Only, Patch-Based)

-   Build history from Immer patches emitted by `produceWithPatches` when mutating `doc`.
-   Each history entry stores both `patches` and `inversePatches` for efficient undo/redo.
-   Action labeling is supported via `meta.label` to inform the UI.
-   Redo stack clears when a new `commit` occurs.
-   Optional: cap history length (e.g., 200) to bound memory.

Edge cases:

-   Loading a document (`replace`) clears history to avoid applying old patches to new docs.
-   If an external process modifies `doc` without going through `commit`, it won’t be tracked; enforce using `commit` for all document mutations.

---

## Persistence Pipeline Updates

Target files: `src/persistence/export.ts`, `src/persistence/import.ts`.

-   Rework export to call `gateway.serialize(useDocumentStore.getState().doc)` and then stable-stringify the result.
-   Rework import to parse the JSON, call `gateway.deserialize`, then `useDocumentStore.getState().replace(doc)`.
-   UI store is unaffected by load/save. If we want to remember UI preferences, handle separately (e.g., localStorage) with a clear boundary from document persistence.

Pseudocode:

```ts
// export.ts
import stableStringify from '../persistence/stable-stringify';
import { useDocumentStore } from '../state/documentStore';
import { gateway } from '../state/document/gateway';

export function exportProject(): string {
    const { doc } = useDocumentStore.getState();
    const payload = gateway.serialize(doc);
    return stableStringify(payload);
}
```

```ts
// import.ts
import { useDocumentStore } from '../state/documentStore';
import { gateway } from '../state/document/gateway';

export function importProject(json: string) {
    const raw = JSON.parse(json);
    const doc = gateway.deserialize(raw);
    useDocumentStore.getState().replace(doc, { label: 'Load Project' });
}
```

Backward compatibility:

-   `deserialize` should ignore/strip any legacy UI fields.
-   If old versions are detected, upgrade in-place to current in-memory shape.

---

## Migration Plan (Incremental)

1. Introduce new stores alongside current ones

-   Add `documentStore.ts` and `uiStore.ts`.
-   Introduce the gateway and serializer, but keep old code paths intact initially.

2. Wire up the undo engine to document store only

-   Move undo logic into `documentStore` (or a separate `history` module) using patches.
-   Update `UndoContext` to use the new undo/redo/selectors.

3. Start moving callers

-   Refactor components and actions that mutate persisted data to call `useDocumentStore.getState().commit(...)`.
-   Keep UI-related mutations on `useUIStore`.

4. Update persistence to use the gateway

-   Switch `export.ts`/`import.ts` to new APIs.
-   Verify round-trip saves with real projects.

5. Remove legacy UI from document shape

-   If any UI remnants exist within document data, remove them and provide migration logic in `deserialize`.

6. Delete legacy undo and coupled snapshot logic

-   After components use the new stores, remove the global snapshot-based undo.

7. Cleanup and stabilization

-   Cap history size, add action labels, group drags, and polish developer ergonomics.

Feature-flagging:

---

## Testing Strategy

Unit tests (Vitest):

-   Document-only undo: commit a document change, then mutate UI store, then undo — assert UI values unchanged, document reverted.
-   Patch correctness: for representative mutations, ensure `applyPatches(doc, inversePatches)` restores the exact previous state.
-   Serialize/deserialize round-trip: `doc -> serialize -> parse -> deserialize` yields deep-equal doc.
-   Legacy file import: load fixture with UI fields present; verify they are ignored; document matches expected canonical form.
-   Load replaces history: after load, `undo` has no effect.

Integration tests:

-   Common user flows: move playhead (UI), move element (doc), undo/redo. Verify only element moves during undo/redo and playhead remains fixed.

Performance & memory:

-   History cap test: after exceeding cap, ensure oldest entries drop, behavior remains correct.

---

## Implementation Notes and Examples

-   Always mutate the document via `commit((draft) => { ... })` to ensure patches are captured.
-   For complex operations (e.g., macros), consider grouping multiple changes into a single `commit` to keep histories clean.
-   Selections in UI store should reference IDs only; computation of derived selection data should read from `documentStore`.
-   For timeline zoom/playhead, maintain values in UI store and emit events as needed; never mirror them into the document.

---

## Acceptance Checklist

-   [ ] UI and document stores exist and are used by respective features.
-   [ ] Undo/redo stack is built from patches of document changes only.
-   [ ] Save/load operates exclusively on document store through the gateway.
-   [ ] Old files load correctly; UI fields ignored.
-   [ ] Tests: unit + integration added and green.
-   [ ] Legacy snapshot-based undo removed.

---

## Next Steps (Post v1)

-   Action grouping and coalescing (e.g., during drags) for better UX.
-   Optional UI preferences persistence (localStorage) with clear boundaries.
-   Telemetry/debug tooling: log action labels and history sizes to help diagnose issues.
-   Consider CRDT/OT-friendly APIs if real-time collaboration is a future goal.
