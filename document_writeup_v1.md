# Document System Architecture (v1)

This write-up summarizes the integrated document-centric state system now powering (or ready to power) the application. It consolidates the implemented functionality originally planned across phases 1–5 of the migration plan, stripping phase labels for the long-term canonical description.

---

## 1. Goals & Design Snapshot

Provide a deterministic, serializable, validated, undoable, incrementally reconciled document model separated from transient UI/runtime objects. Every mutation flows through a single funnel producing patches and enabling efficient runtime updates without full rebuilds.

Core properties:

-   Deterministic structural hash for change detection / snapshot comparison.
-   Minimal schema with migration stub + validation.
-   Single mutation funnel (Immer produceWithPatches) + time-window batching + undo/redo via inverse patches.
-   Deterministic persistence (stable key ordering) with explicit schema version gate.
-   Incremental reconciler preserving runtime object identity for unchanged nodes.

---

## 2. Data Model Overview

`DocumentRoot` (see `schema.ts`):

-   `schemaVersion`: numeric version (currently 1) – bump only on breaking structural changes.
-   `createdAt`, `modifiedAt`: epoch ms timestamps (volatile for hashing; retained in persistence).
-   `tracks`, `elements`: normalized collections `{ byId: Record, allIds: string[] }`.
-   `meta`: lightweight metadata (`name`).

Entity shapes:

-   `Track`: `{ id, name, elementIds[] }` referencing element IDs in order.
-   `TimelineElement`: `{ id, name, start, duration }`.

Normalization enables O(1) lookup, stable ordering via `allIds`, and straightforward diffing by IDs.

---

## 3. ID Generation

`generateId(prefix)` prefers `crypto.randomUUID()`; falls back to an incrementing counter (safe in single-process dev). Collisions are statistically negligible; a future enhancement could add a dev-only duplicate registry or switch to ULIDs if ordering metadata is useful.

---

## 4. Migration Pipeline

`migrate(raw: unknown): DocumentRoot` guards against totally invalid input, rejects future schema versions, and fills defaults. Currently linear (no chained version steps yet). Future versions would progressively transform structure before reaching the latest representation.

Upgrade strategy later: `while(version < CURRENT) { applyStep(version++); }` – deferred until a second schema version appears.

---

## 5. Validation

`validateDocument(doc)` performs:

-   Root key presence sanity.
-   Collection shape checks.
-   Duplicate ID detection (tracks & elements).
-   Referential integrity (`track.elementIds` -> existing elements).
-   Basic numeric constraints (`start >= 0`, `duration > 0`, non-empty names`).

`assertValidDocument` throws aggregated errors (human-readable). No salvage / quarantine logic yet—fail fast strategy keeps issues loud and early. Extensibility: append new structural rules without altering consumers; return array allows future warning severities.

---

## 6. Structural Hash & Canonicalization

`computeStructuralHash(doc)` -> canonical JSON (sorted keys, volatile timestamp fields omitted) -> 32-bit FNV-1a style hash hex string.

Usage:

-   Fast equality / change detection for undo validation and potential caching.
-   Non-cryptographic; collisions acceptable at current scale (< thousands of nodes). Can replace with stronger hash transparently later because canonical string function is stable.

`canonicalize(doc)` returns the canonical JSON string (useful in tests / debugging).

---

## 7. Mutation Funnel & Undo System

API surface (from `store.ts`):

-   `applyDocMutation(label, fn, { batchable })`
-   `undo()`, `redo()`; `canUndo()`, `canRedo()`
-   Exposed Zustand store: `useDocumentStore()` (document, undoStack, redoStack, etc.)

Mechanics:

1. Immer `produceWithPatches` executes mutation `fn(draft)` and records forward + inverse patches.
2. Time-window batching (250ms) merges sequential mutations sharing the same `label` while prior entry is marked `batchable`.
3. Each undo entry stores `hashBefore` / `hashAfter` for optional debug assertions and quick integrity checks.
4. Undo applies inverse patches; redo re-applies forward patches (no re-running mutation closures, ensuring determinism).
5. `modifiedAt` updated per produce invocation; intermediate merges do not add redundant timestamp noise.

Future extension points:

-   Intent taxonomy (grouping by semantic operation types) – deferred.
-   Memory caps / patch size accounting – deferred (add rolling byte tally on push).
-   Non-historical transient gesture streaming (e.g., throttled preview) – could use non-batchable flagged mutations.

---

## 8. Deterministic Serialization

`serializeDocument(doc)` produces a minified stable-key-order JSON string including volatile fields (persistence fidelity > hashing needs). `deserializeDocument(str)` performs parse -> migrate -> validate.

Round-trip properties:

-   `computeStructuralHash(doc)` equals hash after `deserialize(serialize(doc))`.
-   Future schema versions decisively reject with a clear error.

Potential later augmentations: pretty-print export mode, compression, streaming chunk format.

---

## 9. Incremental Reconciler

`createReconciler(hooks?)` maintains runtime maps for tracks & elements keyed by ID.

Algorithm per reconciliation:

1. Iterate current `allIds` lists (tracks, then elements).
2. For each ID: create runtime object if absent; else shallow-compare meaningful fields.
3. On detected differences, mutate in-place & increment version counter; fire update hook.
4. After iteration, dispose removed runtime objects (not in new alive set) with `dispose()` + hook.

Identity semantics: unchanged runtime objects maintain referential stability enabling React/memoized consumers or rendering caches to skip work.

Hooks: granular instrumentation points for future resource management or side-effects (e.g., creating WebGL buffers, scheduling animations).

---

## 10. Integration Flow Summary

1. Load / create: `doc = createEmptyDocument()` OR `deserializeDocument(json)` (which invokes migrate + validate).
2. Attach store (already initialized globally via `useDocumentStore`).
3. Mutate exclusively via `applyDocMutation()`; reconciler auto-runs post-commit.
4. UI/runtime layers subscribe either:
    - Directly to store slices; or
    - Via reconciler runtime objects (stable identities).
5. Persistence: serialize on explicit save / autosave tick.
6. Undo/redo align runtime via reconciler automatically (since reconcile is called after patch application).

---

## 11. Performance Characteristics (Current Expectations)

Light synthetic checks (in tests / manual profiling):

-   Single-property mutation reconcile: near O(1) over changed collections (only iterates lists once, shallow compare cheap).
-   Hash computation cost proportional to size; acceptable for small/medium documents; upgrade path: subtree hashing if >10k nodes emerges.
-   Undo/redo patch replay avoids full deep clone of entire doc (Immer only touches patched paths).

Potential hotspots (later): very large `allIds` arrays or deeply nested future structures (not present yet). Monitoring path: wrap reconciliation in a dev-only `console.time` when doc size crosses threshold.

---

## 12. Extension Points

| Concern                 | Current Hook                 | Future Direction                          |
| ----------------------- | ---------------------------- | ----------------------------------------- |
| Runtime lifecycle       | Reconciler hooks             | Resource pooling, metrics                 |
| Mutation semantics      | `applyDocMutation` wrapper   | Intent classification, middleware chain   |
| Validation domain rules | `validateDocument` extension | Severity levels, auto-remediation         |
| Persistence             | `serialize/deserialize`      | Pretty-print, compression, diff streaming |
| Undo governance         | Undo stack push site         | Memory caps, grouping heuristics          |

---

## 13. Safety & Determinism Notes

-   All writes pass through a single Immer produce; no direct external mutation should occur. (Optional future dev-mode freeze could deep-freeze state outside drafts.)
-   Structural hash excludes volatile timestamps, so undo verification and test comparisons remain stable.
-   Reconciler shallow diff scope is intentionally limited; newly added fields that should trigger runtime updates must be reflected in `elementChanged` / `trackChanged` predicate logic.

---

## 14. Migration & Versioning Policy

Semantic version of document schema increments only for breaking shape changes (field removal / type change / structural reorganization). Additive fields defaulted by migration DO NOT bump version. Future multiple-step migration will accumulate transform functions with monotonic version bumping.

---

## 15. Usage Examples

Add an element:

```ts
applyDocMutation('add-element', (draft) => {
    const id = 'el_' + Date.now();
    draft.elements.byId[id] = { id, name: 'New', start: 0, duration: 1000 } as any;
    draft.elements.allIds.push(id);
});
```

Rename project (creates its own undo entry after inactivity window):

```ts
applyDocMutation('rename-project', (draft) => {
    draft.meta.name = 'Album A';
});
```

Undo / redo:

```ts
undo();
redo();
```

Persist:

```ts
const json = serializeDocument(useDocumentStore.getState().document);
localStorage.setItem('project', json);
```

Load:

```ts
const loaded = deserializeDocument(localStorage.getItem('project')!);
useDocumentStore.setState({ document: loaded });
```

---

## 16. Known Deferred Items

Documented separately (see migration plan backlog): subtree hashing, advanced validation salvage modes, memory caps, property-based fuzzing, gesture streaming partial updates, metrics instrumentation.

---

## 17. Verification Mapping (Phases 1–5 Criteria)

| Capability                             | Implementation                     | Test File                                                |
| -------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| Idempotent migrate + hash stability    | `migrate`, `computeStructuralHash` | `schema_hash.test.ts`                                    |
| Hash change on semantic mutation       | Hash function + element add        | `schema_hash.test.ts`                                    |
| Volatile timestamp ignored             | Canonicalization replacer          | `schema_hash.test.ts`, `serialization_roundtrip.test.ts` |
| Basic validation errors                | `validateDocument`                 | `validation_rules.test.ts`                               |
| Duplicate / missing refs detection     | Validation loops                   | `validation_rules.test.ts`                               |
| Mutation batching (time/window)        | Store logic (`applyDocMutation`)   | `undo_mutation.test.ts`                                  |
| Undo/redo hash equality                | Inverse patch replay               | `undo_mutation.test.ts`                                  |
| Deterministic serialization round-trip | Stable stringify                   | `serialization_roundtrip.test.ts`                        |
| Future version rejection               | `migrate` guard                    | `serialization_roundtrip.test.ts`                        |
| Reconciler identity preservation       | `createReconciler` diff logic      | `reconciler.test.ts`                                     |
| Lifecycle create/update/dispose        | Hook invocations                   | `reconciler.test.ts`                                     |

---

## 18. Ready State

All acceptance criteria for foundational document responsibilities (schema, migration, validation, hashing, mutation+undo, serialization, reconciler) are implemented with a green test suite.

Legacy phase-named test files have been converted into single skipped suites (`describe.skip(...)`) purely as a transient measure to avoid CI cache / watch mode edge cases during removal. They contain no assertions and can be safely deleted in a follow-up commit once repository consumers have updated local branches. The canonical test coverage now resides exclusively in the neutral files inside `src/document/__tests__`:
`schema_hash.test.ts`, `validation_rules.test.ts`, `undo_mutation.test.ts`, `serialization_roundtrip.test.ts`, `reconciler.test.ts`.

---

## 19. Next Increment Ideas

1. Add dev-mode guard to ensure mutations only occur inside `applyDocMutation` (e.g., Proxy freeze outside drafts).
2. Lightweight metrics wrapper around reconcile durations when element/track counts exceed threshold.
3. Optional pure function diff summarizer for external observers (e.g., to drive targeted UI invalidations).

---

End of document.
