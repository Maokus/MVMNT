## Plan Overview (Phase Blueprint Construction)

Below is a comprehensive, phased implementation plan to achieve the new architecture you described: a clean separation between a persistable document store and an ephemeral UI store, one‑way data flow with a reconciler, and a diff/patch-based undo system using Immer. Each phase includes: goal, key tasks, acceptance criteria, verification steps (UI + console), testing scope, and migration notes. The current audit (Phase 0) is complete; we're now defining the unified schema (Todo 2 in-progress).

---

## Phase 0 – Audit (Completed)

Summary: Existing `timelineStore` mixes persistent (tracks, tempo, scene identity) with ephemeral (playhead, transport state). Undo is snapshot + debounce; serialization exports a composite envelope via `exportScene()`, and scene elements/macros live outside Zustand in builder/macro manager singletons. Serialization currently depends on runtime objects (scene builder) → coupling.

---

## Phase 1 – Define Unified Document Domain Model

Goal: Establish a canonical, self-contained, serializable document schema (no class instances, only plain objects + IDs).

Data Model (Draft):

-   DocumentRoot (versioned)
    -   metadata: id, name, createdAt, modifiedAt, schemaVersion
    -   timeline: { tempoMap, globalBpm, beatsPerBar }
    -   tracks: Record<TrackID, Track>
    -   trackOrder: TrackID[]
    -   scene:
        -   elements: SceneElementPOJO[]
        -   settings: SceneSettings
        -   macros: MacroDefinition[]
    -   bindings: (optional extracted property bindings if you decide to externalize)
    -   resources: (fonts, media references)
-   Non-persisted (will move to UI store): playhead position (currentTick), transport state, loop enabled, selection, viewport, rowHeight (optional decision), hover/drag states, transient measure guides.

Key Design Decisions:

1. IDs: stable strings; generation via helper `createId(type: string)`.
2. Schema versioning: `schemaVersion: 1` plus `migrations/` directory for future up-migrations.
3. Element structure: Flatten runtime class state → `{ id, type, zIndex, props: {...}, bindings: {...serializedBindingData} }`.
4. Macros: Export plain value + type + metadata; reference by ID inside bindings.
5. Deterministic ordering: Keep `trackOrder` + `elements` explicit arrays (stable ordering preserved).
6. Separation of projection concerns: No runtime caches (e.g. computed layout, compiled binding functions) inside document.
7. MIDI ingestion: Persist only canonical MIDI note descriptors (ticks/beat representations) – no derived seconds; runtime projection handles conversions.
8. Timestamps: `createdAt` preserved; `modifiedAt` auto-updated in mutating actions (batched if debounced).
9. Purity: All document actions must be side-effect free except for internal state mutation; external systems (renderer, playback) react via subscriptions to document store or reconciler events.

Acceptance Criteria:

-   Typescript interfaces exist in `src/document/types.ts`.
-   A placeholder migration function: `migrateDocument(input: any): DocumentRoot`.
-   Unit tests validating: (a) stable structural equality after serialize→deserialize; (b) ordering preserved; (c) unknown extra fields dropped or namespaced.
-   No references to runtime objects (classes, functions) in persisted shape.

Verification:
Console after implementing types:

```
import { createEmptyDocument } from '@document/factory';
const doc = createEmptyDocument();
console.log(doc.schemaVersion === 1);
```

Tests: `vitest run` shows new `document.types.test.ts` green.

---

## Phase 2 – Scaffold Document Store (No Undo Yet)

Goal: `useDocumentStore` (Zustand + Immer middleware) containing only persistable document state.

Actions (initial set):

-   `addTrack`, `updateTrack`, `removeTrack`, `reorderTracks`
-   `addElement`, `updateElementProps`, `removeElement`, `moveElementZ`
-   `addMacro`, `updateMacro`, `removeMacro`
-   `updateSceneSettings`
-   `updateTimelineMeta` (beatsPerBar, bpm, tempoMap)
-   `bulkApply(patchFn)` (for migrations/import)
-   Internally update `modifiedAt` (throttled via microtask or timestamp aggregator).

No ephemeral UI pieces here.

Acceptance Criteria:

-   Store file `src/document/store.ts` created.
-   All actions type-safe, return void, pure except state mutation.
-   No UI-specific fields in store state.
-   Unit tests for each action (happy path + edge/reject cases).
-   External code can import store and create tracks/elements without runtime builder.

Verification:
Console:

```
const id = useDocumentStore.getState().addTrack({ name: 'Piano' });
console.log(useDocumentStore.getState().tracks[id].name === 'Piano');
```

---

## Phase 3 – Serialization & Deserialization (Pure)

Goal: Stateless functions:

-   `serializeDocument(doc: DocumentRoot): string`
-   `deserializeDocument(json: string): DocumentRoot`
-   `exportDocument()` convenience (pull from store)
-   `importDocument(jsonOrObj)` sets document store (wipes existing doc state but not UI state)

Deterministic Serialization:

-   Use stable key ordering (can leverage existing `serializeStable` or refine).
-   Exclude ephemeral fields fully.

Acceptance Criteria:

-   Round-trip identity test (ignoring `modifiedAt` changes).
-   Invalid schema version → migration path invoked.
-   Tampered / missing required fields → throws or returns Result object with errors.
-   Large document (simulate 1k elements) serializes < threshold (time test ~ not strict but ensures no exponential blowup).

Verification:
Console:

```
const json = serializeDocument(useDocumentStore.getState().document);
const doc2 = deserializeDocument(json);
console.log(doc2.trackOrder.length === useDocumentStore.getState().document.trackOrder.length);
```

---

## Phase 4 – Reconciler / Runtime Projection Layer

Goal: Derive a runtime representation (`RuntimeGraph`) from the document:

-   Convert element POJOs into instantiated SceneElement classes (with binding hydration).
-   Build macro runtime objects.
-   Prepare derived caches (e.g., computed note seconds) without mutating document.
-   Provide diff-aware update to minimize churn (e.g., keyed by element ID).

Design:

-   `createReconciler({ getDocument, subscribe })` returns:
    -   `getRuntime()`
    -   `subscribeRuntime(listener)`
    -   Internally maintains last doc snapshot hash (e.g., fast shallow signature) to apply minimal diff.
-   Rehydration functions partition: `rehydrateElement`, `rehydrateBinding`, `rehydrateMacro`.
-   Non-serializable instances never leak back to document store.

Acceptance Criteria:

-   Updating document store triggers reconciler rebuild exactly once per commit (not per intermediate draft of debounced interactions).
-   Removing an element disposes its runtime instance (if disposal hook exists).
-   Bindings rehydrated to active objects.
-   No cyclic updates (runtime doesn't write to document).

Tests:

-   Projection equivalence for a baseline doc.
-   Changing one element prop only rehydrates that element (spy counts).
-   Macro value change updates dependent runtime elements.

Verification (Console):

```
const runtime = reconciler.getRuntime();
console.log(runtime.elements.size);
useDocumentStore.getState().updateElementProps(elId, { x: 100 });
```

Observe log from reconciler about partial update.

---

## Phase 5 – Diff/Patch Undo/Redo (Immer Patches)

Goal: Replace snapshot JSON undo with structured patch history:

-   Use `immer` `produceWithPatches` around document mutations.
-   Maintain stacks: `past[]`, `future[]`, configurable depth & memory guard.
-   High-frequency actions (drag) produce ephemeral interim updates that don't push history until settled (debounced).
-   Provide selectors: `canUndo`, `canRedo`.
-   Actions: `undo()`, `redo()`, `commitBatch()`.

Architecture:

-   Core mutation actions route through an internal `applyDocMutation(fn, { historical?: true|false, batchKey? })`.
-   Debounce keyed by action type or element ID for drag operations.
-   When debounce fires → commit aggregated final state and record patches as one entry.

Acceptance Criteria:

-   Undo after a property drag reverts to position before drag (single history entry).
-   Batch API merges sequential element property updates within threshold window.
-   Redo restores identical serialized doc hash.
-   Tests confirm patch replay leaves runtime reconciliation consistent.

Verification:
Console:

```
useDocumentStore.getState().updateElementProps(elId,{x:10});
useDocumentStore.getState().undo();
```

---

## Phase 6 – Debounced High-Frequency Actions

Goal: Implement specialized actions:

-   `beginElementDrag(id)`
-   `updateElementDrag(id, partialProps)`
-   `endElementDrag(id)` → commits final doc mutation (one undo entry) + triggers reconciliation finalization.

Transport:

-   Live interim updates may still need runtime feedback: Apply to document but mark as "draft" not recorded in history.

Acceptance Criteria:

-   Dragging does not balloon undo stack.
-   Runtime updates throttled (e.g., RAF-based) if applying live doc changes; or, if using ghost state, final reconcile at end.

Tests:

-   Simulated drag sequence results in exactly one history entry.
-   Performance test: 200 rapid `updateElementDrag` calls < threshold and history size unchanged until end.

---

## Phase 7 – UI Store (Ephemeral State Extraction)

Goal: `useUIStore` holds:

-   playhead `currentTick`
-   transport state, loop flags, selection, viewport, hover, drag, cursor mode, rowHeight (decide), temporary overlays.

Sync Strategy:

-   Playback clock updates UI store only.
-   When exporting/serializing → ignore UI store.
-   Components subscribe to UI store for responsive ephemeral changes; document store only for persistable.

Acceptance Criteria:

-   Removing playhead and transport from document store (or leaving a read-only snapshot).
-   Play/pause no longer mutates document.
-   Undo/redo does not affect playhead position.

Tests:

-   Undo after playhead moves does not revert playhead.
-   Serializing and reloading doc does not set playhead unexpectedly (starts at 0 or preserved policy defined).

---

## Phase 8 – Wiring One-Way Flow & Guards

Goal: Ensure no accidental writes to document from runtime side:

-   Freeze document objects returned by selectors (Object.freeze in dev mode).
-   Reconciler runtime modifications throw if they attempt to mutate doc state (lint guard or dev assertion).
-   Add dev utility: `assertOneWayFlow()` scanning call stacks in debug mode.

Acceptance Criteria:

-   Attempting to mutate doc from runtime triggers console error in dev.
-   All UI interactions trace path: Event → UI handler → document action → reconcile event → UI re-render.

Tests:

-   Monkey patch a runtime element attempting to push to store → blocked in test environment.

---

## Phase 9 – Migration & Legacy Removal

Tasks:

-   Replace usages of `timelineStore` where data is now document vs UI.
-   Delete or deprecate snapshot undo code.
-   Adapt `exportScene()` to delegate to new serializer.
-   Update `SceneBuilder` integration: Instead of holding authoritative element list, it is driven by reconciler runtime graph only.
-   Macro manager incorporated into document store.

Acceptance Criteria:

-   No direct calls to `snapshot-undo`.
-   `exportScene()` uses `serializeDocument()`.
-   Legacy store fields removed or slimmed to UI only.

Verification:
Global grep for `snapshot-undo`, `timelineStore` in document contexts returns zero where not allowed.

---

## Phase 10 – Integration Test Scenarios

Scenarios:

1. Create doc → add track → add element → serialize → deserialize → equality.
2. Drag element: many interim updates; final state matches expected; undo reverts to pre-drag.
3. Macro update updates runtime element property; undo reverts visible change.
4. Import older version (simulate) triggers migration path.
5. Large doc (1000 elements) operations: creation time & undo memory boundaries enforced.

---

## Phase 11 – Documentation

Artifacts:

-   ARCHITECTURE.md updated: new diagrams (One-Way Data Flow, Reconciler Loop).
-   VALIDATION_MATRIX.md extended with new undo & serialization invariants.
-   New `docs/STATE_MODEL.md`.
-   Migration notes: mapping old timeline fields to new domains.

Verification:
Checklist included; internal anchors for quick navigation.

---

## Phase 12 – Performance & Edge Validation

Checks:

-   Patch history memory cap enforcement.
-   Reconciler diff cost O(changed) not O(N) in average incremental update (bench harness).
-   Stress test with synthetic elements/macros (scripted test).
-   GC pressure (dev instrumentation).

Acceptance Criteria:

-   1000-element prop update commit < X ms (define baseline).
-   Undo chain depth config works (cap respected).
-   No memory leak detected across reconcile cycles (object counts stable after GC hint in tests if applicable).

---

## Phase 13 – Final Review

Produce:

-   Acceptance matrix (Requirement → Implementation Reference → Test Coverage).
-   Console verification script snippet.
-   Open follow-up backlog (future improvements: partial persistence, lazy projection, worker offload).

---

## Cross-Cutting Testing Strategy

Unit Test Categories:

1. Schema & Types: structural integrity, migration.
2. Store Actions: immutability, idempotency for unchanged props, timestamp updates.
3. Serialization: stable ordering, canonical equality, resilience to field omission.
4. Reconciler: selective updates, disposal behavior, macro binding recalculation.
5. Undo: patch application correctness, batching, redo correctness, history limits.
6. Debounce: time simulation with fake timers.
7. UI Store Isolation: ensure no persistent contamination.
8. Integration: end-to-end flows.

Utilities:

-   Use `vitest` fake timers for debounced actions and batching.
-   Helper to compute fast structural hash (e.g., stable JSON string + length) for test assertions.

---

## Acceptance Matrix (Initial Mapping)

Requirement → Phase(s)

-   Central document store (single source of truth) → 2,3
-   Ephemeral UI segregation → 7
-   One-way flow & projection → 4,5,8
-   Reconciliation pattern & rehydration → 4,5
-   Diff-based undo with batching → 5,6,7
-   Debounced drag updates → 6,7
-   Full serialization/deserialization independent of runtime → 3,4,9
-   Comprehensive unit tests → Phases 1–11
-   Console/UI verification steps provided → Each phase

---

## Next Immediate Work (Current In-Progress Todo 2)

Deliverables to implement next:

-   Create `src/document/types.ts` with full interfaces.
-   Add `src/document/migrations.ts` skeleton.
-   Add initial tests `src/document/__tests__/document.types.test.ts`.
-   Provide `createEmptyDocument()` factory.

If you'd like, I can proceed to scaffold those files now.

Let me know if you want any adjustments to the plan language or if I should start implementing Phase 1 types and tests directly.
