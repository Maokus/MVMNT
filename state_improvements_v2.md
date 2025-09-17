# State Improvements v2: Phased Implementation Plan

Date: 2025-09-17

This v2 plan operationalizes the v1 design into concrete phases with acceptance criteria, risks, and validation steps. The objective is to decouple UI and document state, implement a patch-based undo engine for document data, and unify persistence via a document gateway.

---

## Phase 0 — Preparation and Baseline

Purpose: Establish guardrails and gather baselines to avoid regressions during the refactor.

Deliverables

-   Baseline unit/integration tests for current flows (export/import, simple undo/redo, timeline interactions).
-   Logged inventory of state fields that are UI-only vs document data.
-   Decision notes on initial assumptions (IDs, time units, default UI values).

Key Tasks

-   Identify all mutation points that currently touch the global store and classify them as UI or document mutations.
-   Snapshot existing persistence format examples (create 2–3 fixtures).
-   Ensure Vitest runs in CI/local and establish test watch.

Acceptance Criteria

-   You can run `Run NPM Test` and see all existing tests green.
-   A document listing mutation points and their classification exists in `docs/` or `state/` notes.
-   At least two persisted sample files are checked into `src/persistence/__tests__/__fixtures__/` (or equivalent) and used by tests.

Risks & Mitigations

-   Risk: Missing a mutation point. Mitigation: Grep for `set(`, `useStore.getState()`, and known action creators; add a test that asserts all writes go through typed APIs.

---

## Phase 1 — Store Segregation Scaffolding

Purpose: Introduce `documentStore` and `uiStore` without changing behavior.

Deliverables

-   `src/state/documentStore.ts`: skeleton with `doc`, `history` structure, and no-op methods wired to current state shape.
-   `src/state/uiStore.ts`: minimal UI state (playhead, timelineZoom, selection) with defaults.
-   Types for the gateway and history entries (`src/state/document/types.ts`).

Key Tasks

-   Create the two Zustand stores and export their hooks.
-   Define shared types: `DocumentState`, `HistoryEntry`, `PatchMeta`, `DocumentStateGateway`.
-   Add smoke tests to ensure stores initialize correctly and selectors work.

Acceptance Criteria

-   Importing and instantiating both stores doesn’t break the app (build succeeds).
-   Unit tests confirm default UI values and that `documentStore.doc` resembles the current document shape.
-   No components are migrated yet; feature behavior remains unchanged.

Risks & Mitigations

-   Risk: Type mismatches. Mitigation: Introduce minimal `DocumentState` type that mirrors current persisted shape; adjust incrementally later.

---

## Phase 2 — Patch-Based Undo Engine (Document Only)

Purpose: Implement patch-based history using Immer for the `documentStore`, and harden against mutation bypass (direct writes outside `commit`).

Deliverables

-   `commit`, `undo`, `redo`, and `replace` implemented using `produceWithPatches` and `applyPatches`.
-   Optional history cap setting (e.g., 200 entries).
-   Private document state held in a closure; no public `doc` field exposed on the store API. Provide read-only `getSnapshot()` and selectors only.
-   Dev-only runtime guard: `getSnapshot()` returns a frozen object (or Proxy) that throws on mutation attempts outside `commit`.
-   ESLint guardrails: `no-restricted-syntax` rules to forbid assignments to any `*.doc.*` path.

Key Tasks

-   Wire Immer with `enablePatches()` in `documentStore`.
-   Implement history stacks and metadata handling.
-   Encapsulate `doc` in the store closure; expose selectors and `getSnapshot()` only. In dev, wrap the snapshot with `Object.freeze` or a Proxy.
-   Add ESLint configuration to block direct writes to `doc` properties (see Appendix: Enforcement Details).
-   Add unit tests covering: commit creates entries, undo/redo applies patches, redo cleared on new commit, history cap trimming, and that direct mutation attempts throw in dev.

Acceptance Criteria

-   Tests verify that UI mutations (via `uiStore`) do not affect document history.
-   Undo/redo revert document changes exactly (deep-equal pre-state after inverse patches).
-   Loading via `replace` clears both past and future stacks.
-   The public store type does not expose a mutable `doc`. Consumers can only read via selectors or `getSnapshot()`.
-   Attempting to assign to any `doc` field triggers an ESLint error and throws at runtime in dev.

Risks & Mitigations

-   Risk: Mutations bypass `commit`. Mitigation: Enforce via private `doc` (closure), read-only snapshots with dev-time freeze/Proxy, and ESLint rules forbidding direct `doc` writes; tests verify guardrails.

---

## Phase 3 — Unified Document State Gateway

Purpose: Provide a single API for reading, replacing, applying patches, and (de)serializing document state.

Deliverables

-   `src/state/document/gateway.ts` implementing `DocumentStateGateway<D>`.
-   `src/persistence/document-serializer.ts` handling versioning and tolerant parsing.

Key Tasks

-   Implement `get`, `replace`, `apply`, `snapshot`, `serialize`, `deserialize`.
-   Create `DocumentSerializer` with current version (`"1"` or as defined) and mapping logic.
-   Add unit tests for snapshot and serialize/deserialize round-trip.

Acceptance Criteria

-   `export` and `import` can be implemented purely via the gateway API in tests.
-   Unknown/UI fields in input are ignored during `deserialize` (defensive parse).
-   `snapshot()` returns a deep clone not affected by subsequent mutations.

Risks & Mitigations

-   Risk: Version drift. Mitigation: Centralize version in one place and export the constant for use across modules.

---

## Phase 4 — Persistence Pipeline Switch-over

Purpose: Route save/load through the gateway and document serializer.

Deliverables

-   Updated `src/persistence/export.ts` and `src/persistence/import.ts` to use the gateway.
-   Stable stringification maintained.

Key Tasks

-   Refactor export to `gateway.serialize(doc)`; stringify via existing `stable-stringify`.
-   Refactor import to parse JSON, `gateway.deserialize`, and `useDocumentStore.getState().replace(doc)`.
-   Add tests: round-trip, legacy UI fields ignored, history cleared on load.

Acceptance Criteria

-   Old files load successfully; UI fields are ignored and not stored in the document.
-   After `importProject`, `undo` is a no-op and `redo` is empty.
-   Exported JSON contains only document data and a version field.

Risks & Mitigations

-   Risk: Hidden UI leakage into doc. Mitigation: Serializer strips such fields; tests cover representative legacy examples.

---

## Phase 5 — Migrate Callers to New Stores

Purpose: Move all mutations of persisted data to `documentStore.commit` and all UI to `uiStore`.

Deliverables

-   Updated components/hooks/actions to call the correct store APIs.
-   Centralized helpers for common document operations (e.g., addScene, moveElement).
-   Action-only API surface exported from a single module (e.g., `state/document/actions.ts`) that internally uses `commit`.
-   ESLint rules in place and passing across the codebase to prevent direct mutations of document state.

Key Tasks

-   Systematically refactor mutation points identified in Phase 0.
-   Provide thin action utilities that wrap `commit` with descriptive labels.
-   Replace all direct state writes with calls to the action-only API; forbid imports of the raw store setter outside action modules.
-   Update `UndoContext` (or equivalent) to source undo/redo state from `documentStore`.
-   Write integration tests that simulate mixed UI/document interactions.
-   Add a test that tries to directly mutate `doc` and asserts it fails lint in CI and throws in dev.

Acceptance Criteria

-   Moving playhead (UI) followed by changing a scene (doc) and pressing undo only reverts the scene change; playhead remains unchanged.
-   Redo restores the scene change without altering UI.
-   All document mutations route through `commit` (enforced by tests and lint rules). No file in `src/` contains an assignment to `*.doc.*`.
-   The only exported mutation entry points are action functions; attempting to import the store setter outside actions triggers a lint error.

Risks & Mitigations

-   Risk: Regression in complex flows. Mitigation: Introduce action-level tests and a short-lived feature branch for staged rollout.

---

## Phase 6 — Remove Legacy Snapshot-Based Undo

Purpose: Eliminate old global undo/redo pipelines and dead code.

Deliverables

-   Removal of legacy snapshot-based history and any global store coupling UI/doc state.
-   Cleaned contexts and providers.

Key Tasks

-   Identify and delete legacy undo logic; update providers to only expose document/UI stores.
-   Ensure keyboard shortcuts map to document undo/redo.
-   Finalize types and remove deprecated exports.

Acceptance Criteria

-   Build succeeds with no references to legacy undo.
-   Keyboard shortcuts perform document-only undo/redo in app.
-   Codebase search shows no references to old snapshot undo APIs.

Risks & Mitigations

-   Risk: Orphaned references. Mitigation: CI step greps for removed symbols; add a compilation error guard while removing.

---

## Phase 7 — Stabilization and Polish

Purpose: Improve UX and dev ergonomics; ensure performance bounds.

Deliverables

-   History size cap, optional action grouping, and simple developer logging hooks.
-   Optional: localStorage-backed UI preferences (separate from document persistence).

Key Tasks

-   Add `beginGroup`/`endGroup` or a debounced grouping mechanism for drags.
-   Implement a configurable history cap (default 200) with tests.
-   Lightweight logging: track action labels and history length in dev mode.
-   If desired, add opt-in UI preference persistence in `uiStore` only.

Acceptance Criteria

-   Grouped actions produce a single history entry during sustained drags.
-   When the cap is exceeded, oldest entries are dropped and tests confirm correctness.
-   No UI preferences leak into document exports.

Risks & Mitigations

-   Risk: Over-grouping hides meaningful steps. Mitigation: Keep grouping opt-in and scoped to specific interactions.

---

## Cross-Phase Quality Gates

-   Build: `Run NPM Build` passes at the end of each phase.
-   Lint/Typecheck: No new type errors introduced by a phase.
-   Tests: `Run NPM Test` green, with new tests added per phase.
-   Smoke: Manual check of core flows (open project, move playhead, edit scene, undo/redo, save/load).

---

## Tracking & Documentation

-   Update `docs/ARCHITECTURE.md` with the new stores and persistence gateway once Phase 3 is complete.
-   Maintain a migration note outlining removed APIs and new entry points.
-   Keep `Acceptance Checklist` from v1 and mark items done as phases land.

---

## Rollback Strategy

-   Each phase is mergeable independently. If a phase regresses, revert the phase’s commits and keep earlier phases intact.
-   Persistence changes are backward compatible; serializer tolerates unknown fields.

---

## Appendix: Enforcement Details (Mutation Bypass Guards)

Goal: Ensure all document mutations go through the `commit` API and action modules.

Programmatic Patterns

-   Private doc state: Keep `doc` in a closure within `documentStore.ts`. Expose selectors and `getSnapshot()` only; no public mutable `doc` field.
-   Read-only snapshots: In dev, return `Object.freeze(structuredClone(doc))` or a Proxy that throws on `set`.
-   Action-only API: Export mutations exclusively from `state/document/actions.ts`, which internally call `useDocumentStore.getState().commit(...)`.
-   Ban raw setter imports: Do not export the store `set` function; if needed, wrap it inside the actions module only.

ESLint Guards (example)
Add to `.eslintrc.cjs` or `.eslintrc.json`:

```js
module.exports = {
    rules: {
        // Disallow direct writes to any `.doc.*` property
        'no-restricted-syntax': [
            'error',
            {
                selector: "AssignmentExpression[left.property.name='doc']",
                message: 'Do not assign to doc; use commit via actions.',
            },
            {
                selector: "AssignmentExpression[left.object.property.name='doc']",
                message: 'Do not mutate doc.*; use commit via actions.',
            },
        ],
        // Optionally forbid importing the store directly except from action modules
        'no-restricted-imports': [
            'error',
            {
                paths: [
                    {
                        name: 'src/state/documentStore',
                        importNames: ['useDocumentStore'],
                        message: 'Import document actions instead of the raw store in UI code.',
                    },
                ],
                patterns: [
                    {
                        group: ['**/state/documentStore'],
                        message: 'Import document actions instead of the raw store in UI code.',
                    },
                ],
            },
        ],
    },
};
```

Dev-time Proxy example (optional)

```ts
const createFrozenSnapshot = <T>(obj: T): T => {
    if (import.meta.env?.DEV) {
        return new Proxy(structuredClone(obj), {
            set() {
                throw new Error('Direct mutation of doc is not allowed; use commit via actions');
            },
            deleteProperty() {
                throw new Error('Direct mutation of doc is not allowed; use commit via actions');
            },
        });
    }
    return structuredClone(obj);
};
```

Tests

-   Unit: Attempt to mutate the snapshot in dev and assert it throws.
-   Lint: Include a fixture or sample that would violate the rule and assert it fails in CI.
-   Integration: Ensure all document changes in the app flow route through action functions.
