# State Improvements v2: Phased Implementation Plan (Undo/Persistence Abstraction + Store Segregation)

    Roll out changes incrementally by phase; validate with tests and smoke checks.

Date: 2025-09-17

This plan turns the v1 design into an actionable, phased rollout with concrete tasks, acceptance criteria, tests, and rollback considerations per phase.

## Executive Summary

-   Introduce a unified Document State Gateway used by both undo/redo and import/export.
-   Replace snapshot-based undo with patch-based document-only history.
-   Roll out behind an optional feature flag for safe, incremental adoption.

## Scope and Non-Goals

## Architecture Delta (at a glance)

    -   `src/state/document/gateway.ts`
    -   `src/persistence/document-serializer.ts`
    -   `src/state/documentStore.ts`

-   Updated:
    -   `src/context/UndoContext.tsx` to call documentStore undo/redo
-   Removed (Phase 5+): legacy snapshot-based undo and coupled UI fields in persisted document shape.

## Quality Gates (applies to every phase)

-   Build: `npm run build` succeeds.
-   Tests: `npx vitest --watch false` green; new tests added for the phase.

## Phase 0 — Readiness & Feature Flag

-   Add env flag plumbing (opt-in): `VITE_DOC_STORE_V1` (bool).
-   Create type shells and interfaces (no wiring):
-   Write a stub `gateway` implementation that simply defers to current structures (no behavior change when flag is off).
-   Document flag usage in `README.md` or a short `docs/STATE_MIGRATION.md` section.

-   App runs with and without `VITE_DOC_STORE_V1` set; behavior unchanged when off.
-   CI green with no runtime regressions.

-   Build and test pass.
-   Quick smoke run with flag off and on; code paths gated and safe (on still uses legacy).

Rollback

-   Remove/ignore the flag; no production behavior depends on it yet.

Purpose: Add the two stores alongside current state. Do not cut over yet.

-   Implement `src/state/documentStore.ts` with structure only: `{ doc, history: { past: [], future: [] } }` and placeholder `commit/undo/redo/replace` that internally still rely on current doc state (no callers yet).
-   Add selectors and minimal utils for both stores.
-   Update a single non-critical UI component to read `playhead` from `uiStore` behind the flag, defaulting to legacy source when flag is off.
-   Both stores exist and export types.
-   When flag is on, one read-only consumer uses `uiStore` without changing user-visible behavior.
-   No undo/redo changes yet; still snapshot-based.
    Tests

-   Unit: `uiStore` default values and simple setters.

-   Build/test pass; application behaves identically.

Rollback

-   Disable flag to route the single consumer back to legacy state.

## Phase 2 — Patch-Based Undo Engine in `documentStore`

Tasks

-   Add optional history cap (e.g., 200) and `meta.label` support.
-   Ensure history clears on `replace`.
-   Add pure unit tests under `src/**/__tests__` to validate patch correctness and history behavior.

-   Unit tests prove that `commit` generates patches and `undo/redo` restore exact prior states.
-   History cap respected if configured.

-   Document-only undo/redo cycle with multiple commits.
-   Ensure redo stack clears after new commit.

Validation

-   None required; code path is unreferenced by UI.

---

## Phase 3 — Gateway + Serializer Wiring; Persistence Pipeline Update

-   Implement `src/state/document/gateway.ts` exporting a concrete `gateway` that:
    -   `get`, `replace`, `apply`, `snapshot` delegate to `documentStore` methods.
-   Implement `src/persistence/document-serializer.ts` for the current `DocumentState` shape:
    -   `version = '1'` initially.
    -   `toPersisted` removes any UI-like/unknown fields defensively.

Acceptance Criteria

-   Old files (fixtures) with UI fields load and ignore those fields.

Tests

-   Unit: serialize/deserialize round-trip deep-equal.
-   Unit: `replace` after load clears history.

Validation

-   Build/test pass. Manual smoke: export then import produces identical visuals.

Rollback

## Phase 4 — Cut Over Undo/Redo UI to `documentStore`; Start Moving Callers

Purpose: Make the app use the new document-only undo/redo; begin migrating mutations to `commit` and UI reads to `uiStore`.

-   Identify a minimal but representative set of document mutations (e.g., scene rename, element transform) and refactor them to use `useDocumentStore.getState().commit(draft => { ... }, { label })` behind the flag.
-   Move additional UI readers: timeline playhead, zoom, selection to `uiStore` (reads only initially), guarded by the flag.
-   Add action labels in commit calls for better history readability.
-   With flag on: undo/redo only affects document changes; UI state (playhead/zoom/selection) does not undo.
-   With flag off: unchanged behavior (snapshot-based undo remains).
-   No missing updates in UI after migrated commits.

-   Unit/Integration: Perform a document change, then change UI state, then undo -> document reverts, UI unchanged.
-   Unit: redo restores document change, UI still unchanged.
    Validation
-   Manual: drag/move element then move playhead; undo should revert element only.
-   Build/test pass.

Rollback

-   Turn flag off to return to legacy undo and legacy mutations.

Purpose: Complete migration of all document mutations to `commit` and UI reads/writes to `uiStore`. Remove legacy snapshot-based undo and any UI fields from document shape.

Tasks

-   Remove legacy snapshot-based undo logic and old combined store couplings.
-   In serializer, remove any temporary compatibility branches not needed for current version; keep legacy import upgrade paths.
-   Add history cap configuration and ensure it’s applied globally.

-   All document writes go through `commit`; no direct mutation bypasses.
-   All UI state lives in `uiStore` and is never serialized.
-   Persistence contains document data only; imports ignore legacy UI fields.

Tests

-   Repo-wide search proves no remaining calls to legacy undo or direct document mutations.
-   Performance: no noticeable regression during heavy edits with history cap enabled.

Validation

---

Tasks

-   Add optional action grouping utilities: `beginGroup/endGroup` or a coalescing helper for drag operations.
-   Consider minimal UI preferences persistence via `localStorage` for `uiStore` (optional).

Acceptance Criteria

-   Unit: grouped commits appear as single history entry (if grouping implemented).
-   Smoke: history size capped and reported; no memory blowups during extended sessions.

Validation

-   Build/test pass; developer experience feedback addressed.

Rollback

-   Disable grouping/telemetry via flags if they cause issues.

---

## Test Matrix Summary (What must be green by Phase)

-   P0: Build and baseline tests; flag toggling safe.
-   P1: Store init and UI read-only consumer.
-   P2: Patch history semantics (unit tests only).
-   P3: Serialize/deserialize round-trip; legacy file import with UI fields ignored; replace clears history.
-   P4: Document-only undo/redo from UI; UI state unaffected by document history.
-   P5: All callers migrated; no legacy undo calls; integration flows.
-   P6: Grouping/telemetry (optional) and docs.

## Risks and Mitigations

-   Hidden direct mutations bypassing `commit`: mitigate via code search, typed APIs, and tests that assert history changes on operations.
-   Shape drift between serializer and in-memory doc: mitigate with round-trip tests and fixtures for legacy imports.
-   Performance overhead from patches: cap history; group actions; measure during drags.
-   Large refactor surface: phased rollout with feature flag and partial cutovers.

## Rollout Strategy

-   Keep `VITE_DOC_STORE_V1` off by default until the end of Phase 4.
-   Enable in staging/beta environments; gather feedback.
-   After Phase 5 stability, flip the default on and plan one minor release focused on stabilization (Phase 6).

## Acceptance Checklist (End-to-End)

-   [ ] UI and document stores exist and are used by respective features.
-   [ ] Undo/redo stack is patch-based and affects document only.
-   [ ] Save/load uses the gateway and contains document data only.
-   [ ] Old files load correctly; UI fields ignored.
-   [ ] All callers migrated; no legacy undo remains.
-   [ ] Tests (unit + integration) green and stable.
-   [ ] Developer docs updated; history cap and optional grouping in place.
