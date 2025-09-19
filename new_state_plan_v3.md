# State Architecture Plan – Version 3 (Solo Dev Lean Edition)

> v3 = v2 core distilled for a single independent developer: keep the architectural spine (document vs UI, reconciler, patch-based undo, deterministic serialization) and defer heavyweight governance, instrumentation, and exhaustive testing until clearly needed.

---

## 1. Executive Summary

This plan delivers a lean, incremental migration to a document‑centric architecture with: (1) a minimal versioned schema, (2) basic validation, (3) a mutation funnel with patch-based undo + simple time batching, (4) deterministic (stable) serialization + structural hash, (5) an incremental reconciler preserving object identity, and (6) extraction of ephemeral UI state away from the document. Everything else (advanced metrics, dual-run comparators, property-based fuzzing, security sandboxing, complex governance) is explicitly deferred to a backlog.

Goal: Achieve maintainable separation & predictable undo/reconcile performance with the least responsible complexity.

---

## 2. Guiding Principles (Lean)

1. Separation of Concerns: The persisted document is pure data; runtime objects & UI state are projections.
2. Determinism (Good Enough): Same logical document -> same canonical JSON string & structural hash (stable key ordering, no fancy hashing libs yet).
3. Single Mutation Funnel: All writes go through `applyDocMutation()` enabling undo patches and controlled side-effects.
4. Minimal Batching: Time-window (≈250ms) batching for high-frequency gestures; no elaborate intent taxonomy (yet).
5. Incremental Reconcile: Only changed document nodes produce runtime updates; untouched references remain identity-equal.
6. Simplicity Over Abstraction: Defer frameworks or registries until at least two concrete use cases demand them.
7. Small, Testable Steps: Each phase lands with a handful of focused unit/integration tests; avoid big-bang rewrites.
8. Deferred Complexity Is Documented: Anything skipped is written down so future you recalls the rationale.

---

## 3. Scope & Non‑Goals

In-Scope (v3): core schema, lightweight migration stub, validation, structural hash, mutation funnel, basic undo/redo, reconciler, UI store extraction, minimal tests.

Out of Scope (Deferred): property-based fuzzing, performance CI harness, feature flags, dual-run equivalence, quarantine/safe mode, advanced resource integrity checks, formal schema governance doc, risk matrix, metrics dashboard, security sandbox for macros, complex intent grouping, memory caps for undo, import partial/merge modes.

---

## 4. Informal Performance Targets (Aspirational, Not Hard Gates Yet)

-   Serialize 1k medium elements: < 50ms (manual profiling).
-   Deserialize 1k medium elements: < 65ms.
-   Incremental single property change reconcile: < 2ms.
-   Undo apply median: < 5ms.
    If exceeded, investigate, but do not block development early.

Instrumentation (initial): temporary `console.time/console.timeEnd` in dev helpers; removable later.

---

## 5. Phase Overview

| Phase              | Focus                                            | Outcome                                       |
| ------------------ | ------------------------------------------------ | --------------------------------------------- |
| 1                  | Minimal schema + structural hash + migrate stub  | Deterministic base & ID generation            |
| 2                  | Basic validation                                 | Early detection of malformed docs (throw/log) |
| 3                  | Document store + mutation funnel + patch undo    | Central write path & history                  |
| 4                  | Deterministic serialize/deserialize              | Reliable persistence & hash stability         |
| 5                  | Reconciler (incremental)                         | Identity-preserving runtime graph updates     |
| 6                  | UI state extraction + legacy bridge removal plan | Clean separation of ephemeral vs persisted    |
| 7 (Optional Micro) | Light test & profiling cleanup                   | Confidence + small perf notes                 |

Backlog items recorded separately (Section 11).

---

## 6. Phase 1 – Minimal Schema & Structural Hash

**Goal:** Establish a canonical document shape with version constant & deterministic hash.

**Deliverables:**

-   `SCHEMA_VERSION` constant (number incremented only on breaking structure change).
-   `createEmptyDocument(): DocumentRoot` returning fully populated minimal graph.
-   `migrate(raw: unknown): DocumentRoot` – For now: if version missing or lower -> patch fields; if higher -> throw with message (no multi-step chain yet).
-   ID strategy: `crypto.randomUUID()` (fallback to an incrementing counter if needed for environments). Dev-only registry (optional) to assert no duplicates (can add later).
-   `computeStructuralHash(doc)` = JSON stringify of a canonical form: recursively sort object keys, omit volatile timestamps.

**Acceptance Criteria:**

1. `migrate(createEmptyDocument())` is idempotent (hash unchanged).
2. Two fresh empty docs share same hash & canonical string.
3. Changing any non-ignored field changes hash.
4. Hash function deterministic across Node/Browser (simple test).

**Tests:** Unit tests for hash determinism & migration idempotency.

**Risks Simplified:** Higher collision probability (acceptable now). If collisions observed, upgrade hashing later.

---

## 7. Phase 2 – Basic Validation

**Goal:** Validate structural correctness & simple referential integrity at load/import time.

**Deliverables:**

-   `validateDocument(doc: DocumentRoot): ValidationError[]` (plain array). Each error: `{ path: string; message: string; severity?: 'error' }`.
-   Enforcement policy: If critical errors exist (e.g., missing required root keys, duplicate track IDs), either throw or log & abort load (decide: throw now).
-   Simple reference checks (e.g., element references existing track). Missing references cause removal OR error; choose simplest: throw to surface early.

**Acceptance Criteria:**

1. Invalid root shape -> thrown error containing messages.
2. Duplicate IDs in synthetic doc -> detection.
3. Valid doc runs without errors in < 10ms for ~1k elements (manual console timing ok).

**Tests:** Unit tests creating small malformed docs to ensure validation catches issues.

**Deferred:** Quarantine, partial salvage, placeholders for missing resources.

---

## 8. Phase 3 – Document Store, Mutation Funnel & Basic Undo

**Goal:** Centralize mutations, generate patches, maintain undo/redo with simple time-window batching.

**Deliverables:**

-   `useDocumentStore()` (Zustand or existing pattern) containing current `document`, `undoStack`, `redoStack`.
-   `applyDocMutation(label: string, fn: (draft: DocumentRoot) => void)` implemented using Immer's `produceWithPatches`.
-   Time-batching: successive calls flagged as "gesture" within 250ms merge into the previous undo entry if `label` matches and last entry marked batchable.
-   Undo/Redo functions applying inverse patches.
-   Updated timestamp policy: Optionally track `modifiedAt` on commit (skip mid-gesture merges until final patch).

**Acceptance Criteria:**

1. Series of rapid ( < 250ms gap ) position updates produce 1 undo entry; a pause > 250ms creates a new one.
2. Undo restores document structural hash of previous state.
3. Redo after undo reproduces original hash.
4. Direct state mutation (bypassing funnel) is avoided by convention (dev discipline); optional dev freeze can be added later.

**Tests:** Unit tests for batching logic, undo/redo hash equality.

**Deferred:** Intent taxonomy, memory caps, patch size metrics, drag-specific non-historical interim updates.

---

## 9. Phase 4 – Deterministic Serialization

**Goal:** Stable persistence pipeline (serialize + deserialize) preserving structural hash and ordering rules.

**Deliverables:**

-   `serializeDocument(doc): string` producing canonical JSON (sorted keys, no pretty-print needed).
-   `deserializeDocument(str): DocumentRoot` -> JSON parse -> migrate -> validate.
-   Guarantee stable ordering for collections: use existing arrays; do not reorder internally unless necessary.

**Acceptance Criteria:**

1. `computeStructuralHash(doc)` equals hash of `deserializeDocument(serializeDocument(doc))` (round-trip stability).
2. Non-semantic whitespace differences (none produced) – not applicable; JSON output is minified.
3. Deserializing document with future `schemaVersion` throws clear error.

**Tests:** Round-trip test; future-version rejection test.

**Deferred:** Pretty-print export mode, version negotiation, compression.

---

## 10. Phase 5 – Reconciler (Incremental Diff)

**Goal:** Efficiently update runtime graph when document changes; preserve identity for unchanged nodes.

**Approach (Lean):**

-   Maintain a runtime map keyed by document node IDs referencing runtime objects.
-   On each applied mutation (post-undo/redo or direct), compute sets of added/updated/removed IDs by shallow diffing the relevant collections (tracks, elements).
-   For updated nodes, compare a lightweight version marker or shallow hash (e.g., JSON string of selective fields) to avoid full deep compare.
-   Invoke lifecycle: create (on add), update (on changed props), dispose (on removal).

**Deliverables:**

-   `createReconciler()` returning `{ reconcile(doc): void }`.
-   Integration into store: after mutation completes & batch closed, call `reconciler.reconcile(newDoc)`.

**Acceptance Criteria:**

1. Changing a single element property triggers exactly one runtime update (spy count test).
2. Removing an element calls its dispose handler.
3. Unchanged elements retain strict equality identity across reconciles.
4. Reconcile runtime for small change avoids O(N) iteration over unrelated large arrays beyond necessary indexing (manual inspection & simple perf timing with synthetic 1k baseline).

**Tests:** Spy-based tests for add/update/remove identity preservation.

**Deferred:** Subtree hashing, deep O(C) guarantees under complex nesting, worker offload, perf benchmarks in CI.

---

## 11. Phase 6 – UI State Extraction & Legacy Bridge

**Goal:** Ensure ephemeral UI values (selection, playhead, panel visibility, transient cursor/drag state) are not persisted in the document; plan staged removal of legacy timeline store.

**Deliverables:**

-   `useUIStore()` for ephemeral fields.
-   Identify & migrate any ephemeral fields currently in document or legacy store; move them.
-   Temporary adapter forwarding old selectors/actions to new stores (simple pass-through) with a one-time console.warn.
-   After stabilization (manual dogfooding), remove adapter & delete obsolete legacy store.

**Acceptance Criteria:**

1. Undo/redo does not affect UI-only fields (playhead etc.).
2. Grep/code check: no ephemeral property names exist inside document type definitions.
3. Adapter logs exactly once when used.
4. Removing adapter still leaves tests green (final cleanup commit).

**Tests:** Integration test verifying playhead stability across undo/redo.

**Deferred:** Feature flags, dual-run equivalence harness.

---

## 12. Phase 7 (Optional Micro Cleanup)

**Goal:** Tidy incidental tech debt introduced; add minimal perf notes.
**Tasks:** Remove stray console timers not needed; add README snippet for future enhancements; record manual perf timings in a markdown note.

---

## 13. Minimal Testing Strategy (Implemented Along Phases)

| Test Category                         | Purpose                          | Implemented In |
| ------------------------------------- | -------------------------------- | -------------- |
| Hash determinism & idempotent migrate | Detect accidental ordering drift | Phase 1        |
| Validation failures                   | Catch malformed docs early       | Phase 2        |
| Undo/Redo round-trip hash equality    | Ensure patch correctness         | Phase 3        |
| Serialize/Deserialize round-trip      | Persistence integrity            | Phase 4        |
| Reconciler identity & lifecycle       | Prevent full rebuild regressions | Phase 5        |
| UI separation (playhead unaffected)   | Persistence boundary enforcement | Phase 6        |

Deferred future tests: property-based random doc generator, performance budgets, drag high-frequency stress, security injection tests.

---

## 14. Backlog / Deferred Features (From v2)

| Feature                                    | Rationale for Deferral        | Trigger to Revisit                                  |
| ------------------------------------------ | ----------------------------- | --------------------------------------------------- |
| Property-based + fuzz tests                | Setup overhead > current risk | After 2+ production-like bug reports in doc logic   |
| Metrics panel & structured instrumentation | Added complexity              | When manual profiling becomes repetitive            |
| Dual-run / feature flags                   | Overhead for solo dev         | Before large, risky schema overhaul                 |
| Quarantine & safe mode                     | Not critical early            | Encounter real-world corrupted imports              |
| Advanced undo intent taxonomy              | Basic batching suffices       | User UX friction / confusing history entries        |
| Memory caps & patch size metrics           | Small scale now               | History memory > reasonable threshold (e.g. > 10MB) |
| Subtree structural hashing                 | YAGNI at small scale          | Reconcile perf complaints or >10k nodes             |
| Worker offload                             | Premature                     | Main thread reconcile > 16ms consistently           |
| Security sandbox for macros                | No untrusted inputs now       | Accepting external/shared documents                 |
| Partial/merge import modes                 | Not needed initially          | User demand for selective import                    |
| Resource integrity placeholders            | Early complexity              | Actual broken resource references appear            |
| Formal schema governance doc               | Lightweight versioning fine   | Team growth / collaborator onboarding               |

---

## 15. Implementation Ordering Justification

Ordering minimizes rework: need schema + hash (Phase 1) before validation (2); need validated doc + funnel (3) before stable serialization (4); reconciler (5) relies on stable mutation semantics; UI separation (6) depends on reconciler & undo stable.

---

## 16. Quick Start (Developer Cheatsheet)

1. Create or load doc: `const doc = createEmptyDocument();`
2. Mutate via funnel:

```ts
applyDocMutation('move-element', (draft) => {
    const el = draft.elements.byId[id];
    el.x += 10;
});
```

3. Undo/Redo:

```ts
undo();
redo();
```

4. Serialize:

```ts
const json = serializeDocument(doc);
localStorage.setItem('project', json);
```

5. Deserialize:

```ts
const loaded = deserializeDocument(jsonString);
```

6. Reconcile happens automatically after `applyDocMutation` (wired in store).

---

## 17. Open Questions (Lightweight)

-   Do we anticipate external shared documents soon? (Impacts need for sandbox & quarantine.)
-   Maximum expected scale (tracks/elements) near-term? (Guides if subtree hashing needed.)
-   Need partial import earlier for user workflow? (If yes, reprioritize.)

---

## 18. Exit Criteria for v3 Adoption

-   All Phase 1–6 acceptance criteria satisfied with tests.
-   Legacy store references removed (or adapter still present but slated for deletion in next commit).
-   Manual profiling recorded once (baseline numbers captured).
-   Backlog documented (this file) and committed.

---

## 19. Future Upgrade Path (If/When Needed)

When scale or collaborative needs arise, reintroduce parts of v2: feature flags + dual-run for risky refactors, structured metrics, memory accounting for undo, subtree hashing, property-based fuzzing, safe-mode imports, sandboxing. This v3 document acts as the anchor reference for that expansion.

---

## 20. Summary

v3 captures the essential architecture with minimal ceremony: deterministic data core, controlled mutations, incremental runtime updates, and clear separation of ephemeral UI state. It trades early rigor for speed while keeping a clear, written map of what to add later when justified.
