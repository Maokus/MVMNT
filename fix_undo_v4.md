# Fix Undo v4: Phased Execution Blueprint with Verification & Rollback Paths

Supersedes: `fix_undo_v3.md` (keeps architecture; adds finer-grained phases, explicit acceptance criteria, console/debug verification paths, and rollback triggers.)

Core Goal (unchanged): All scene & canvas state mutations flow ONLY through document actions producing immer patches; runtime is a deterministic projection; every user-visible change is undoable/redoable with correct grouping & performance guarantees.

---

## 0. Reading Guide

Each phase includes:

1. Objective – why this phase exists.
2. Tasks – concrete actionable steps (pull-request scope candidates).
3. Deliverables – artifacts/code expected at completion.
4. Acceptance Criteria – measurable, testable outcomes.
5. Verification (Console / Debug UI) – how to manually validate without bespoke tooling beyond what’s added.
6. Metrics / Instrumentation – what to log or measure during / after the phase (temporary logs allowed – must be behind `isDev()` guard).
7. Rollback Strategy – minimal steps to revert if instability appears.
8. Dependencies – upstream phases required.

Where phases are logically batchable they’re labeled (Batchable). Suggested PR boundaries are noted; small PRs reduce regression risk.

---

## 1. Phase Index (High-Level Roadmap)

| ID  | Phase Title                                                   | Theme             | Batchable With | Primary Risk                                  | Exit Signal                                           |
| --- | ------------------------------------------------------------- | ----------------- | -------------- | --------------------------------------------- | ----------------------------------------------------- |
| P0  | Baseline Capture & Guard Rails                                | Foundation        | —              | Incomplete baseline test may hide regressions | Repro of known undo gap + baseline snapshot committed |
| P1  | Schema Dual-Write & Index Map                                 | Data Model        | P2             | Partial migration drift                       | All reads still work; map & order validated           |
| P2  | Patch Publication Hook (Commit Wrapper)                       | Events Core       | P1             | Missed emission edge cases                    | Patches observable in console for basic ops           |
| P3  | Minimal Projection Layer (Create/Remove/Reorder)              | Projection Init   | P2             | Desync risk                                   | Projection mirrors add/remove of 3 sample ops         |
| P4  | Projection Incremental Patch Application (Update paths)       | Projection Expand | P3             | Patch path mismatch                           | Updates reflect instantly; no full rebuild            |
| P5  | Drag Move Refactor (Action-Only)                              | Interaction       | P4             | Performance/jank                              | Single undo entry per drag; smooth FPS                |
| P6  | Scale / Rotate / Anchor Refactor                              | Interaction       | P5             | Grouping mistakes                             | Gestures grouped; values correct post-undo            |
| P7  | Scene Management Actions (Visibility, Order, Dup, Delete, ID) | Ops Expansion     | P6             | State drift                                   | All ops undo atomically                               |
| P8  | Multi-Select Bulk Update Action                               | Ops Expansion     | P7             | Patch explosion                               | Bulk action emits ≤ expected patches                  |
| P9  | Undo Provider Reactivity Overhaul                             | UI State          | P7             | Stale hotkeys                                 | UI reflects canUndo/canRedo changes live              |
| P10 | Performance Batching & Coalescing                             | Perf              | P9             | Over-batching skipping necessary frames       | Patch batch size & frame time logged                  |
| P11 | Property-Based & Stress Test Harness                          | Testing           | P10            | Flaky harness                                 | Deterministic seeds reproducible                      |
| P12 | Dev Debug Overlay & Assertions                                | Tooling           | P10            | Noise / perf overhead                         | Toggleable; negligible (<0.5ms) cost disabled         |
| P13 | Legacy Path & Array Removal                                   | Cleanup           | P12            | Residual references                           | Zero grep hits for old APIs                           |
| P14 | Documentation & Migration Finalization                        | Docs              | P13            | Outdated diagrams                             | Updated docs merged                                   |
| P15 | Final Regression & Success Metrics Audit                      | Closure           | P14            | Hidden edge regressions                       | All metrics @ targets                                 |

---

## 2. Cross-Cutting Conventions (Introduce Early – Referenced Later)

| Topic                     | Convention                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Dev Logging               | Wrap with `if (process.env.NODE_ENV === 'development')` or `isDev()` util.                     |
| Patch Listener API        | `subscribeDocumentPatches(fn: (patches, inverse, meta) => void)` returning unsubscribe.        |
| History Group Meta        | `{ label: string; gestureId?: string; startedAt: number }`.                                    |
| Debug Overlay Mount Point | A React portal mounted under `#debug-layer` (added once to `index.html` in dev).               |
| Console Helper            | `window.__undoDebug` object with curated commands (listed below).                              |
| Naming                    | Prefix temporary or dev-only modules with `_dev_` or place in `src/devtools/`. Removed at P13. |

### 2.1 Global Console Helpers (Added incrementally)

Will progressively expose:

```ts
window.__undoDebug = {
    dumpDoc: () => getDocumentSnapshot(),
    hist: () => getHistoryInfo(),
    lastPatches: () => getLastEmittedPatches(),
    startTrace: () => enablePatchTrace(),
    stopTrace: () => disablePatchTrace(),
    projection: () => getRuntimeProjectionDebug(),
    verify: () => runLightweightVerificationSuite(),
};
```

---

## 3. Detailed Phases

### P0 – Baseline Capture & Guard Rails

Objective: Establish reproducible baseline + failing test highlighting current undo deficiency.

Tasks:

1. Add integration test: create element → drag (continuous updates) → assert only final position reflected after undo/redo currently fails (document drift). Mark test `.skip` initially with TODO.
2. Add helper to snapshot current document & runtime state (`export baseline snapshots` under `__tests__/fixtures/`).
3. Add temporary logger: `setHistoryLogger` capturing commit events (patchCount, groupOpen/close, label).
4. Expose `window.__undoDebug.dumpDoc` & `hist`.

Deliverables: Baseline test file, snapshot fixtures, logging util, debug helpers.

Acceptance Criteria:

-   Baseline failing test reliably fails pre-refactor (document runtime mismatch). Evidence captured in PR description.
-   Console `__undoDebug.dumpDoc()` returns object with `scene.elements`.
-   History logger prints group boundaries for manual interactions.

Verification (Console / Debug):

1. Perform drag; observe multiple runtime changes but only one (or zero) undo entries pre-fix.
2. Run `__undoDebug.hist()` outputs counts `{ past, future, currentGroup? }`.

Metrics: Record average patches per gesture (likely 0 currently for drag). Store sample in PR notes.

Rollback: Simple (no invasive code). Revert test + logging additions if unstable.

Dependencies: None.

---

### P1 – Schema Dual-Write & Index Map

Objective: Introduce `elementsById` and `elementOrder` while preserving legacy array for reads.

Tasks:

1. Extend document schema type; adapt serializer/importer to populate new map & order when missing.
2. On store init: migrate existing `scene.elements` → map + order.
3. Update write actions (`addSceneElement`, `removeSceneElement`, `updateSceneElement`) to dual-write both structures; mark legacy writes with comment `// TODO remove P13`.
4. Add invariant dev check: `Object.keys(elementsById).length === elementOrder.length`.
5. Add console helper: `__undoDebug.verify()` includes schema invariants.

Deliverables: Updated schema, migration logic, dual-write actions, invariants, verify helper.

Acceptance Criteria:

-   All previous tests still pass.
-   `__undoDebug.verify()` returns `true`.
-   Lookup by id for 100 elements micro-benchmark (<1ms in dev) – logged once.

Verification:

1. Create ~5 elements; run `__undoDebug.dumpDoc().scene.elementOrder` length matches keys.
2. Manually remove element; verify map entry gone.

Metrics: Log time to add/remove 50 elements (loop) – baseline for later comparisons.

Rollback: Revert migration & dual-write blocks; no projection yet so low impact.

Dependencies: P0.

---

### P2 – Patch Publication Hook

Objective: Wrap commit pathway to emit immer patches & inverse patches for every state change.

Tasks:

1. Introduce `subscribeDocumentPatches` list & `emitDocumentPatches` inside store commit.
2. Add meta param support to actions (`{ label }`).
3. Extend history grouping to accumulate patches meta.
4. Console: `__undoDebug.lastPatches()` returns last non-empty patch array.
5. Add unit tests: each CRUD action produces expected patch op sequences.

Deliverables: Subscription API, meta piping, unit tests, console exposure.

Acceptance Criteria:

-   Adding element emits at least one `add` patch with path including `elementsById` & one order patch.
-   Updating element position emits `replace` patch for position keys only.
-   Undo/redo re-emit patches (or emission distinguished via meta flag `source: 'undo'|'redo'|'commit'`).

Verification:

1. Create element → run `__undoDebug.lastPatches()` to inspect.
2. Undo → inspect meta includes `source: 'undo'`.

Metrics: Patch counts per action logged (aggregated) – stored under `window.__undoDebug.stats`.

Rollback: Guard commit wrapper behind small feature toggle constant — revert if patch emission breaks tests.

Dependencies: P1.

---

### P3 – Minimal Projection Layer

Objective: Establish runtime projection skeleton syncing create/remove/reorder only.

Tasks:

1. Create `runtimeProjection.ts` with `createRuntimeProjection({ subscribe })`.
2. Maintain internal `nodes` map and `order` array; no per-property updates yet.
3. Apply patches: handle element add/remove; reorder on order patch; ignore others.
4. Provide dev assertion: if ignored patch path starts with `scene.elementsById` but not add/remove, log `UNHANDLED_UPDATE_PATCH (expected before P4)`.
5. Console: `__undoDebug.projection()` diff-checks doc vs projection (ids & order).

Deliverables: Projection module, subscription linkage, add/remove/reorder handling, console diff.

Acceptance Criteria:

-   Adding/removing elements updates projection in same tick (verify via console diff returns empty differences array).
-   Reordering action reflected in projection order.
-   No runtime direct mutations needed for these ops.

Verification:

1. Add 3 elements; check `__undoDebug.projection().order` equals document order.
2. Delete element; diff returns none.

Metrics: Log time per patch batch (should be <0.5ms) for these ops.

Rollback: Disable projection init – fall back to previous rendering path (still present). Re-enable after fix.

Dependencies: P2.

---

### P4 – Incremental Property Patch Application

Objective: Extend projection to apply property-level updates (position, rotation, scale, anchor, visibility, style if needed).

Tasks:

1. Implement `processPatch` with path routing: `scene.elementsById.<id>.<prop>`.
2. Maintain small dirty set to schedule render invalidation once per batch.
3. Handle element removal mid-batch gracefully (skip if node missing).
4. Map transform doc props -> runtime node fields.
5. Add unit tests for patch path → runtime update mapping (mock runtime node object with spies).
6. Remove the `UNHANDLED_UPDATE_PATCH` warning for handled props; warn only if truly unrecognized.

Deliverables: Expanded patch processor, tests, performance measurement.

Acceptance Criteria:

-   Moving element by updating `x` & `y` results in only those runtime fields changing (spy counts = 2; no full rebuild call executed).
-   Patch batches with 5 sequential position updates (artificial loop) apply once per frame (render scheduled once).

Verification:

1. Manually update element property through existing UI – confirm console patch count equals changed fields.
2. `__undoDebug.projection()` returns node with new coordinates.

Metrics: Average per-patch processing time <0.2ms (log aggregated min/avg/max every 50 batches in dev).

Rollback: Revert property routing code; projection still works for add/remove (P3 baseline).

Dependencies: P3.

---

### P5 – Drag Move Refactor (Action-Only Path)

Objective: Eliminate direct runtime mutation for move gestures; rely solely on grouped document updates.

Tasks:

1. Identify and remove calls to `sceneBuilder.updateElementConfig` or equivalent runtime mutators for MOVE.
2. Introduce `scheduleGroupedTransform(id, partialProps)` utility using rAF coalescing.
3. On pointerdown: open history group (`label: 'drag:move'`). On pointerup: finalize & end group.
4. Ensure final pointer position committed explicitly (final commit flush).
5. Add dev overlay panel: current active group, pending patch count, last frame apply duration.

Deliverables: New transform scheduling util, refactored interaction code, overlay initial version.

Acceptance Criteria:

-   A single undo entry corresponds to entire drag; intermediate frames not individually undoable.
-   Drag visual remains smooth (no visible stutter) across typical usage (manually validated).
-   Console: `__undoDebug.hist()` after drag shows past length incremented by 1.

Verification:

1. Start drag, observe overlay indicates `group:drag:move active`.
2. While dragging, run `__undoDebug.lastPatches()` – shows position patch for current frame.
3. After undo, element returns to start position exactly (numeric equality).

Metrics: Frames per second approximate (use `performance.now()` deltas in overlay). Log worst frame time.

Rollback: Feature flag the new scheduler; revert to legacy callsites if severe regression; do NOT remove projection code.

Dependencies: P4.

---

### P6 – Scale / Rotate / Anchor Refactor

Objective: Apply same grouped action-only architecture to scale, rotate, anchor adjustments.

Tasks:

1. Replace mutation calls with `scheduleGroupedTransform` reusing group if already active (multi-property updates share group).
2. Coalesce property changes inside pending map (only latest frame matters for scale/rotate/anchor during gesture).
3. Finalize on pointerup with authoritative numeric values (snapped if applicable).
4. Add gesture meta: `gestureId` incremental for debugging multi-gesture sequences.

Deliverables: Updated interaction handlers, extended scheduler (supports multiple properties), updated overlay (lists coalesced properties this frame).

Acceptance Criteria:

-   Each gesture for scale/rotate/anchor creates exactly one history entry.
-   Undo precisely restores pre-gesture transform (no drift > floating tolerance 1e-6 for rotations & scales).

Verification:

1. Perform rotate; run `__undoDebug.lastPatches()` – should include changed `rotation` only (or minimal set).
2. Mixed gesture (rotate then scale keeping pointer down if UI supports) still yields single group.

Metrics: Average patches per gesture <= number of frames (expected). Provide count distribution in console summary.

Rollback: Re-enable legacy handlers individually (keep scheduler for move only) until stable.

Dependencies: P5.

---

### P7 – Scene Management Actions (Visibility, Order, Duplicate, Delete, ID Change)

Objective: Migrate remaining scene operations to document-first actions; ensure atomic undo.

Tasks:

1. Refactor visibility toggle to set element property via action.
2. Reorder: implement action adjusting `elementOrder` with patch emission.
3. Duplicate: create new element entry + order insertion; include meta linking new id to source for debug.
4. Delete: remove from map + order; confirm selection update occurs in separate patch group or same (choose atomic single group).
5. ID Change: implement safe rename (reinsert under new key) patch sequence; update order & selection references.
6. Add unit tests per action verifying correct patch op list.

Deliverables: Refactored actions, tests, meta data for duplication, id change safety.

Acceptance Criteria:

-   Each operation produces a single undo entry (except multi-select reorder which can be grouped deliberately later).
-   After ID change, subsequent property updates reference new id only (no traces of old id).

Verification:

1. Duplicate element; run undo → element removed; redo → element returns with identical transform.
2. Change id; console verify `elementsById[oldId]` undefined, `elementsById[newId]` defined.

Metrics: Patch counts per operation recorded (expected small fixed set).

Rollback: Temporarily keep old implementations under `legacy/` folder for quick swap until P13.

Dependencies: P6.

---

### P8 – Multi-Select Bulk Update Action

Objective: Provide efficient grouped update for multiple selection transforms / property edits.

Tasks:

1. Add `updateSceneElements(ids: string[], mutator)` producing aggregated patches.
2. Optimize patch emission: combine identical property changes across ids if feasible? (Optional optimization skipped initially; rely on natural per-element patches.)
3. Use in multi-select operations (e.g., align, batch position adjustments, visibility toggles for selection).
4. Add test: random subset update → undo restores all.

Deliverables: Bulk action + tests + updated interaction code.

Acceptance Criteria:

-   Bulk change generates one history entry.
-   Undo restores all changed elements; no partial drift.

Verification:

1. Select 3+ elements; perform batch change; run `__undoDebug.lastPatches()` – shows patches referencing each id.
2. Undo/redo retains pre-change relative differences.

Metrics: Record patch count / element; ensure linear complexity.

Rollback: Replace usages with per-element loop (performance regression acceptable temporarily).

Dependencies: P7.

---

### P9 – Undo Provider Reactivity Overhaul

Objective: Ensure `canUndo` / `canRedo` + keyboard shortcuts always reflect latest history state.

Tasks:

1. Replace stale closure pattern: use store selectors & `getState()` inside key handlers.
2. Add test simulating sequence of operations verifying reactive toggling.
3. Overlay: show current history depth & active group label.

Deliverables: Updated provider, tests, overlay enhancement.

Acceptance Criteria:

-   After finalizing a gesture, `canUndo` becomes true within same tick (React state update frame).
-   After undoing all, `canUndo` false, `canRedo` true.

Verification:

1. Perform series of gestures; watch overlay counters update live.
2. Console run `__undoDebug.hist()` after each undo step verifying counts.

Metrics: None critical; log toggling latency if desired (<1 frame).

Rollback: Restore previous provider implementation.

Dependencies: P8.

---

### P10 – Performance Batching & Coalescing

Objective: Optimize patch application & commit scheduling for long gestures.

Tasks:

1. Implement micro-batching queue: gather all commits within same rAF before projection apply.
2. Detect excessive frame cost (>12ms) → skip non-final transform commit (adaptive throttle).
3. Coalesce sequential property updates same frame: last-writer-wins per element per property.
4. Add benchmarks (dev only) generating synthetic 5s drag (simulate 300 frames) measuring average apply time.

Deliverables: Batching queue, adaptive throttle logic, benchmark script, overlay metrics (frame time avg/p95, patch batch size).

Acceptance Criteria:

-   5s synthetic drag average frame time <16ms p95.
-   Patch count reduced vs naive per-move (baseline from P5) – documented improvement.

Verification:

1. Run synthetic benchmark: console prints summary object.
2. Real drag remains visually identical to earlier phases.

Metrics: Frame time, batch size distribution, skipped frame count.

Rollback: Disable batching (feature flag). Keep patch emission intact.

Dependencies: P9.

---

### P11 – Property-Based & Stress Test Harness

Objective: Ensure robustness under randomized operation sequences.

Tasks:

1. Introduce lightweight property-based test using e.g. `fast-check` (add dev dep) or custom generator if policy restricted.
2. Generators: random sequence of operations (add/remove/update/duplicate/reorder/transform) with constraints (never remove nonexistent id).
3. After sequence: undo all → expect initial snapshot deep-equal.
4. Redo all → expect final snapshot deep-equal to post-sequence state.
5. Add seed logging for reproducibility.

Deliverables: Property-based test suite (`__tests__/undo.property.test.ts`), seed reproduction docs.

Acceptance Criteria:

-   100 random sequences (configurable) pass consistently (zero flakiness).
-   Seeds for any failure (if occurs) logged clearly.

Verification:

1. Run test locally; inspect summary.
2. Optionally expose `__undoDebug.runFuzz(n, seed?)` to execute subset in browser.

Metrics: Track operations per second; ensure runtime acceptable (<5s for 100 sequences dev machine).

Rollback: Mark property test as skipped if causing instability; treat harness code as additive only.

Dependencies: P10.

---

### P12 – Dev Debug Overlay & Assertions Expansion

Objective: Provide richer insight and enforce developer constraints.

Tasks:

1. Expand overlay: show active gesture, last patch batch size, ignored patch count, projection version.
2. Add assertion: direct runtime node mutation outside projection (freeze nodes in dev via `Object.freeze`).
3. Provide toggle: `localStorage.setItem('debug.undoOverlay','1')` to enable persistently.
4. Add memory usage sampling (approx element & history entry counts) every 5s.

Deliverables: Overlay enhancements, mutation guard, memory sampling logic.

Acceptance Criteria:

-   Attempting to mutate runtime node field directly in console throws in dev.
-   Overlay hidden by default; enabling via localStorage persists across refresh.

Verification:

1. Try `projection().nodes[id].x = 999` – expect error/warn in dev.
2. Enable overlay; confirm metrics update live.

Metrics: Memory (approx object counts) visible in overlay.

Rollback: Remove freeze calls quickly if they cause third-party lib conflicts.

Dependencies: P11.

---

### P13 – Legacy Path & Array Removal

Objective: Remove dual-write + legacy runtime mutation APIs.

Tasks:

1. Delete `scene.elements` writes; migrate readers to map (grep + codemod if needed).
2. Remove legacy mutation utilities & feature flags.
3. Clean up TODO comments referencing removal.
4. Ensure serializer/exporter no longer emits/accepts deprecated array (or still accepts but normalizes silently – document behavior).

Deliverables: Clean schema, removed legacy code, updated types.

Acceptance Criteria:

-   Codebase grep for `scene.elements` returns 0 hits outside migration/compat code (if retained for import only).
-   All tests pass unchanged.

Verification:

1. Build & run; execute `__undoDebug.verify()` returns true.
2. Import old document format – auto-migrated success.

Metrics: None specific.

Rollback: Reintroduce thin compatibility wrapper re-populating array from map (avoid if possible).

Dependencies: P12.

---

### P14 – Documentation & Migration Finalization

Objective: Update architectural docs; provide onboarding guidance for new devs.

Tasks:

1. Add `docs/UNDO_ARCH_V4.md` summarizing final architecture & projection contract (update from v3 spec).
2. Update `ARCHITECTURE.md` & existing undo docs to reference projection & map-based schema.
3. Add README section: Debug commands & overlay usage.
4. Provide a concise “Adding a new element property” checklist.

Deliverables: New/updated docs, README changes.

Acceptance Criteria:

-   Docs reflect final API names; no references to removed legacy elements array.
-   New property checklist validated by mock addition example (doc snippet compiles conceptually).

Verification:

1. Manually cross-check doc code blocks with actual symbol names.
2. Run linter – no stale imports in docs typed examples (if type-checkable).

Rollback: N/A (documentation). Revisions easily applied.

Dependencies: P13.

---

### P15 – Final Regression & Success Metrics Audit

Objective: Confirm all success metrics (from v3 spec) achieved; produce closure report.

Tasks:

1. Run full test suite + property tests + performance benchmark.
2. Capture metrics snapshot JSON (frame times, patch apply latency, memory usage estimates) checked into `docs/metrics/` (dev only acceptable).
3. Draft success summary referencing Section 16 metrics table (updated here if differing).
4. Remove any remaining dev logging noise not behind flags.

Deliverables: Metrics JSON, summary doc section, cleaned logs.

Acceptance Criteria:

-   All originally stated success targets met or exceeded (see refreshed table below).
-   Zero console warnings during standard workflow with overlay disabled.

Verification:

1. Perform scenario script: add -> move -> rotate -> duplicate -> reorder -> delete -> undo all -> redo all (no divergent state).
2. Confirm memory stable after 200 gestures (history cap enforced).

Metrics: Final numbers recorded; included in closure note.

Rollback: If a regression discovered, open targeted bug phase (P15.x) before release freeze.

Dependencies: P14.

---

## 4. Updated Success Metrics (Inherit from v3)

| Category     | Metric                                             | Target                    |
| ------------ | -------------------------------------------------- | ------------------------- |
| Functional   | Undo coverage (operations)                         | 100% of listed operations |
| Consistency  | Drift incidents (manual QA + automated)            | 0                         |
| Performance  | Avg transform patch apply                          | <0.2ms                    |
| Latency      | Drag frame time p95                                | <16ms                     |
| Memory       | History cap 200 enforced                           | Never exceeds cap         |
| Dev Velocity | Add new property end-to-end                        | <10 mins                  |
| Reliability  | Property-based stress failures after stabilization | 0                         |

Instrumentation endpoints (dev helpers) must produce these metrics on demand: `__undoDebug.stats()` returning aggregated counters & averages.

---

## 5. Risk Checkpoints

| Phase | Key New Risk                            | Early Detection Signal              | Mitigation Action                                     |
| ----- | --------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| P1    | Map/array divergence                    | `verify()` false                    | Halt & fix before P2                                  |
| P3    | Projection desync                       | Diff shows missing id               | Add missing patch handler before P4                   |
| P5    | Jank on drag                            | Overlay frame p95 > 16ms            | Introduce throttle sooner (pull P10 micro-logic)      |
| P7    | Atomicity failure for complex ops       | Undo leaves partial duplicates      | Wrap ops in explicit group & retest                   |
| P10   | Over-throttling skipping final accuracy | End position mismatch               | Force final commit flush on pointerup                 |
| P11   | Fuzz flakiness                          | Inconsistent pass/fail across seeds | Log failing seed; reduce randomness scope temporarily |
| P13   | Residual legacy refs                    | Grep hits remain                    | Block merge until removed                             |

---

## 6. Rollback Matrix (Summary)

| Phase | Rollback Window    | Mechanism                         | Data Migration Impact                   |
| ----- | ------------------ | --------------------------------- | --------------------------------------- |
| P1    | Short              | Revert schema commit              | None (map derived from array)           |
| P2    | Short              | Disable patch emitter             | None                                    |
| P3    | Medium             | Disable projection init           | None (runtime fallback)                 |
| P4    | Medium             | Revert property routing           | None                                    |
| P5-P6 | Medium             | Re-enable legacy runtime mutators | Potential transient desync (acceptable) |
| P7-P8 | Medium             | Restore legacy ops modules        | None (map preserved)                    |
| P9    | Short              | Revert provider changes           | None                                    |
| P10   | Short              | Disable batching flag             | None                                    |
| P11   | N/A                | Skip tests                        | None                                    |
| P12   | Short              | Remove freezes                    | None                                    |
| P13   | Low (post-cleanup) | Recreate array from map           | One-time regeneration                   |

---

## 7. Pull Request Strategy

Aim for ≤ 400 LOC net change per PR (excluding tests) where practical. Include a brief checklist in each PR description:

```
PR Checklist
[ ] Phase ID referenced (e.g., P4)
[ ] Added / updated tests
[ ] Dev logs guarded
[ ] Console helpers updated (if applicable)
[ ] Rollback notes verified
```

---

## 8. Example Console Session (Midway – After P6)

```
> __undoDebug.dumpDoc().scene.elementOrder
['a1','b2']
> start a drag on 'a1'
Overlay: group=drag:move patchesThisFrame=1 frame=8.2ms
> __undoDebug.lastPatches().map(p=>p.path.join('/'))
['scene','elementsById','a1','x']
> release pointer
Overlay: group idle
> __undoDebug.hist()
{ past: 3, future: 0, currentGroup: null }
> undo
> redo
> __undoDebug.verify()
true
```

---

## 9. Adding a New Element Property (Post-Completion Cheat Sheet)

1. Add to `SceneElement` type & initialize in serializer/importer defaults.
2. Include in patch → projection routing switch (single line field assignment).
3. Provide UI action – must call `updateSceneElement(id, draft => { draft.newProp = value; }, { label:'edit:newProp' })`.
4. Add unit test: update -> undo -> redo path.
5. (Optional) Add to overlay display for live changes (debug only).

---

## 10. Completion Definition (v4)

The Undo system refactor is considered COMPLETE when all of the following hold:

1. Phases P0–P15 all marked done in project tracking.
2. All success metrics (Section 4) met.
3. No direct runtime mutations outside projection (enforced by dev assertions; zero violations during manual QA).
4. Legacy array path removed (Section P13) with importer backward compatibility.
5. Property-based tests pass 100 consecutive seeds locally and in CI.
6. Documentation reflects final architecture (Section P14 deliverables merged).
7. Closure report (P15) committed with metrics snapshot.

---

## 11. Appendices

### A. Patch Path Reference (Target After P6)

| Path Pattern                           | Meaning           | Projection Handling              |
| -------------------------------------- | ----------------- | -------------------------------- | ----------------------- |
| `scene.elementsById.<id>` (add/remove) | Element lifecycle | Create/remove runtime node       |
| `scene.elementsById.<id>.x             | y`                | Position                         | Update transform fields |
| `scene.elementsById.<id>.scaleX        | scaleY`           | Scale                            | Update scale fields     |
| `scene.elementsById.<id>.rotation`     | Rotation          | Update rotation                  |
| `scene.elementsById.<id>.anchorX       | anchorY`          | Anchor                           | Update pivot/anchor     |
| `scene.elementsById.<id>.visible`      | Visibility toggle | Show/hide node                   |
| `scene.elementOrder`                   | Z-order           | Rebuild order array / depth sort |

Unrecognized `scene.elementsById.<id>.<prop>` → dev warning until intentionally ignored or handled.

### B. Suggested File Additions

| File                                          | Purpose                        |
| --------------------------------------------- | ------------------------------ |
| `src/runtime/runtimeProjection.ts`            | Projection implementation      |
| `src/state/patchSubscription.ts`              | Patch pub/sub utilities        |
| `src/interaction/scheduleGroupedTransform.ts` | Gesture scheduler              |
| `src/devtools/undoOverlay.tsx`                | Overlay component              |
| `src/devtools/undoConsole.ts`                 | Attaches `__undoDebug` helpers |
| `__tests__/undo.property.test.ts`             | Property-based harness         |
| `docs/UNDO_ARCH_V4.md`                        | Final architecture summary     |

### C. Lightweight Verification Suite (Console `verify()`)

Checks performed:

1. Map/order length parity.
2. No orphan ids (order entries all exist in map).
3. Projection (if initialized) node id set matches document id set.
4. No active history group left open (internal flag false).
5. Latest patch batch (if any) non-empty implies history updated (unless inside group).

Returns boolean; logs failing reasons.

---

Prepared: 2025-09-19

Authoring Rationale: Provide actionable, testable increments enabling continuous integration without large risky merges while guaranteeing observability & rollback at each step.
