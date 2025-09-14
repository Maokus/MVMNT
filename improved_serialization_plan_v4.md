# Serialization & Undo System – Phased Implementation Plan (V4)

> Evolution of V3 plan converted into an execution playbook with explicit phases, tasks, ownership hints, acceptance criteria, exit gates, and rollback notes.

---

## Legend & Conventions

| Term | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| DoD  | Definition of Done (exit checklist for a task or phase) |
| AC   | Acceptance Criteria (objective, testable)               |
| NICE | Not In Core Execution (deferred / optional later)       |
| FLAG | Build-time feature flag (e.g. `SERIALIZATION_V1`)       |

Metrics units: `ms` = milliseconds wall clock (median of 5 runs unless stated), `B` = raw JSON string length in bytes (UTF-16 JS length _approx OK for MVP_).

---

## High-Level Phase Roadmap

| Phase | Flag(s)                       | Objective                                        | Primary Outcome                                    |
| ----- | ----------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| 0     | (none)                        | Prep + skeleton                                  | Folder scaffold + feature flag wiring stub         |
| 1     | `SERIALIZATION_V1`            | Core export/import + snapshot undo               | Deterministic round-trip + functional undo ring    |
| 2     | `SERIALIZATION_V1` (same)     | Hardening & validation (fatal + structure)       | Robust importer with clear errors + expanded tests |
| 3     | `SERIALIZATION_PROFILING`     | Lightweight performance & memory instrumentation | Visibility into costs (serialize time, sizes)      |
| 4\*   | `UNDO_V2_PATCH`               | (Conditional) Introduce patch-based undo path    | Memory reduction / semantic operations             |
| 5     | `SERIALIZATION_RESOURCES`     | Add `resources` section (dedupe)                 | Smaller scene size / resource reuse                |
| 6     | `SERIALIZATION_VALIDATION_V2` | Advisory + warning tier validation               | Resilient load w/ non-fatal issues                 |

\*Phase 4 only if snapshot memory pressure OR semantic diff need is demonstrated (metrics threshold defined in Phase 3).

---

## Phase 0 – Preparation & Skeleton

Objective: Lay minimal scaffolding so Phase 1 can focus purely on core logic.

### In Scope

-   Create `src/persistence/` structure per V3 layout.
-   Add `index.ts` with documented public API stubs.
-   Add feature flag detection utilities (`isFeatureEnabled(name)`).
-   Add placeholder tests file headers (empty bodies acceptable initially).

### Out of Scope

-   Actual logic (export/import/undo). - Any performance measurements.

### Tasks

1. Scaffold directories & blank modules (`export.ts`, `import.ts`, `ordering.ts`, `stable-stringify.ts`, `undo/snapshot-undo.ts`, `validate.ts`).
2. Implement no-op exports that throw or return a typed error if flag disabled.
3. Add `SERIALIZATION_V1` flag reading from `import.meta.env.VITE_FEATURE_SERIALIZATION_V1` (boolean cast).
4. Document API contract JSDoc in `index.ts` (inputs, outputs, error modes).
5. Add initial test placeholders referencing the functions (ensures TypeScript types compile).

### Acceptance Criteria (AC)

-   AC0.1: All new files exist, build succeeds (no TS errors).
-   AC0.2: Importing public API without flag does not crash (methods return defined disabled result / warning).
-   AC0.3: Unit test suite runs with zero failing tests (even if mostly placeholders).
-   AC0.4: Bundle size increase < 1% (scaffold only; visual inspection acceptable).

### Definition of Done (DoD)

-   Build + typecheck green.
-   `index.ts` has top-level doc comment summarizing future behavior & current disabled semantics.
-   Code merged behind feature flag (flag off by default).

### Rollback Strategy

Delete scaffold folder; no persisted data format yet adopted.

---

## Phase 1 – Core Persistence + Snapshot Undo (MVP)

Objective: Achieve deterministic export/import and functional snapshot-based undo ring.

### In Scope

-   Stable element ordering (`canonicalizeElements`).
-   Deterministic serialization (`serializeStable` used only at export boundary).
-   Export: envelope shape (schemaVersion:1, metadata, scene, timeline, compatibility.warnings[]).
-   Import: parse -> validate fatal-only -> hydrate store.
-   Snapshot undo controller (ring buffer, debounce, memory cap, redo semantics).
-   Feature flag gating (`SERIALIZATION_V1`).
-   Core tests (round-trip, ordering, undo cycle, debounce, memory cap basic mechanics).

### Out of Scope

-   Migration logic (stub only if needed for type).
-   Hashing / integrity sections.
-   Advisory validation; warnings only structure (array) but empty in practice.

### Detailed Tasks

1. Implement `ordering.ts`:
    - `canonicalizeElements(elements)` sorts by `(z ASC, type ASC, id ASC)`; stable for ties.
    - Add pure, no side-effect behavior (does not mutate input array).
2. Implement `stable-stringify.ts`:
    - Recursive stable key ordering (Object keys sorted lexicographically), arrays preserved.
    - Export `serializeStable(obj): string`.
3. Implement `export.ts`:
    - Gathers state from store (scene elements + timeline + metadata provider).
    - Applies ordering for elements only.
    - Fills metadata fields: `id` (existing scene id), `name`, `createdAt` (if absent set now), `modifiedAt` (now), `format`, `schemaVersion`.
    - Returns envelope object and (optionally) raw JSON string (two export functions or second util).
4. Implement `validate.ts` (Phase 1 rules):
    - Fatal if: missing required keys, wrong `format`, duplicate element IDs, expected arrays not arrays.
    - Return `{ ok, errors, warnings }` (warnings empty array always).
5. Implement `import.ts`:
    - Parse JSON -> structural validation -> if ok, replace relevant parts of store (replace mode set function).
6. Implement Undo Snapshot Controller (`undo/snapshot-undo.ts`):
    - Ring buffer (default depth 50, max configurable 100).
    - Entry shape `{ stateJSON, size, timestamp }`.
    - Debounced capture 50ms trailing (constant; later configurable) subscribed to store changes.
    - Skip capture if JSON identical to previous snapshot.
    - Memory soft limit 10MB (evict oldest until <= limit or only one left).
    - Public API per V3.
7. Wire controller creation at app init only if flag enabled.
8. Write tests:
    - Round-trip equality (ignore `modifiedAt`).
    - Ordering determinism (shuffle input 5x, exports equal arrays).
    - Undo cycle: N (≥ 60) random mutations revert to initial state.
    - Debounce: simulate rapid incremental updates; snapshot count within expected range (≤ 8 for 30 quick changes).
    - Memory cap: large state growth triggers eviction (verify oldest removed, depth maintained ≤ limit).
9. Documentation updates in `README.md` (short section “Scene Persistence (MVP)” summarizing API usage).

### Acceptance Criteria (AC)

-   AC1.1: Export → Import → Export (JSON parsed) is deep-equal ignoring `modifiedAt` across 5 randomized scenes.
-   AC1.2: Sorting test proves consistent ordering across ≥ 5 shuffles.
-   AC1.3: Undo can traverse full stack without divergence (final state deep-equal initial after full undo path in test).
-   AC1.4: Rapid mutation test (30 ops @ <10ms spacing) yields between 4 and 8 snapshots (configurable window constant).
-   AC1.5: Snapshot capture median time < 25ms for scene with 2k elements (measured in profiling harness or instrumented test).
-   AC1.6: Total snapshot memory limited; when exceeding 10MB with synthetic large states oldest entries removed (assert depth & byte sum ≤ threshold).
-   AC1.7: All tests green; no uncaught promise rejections.
-   AC1.8: No TypeScript errors; bundle size delta < 3% vs Phase 0 tag.

### Definition of Done (DoD)

-   All AC1.x satisfied and documented in test output summary or PR notes.
-   Feature flag default ON for internal builds (may remain OFF for prod until QA sign-off).
-   Basic developer docs committed.

### Rollback Strategy

-   Disable feature flag -> reverts application to pre-persistence behavior (export/import UI hidden or disabled message).

---

## Phase 2 – Hardening & Expanded Validation

Objective: Increase resilience & clarity of load failures while maintaining schema stability.

### In Scope

-   Extend validation: type checks for nested optional arrays, numeric ranges (if trivial), friendly error messages.
-   Add error codes enumeration (e.g. `ERR_FORMAT`, `ERR_DUP_ELEMENT_ID`).
-   Introduce structured `compatibility.warnings` population for non-fatal recoverables discovered (still minimal set).
-   Add more edge case tests (empty scene, huge element list, duplicate IDs rejected path, malformed JSON path).

### Out of Scope

-   Hashing, resources, migrations.

### Tasks

1. Add error code taxonomy & export type.
2. Refactor `validateEnvelope` to attach codes.
3. Expand tests for new validation branches.
4. Add developer docs: “Validation Matrix”.
5. Add safe-guard in importer: if fatal -> do not mutate store, return structured error result.

### Acceptance Criteria

-   AC2.1: All previous Phase 1 tests still green (regression safe).
-   AC2.2: New validation tests all pass (≥ 6 new cases).
-   AC2.3: Importing invalid data never mutates store (pre/post snapshot deep-equal).
-   AC2.4: Each fatal path returns at least one error code (non-empty).
-   AC2.5: Coverage for `validate.ts` ≥ 85% statements (if coverage infra exists; else manual reasoning documented).

### DoD

-   Validation documentation committed.
-   Regression suite green.

### Rollback

-   Revert `validate.ts` to Phase 1 version (single file) if instability found.

---

## Phase 3 – Profiling & Metrics (Optional Flag)

Objective: Provide internal visibility into performance & memory characteristics.

### In Scope

-   Add `SERIALIZATION_PROFILING` flag gate.
-   Lightweight instrumentation for: serialize duration, snapshot capture time, snapshot bytes, eviction count.
-   In-memory ring buffer of last 50 measurements with console summary function.
-   Dev-only tooling hook (e.g. `window.__mvmntPersistenceStats()`).

### Tasks

1. Instrument export function (time start-end around stable stringify / ordering steps).
2. Instrument snapshot capture (before & after JSON generation & push).
3. Add stats aggregator module.
4. Add manual test script describing how to read metrics.
5. Add threshold alert logs (e.g. capture > 40ms warn).

### Acceptance Criteria

-   AC3.1: With flag ON, metrics accessible via global hook and include at least 4 fields (durationMs, sizeBytes, undoDepthPeak, evictions).
-   AC3.2: With flag OFF, zero additional console noise (no warnings emitted).
-   AC3.3: Overhead with profiling ON increases median snapshot capture time by < 10% compared to OFF (manual measurement acceptable).

### DoD

-   Developer README section documenting profiling usage and thresholds for concern (e.g. memory > 15MB triggers Phase 4 consideration).

### Rollback

-   Remove instrumentation file references; core logic unaffected.

---

## Phase 4 – Conditional Patch-Based Undo (Only If Needed)

Objective: Reduce memory footprint or enable semantic operations if snapshot memory exceeds target or UX demands finer granularity.

### Trigger Criteria

-   Metrics show typical snapshot memory > 15MB for standard scenes OR need for partial selective undo emerges.

### In Scope

-   Parallel patch-based history pipeline with feature flag `UNDO_V2_PATCH`.
-   Maintain existing snapshot path for fallback (do not remove yet).
-   Introduce patch representation (narrow domain subset only: element property changes, additions, removals, ordering changes).

### Out of Scope

-   Complex move ops or macro command grouping (unless trivial to support base case).

### Tasks (High-Level)

1. Define minimal patch schema + apply/invert functions.
2. Capture patches at same subscription point (bypass debounce or separate config).
3. Add comparison tests vs snapshot approach for equivalence (apply patches reconstruct state identical to snapshots).
4. Memory benchmark test comparing average per-step bytes.
5. Feature flag gating + migration note: enabling patch discard existing snapshot history.

### Acceptance Criteria

-   AC4.1: Patch undo/redo passes same undo cycle tests as snapshot variant.
-   AC4.2: Average per-step memory reduction ≥ 40% vs snapshot median in benchmark test scene.
-   AC4.3: Toggling flag at startup (not runtime) selects strategy; no runtime errors.

### DoD

-   Strategy documented; fallback retains previous safety.

### Rollback

-   Disable flag; snapshot path intact.

---

## Phase 5 – Resources Section

Objective: Deduplicate large inline repeated assets into `resources` section to shrink scene size.

### Preconditions

-   Evidence (profiling) that inline duplication is material (≥ 10% total JSON size inflated).

### Tasks

1. Introduce `resources` section: `{ assets: { [hash]: { type, data, size } } }` (initial minimal shape).
2. Modify export to scan elements for large repeatable blobs (heuristic: string length > 256 or base64 prefix) & hoist.
3. Replace in-scene references with `{ $ref: hash }` structure.
4. Import resolves `$ref` recursively.
5. Add test: repeated asset appears once in resources; re-import resolves correctly.

### Acceptance Criteria

-   AC5.1: Round-trip still deterministic (ignoring `modifiedAt`).
-   AC5.2: Scene with 10 repeated large assets size reduction ≥ 60% vs Phase 1 export (synthetic test).
-   AC5.3: Import gracefully handles missing resource (fatal for Phase 1 style or warning depending on flag decision).

### DoD

-   Documentation updated describing resources mechanism.

### Rollback

-   Revert export hoisting logic; keep references inline.

---

## Phase 6 – Advanced Validation (Advisory Tier)

Objective: Provide non-fatal warnings and recoverability pathways.

### In Scope

-   Extend `compatibility.warnings` with structured shape `{ code, message, path }`.
-   Add unknown element placeholder insertion (instead of failure) when safe.
-   Stale references detection (e.g. timeline referencing removed element) -> warning.

### Tasks

1. Define warning codes taxonomy.
2. Implement placeholder injection (element with type `UnknownElement`, retains original id & minimal metadata for round-trip).
3. Expand tests: unknown element preserved through re-export; warnings emitted.
4. Update docs with validation tiers (fatal vs advisory).

### Acceptance Criteria

-   AC6.1: Importing scene with unrecognized element type no longer fatal; warning emitted; re-export retains original raw spec (lossless container if possible).
-   AC6.2: Stale reference detection produces warning without breaking playback state.
-   AC6.3: Round-trip with unknown elements yields structural equality of raw unknown payload section.

### DoD

-   Validation matrix updated; test suite green.

### Rollback

-   Disable `SERIALIZATION_VALIDATION_V2` flag; importer reverts to Phase 2 strict mode.

---

## Cross-Phase Quality Gates

| Gate          | Minimum Standard (applies each phase)                                        |
| ------------- | ---------------------------------------------------------------------------- |
| Type Safety   | Zero new TS errors / `strict` passes                                         |
| Tests         | 100% of added tests pass; no skipped critical tests                          |
| Lint          | No new lint violations for touched files                                     |
| Bundle Impact | < 3% increase phase-to-phase unless justified and documented                 |
| Docs          | API & behavior changes documented same PR                                    |
| Flags         | All new features behind explicit build flag default OFF unless internal-only |

---

## Metrics & Thresholds Summary (Driving Conditional Phases)

| Metric                     | Collected In | Threshold                   | Action Trigger                                 |
| -------------------------- | ------------ | --------------------------- | ---------------------------------------------- |
| Snapshot Memory Total      | Phase 3      | > 15MB typical              | Consider Phase 4 patch undo                    |
| Snapshot Capture Duration  | Phase 3      | > 25ms median               | Investigate optimization before Phase 4        |
| Scene Export Duration      | Phase 3      | > 40ms median               | Optimize ordering/stringify; potential caching |
| Resource Duplication Ratio | Phase 3      | > 10% bytes saved potential | Trigger Phase 5                                |

---

## Risk Matrix (Updated for Execution)

| Risk                                      | Phase Affected | Impact             | Mitigation                                       | Contingency                            |
| ----------------------------------------- | -------------- | ------------------ | ------------------------------------------------ | -------------------------------------- |
| Snapshot memory blow-up                   | 1,3            | Perf/Memory        | Byte cap + eviction                              | Fast-track Phase 4                     |
| Non-deterministic ordering regression     | 1+             | Tooling diff noise | Ordering test; stable stringify only at boundary | Add deterministic hashing test         |
| Validation false negatives                | 2              | Corrupt load       | Add targeted fixtures & codes                    | Hotfix tightening validation           |
| Patch undo complexity creep               | 4              | Delay              | Limit scope to element props; timebox design     | Abort Phase 4; revert to snapshot only |
| Resource hoist incorrect ref resolution   | 5              | Data loss          | Reference resolver tests; round-trip asserts     | Flag rollback to inline mode           |
| Unknown element handling leaks to runtime | 6              | Runtime errors     | Placeholder type guards                          | Disable advanced validation flag       |

---

## API Surface (Current + Planned Evolution)

```ts
// src/persistence/index.ts (Phase 1 baseline)
export { exportScene } from './export';
export { importScene } from './import';
export { createSnapshotUndoController } from './undo/snapshot-undo';
export type { UndoController } from './undo/snapshot-undo';

// Potential Phase 4 addition
// export { createPatchUndoController } from './undo/patch-undo';
```

---

## Test Suite Growth Map

| Phase | New Core Test Categories                                                 |
| ----- | ------------------------------------------------------------------------ |
| 0     | Compilation smoke (placeholders)                                         |
| 1     | Round-trip, ordering, undo cycle, debounce, memory cap                   |
| 2     | Validation error paths, duplicate IDs, malformed structures              |
| 3     | Performance harness (non-failing assertions, logs)                       |
| 4     | Patch equivalence vs snapshot, memory benchmark                          |
| 5     | Resource dedupe, missing resource failure, ref resolution                |
| 6     | Unknown element placeholder, stale reference warning, warning round-trip |

---

## Implementation Sequencing (Expanded Checklist)

1. Phase 0 tag (baseline).
2. Phase 1 PR(s): ordering -> stable stringify -> export/import -> undo -> tests -> docs.
3. Phase 1 stabilization (bug fixes only).
4. Phase 2 validation expansion PR.
5. Phase 3 instrumentation PR.
6. Data review & decision gate: need Phase 4 or 5 next? (metrics-driven).
7. Conditional Phase 4 or 5 implementation.
8. Phase 6 advanced validation once ecosystem impact observed.

---

## Roll Forward / Rollback Summary Table

| Phase | Roll Forward Step                        | Rollback Simplicity                                        |
| ----- | ---------------------------------------- | ---------------------------------------------------------- |
| 0     | Enable feature flag in dev               | Trivial (delete folder)                                    |
| 1     | Turn flag on prod after QA               | Simple (flag off)                                          |
| 2     | Keep same flag; ship stricter validation | Moderate (revert validate file)                            |
| 3     | Enable profiling flag for dev only       | Trivial (flag off)                                         |
| 4     | Opt-in patch flag for experiments        | High (dual paths maintained)                               |
| 5     | Enable resources flag after verification | Moderate (need migration if persisted scenes rely on refs) |
| 6     | Enable advanced validation flag          | Simple (flag off)                                          |

---

## Developer Quick Start (Phase 1 Usage)

```ts
import { exportScene, importScene, createSnapshotUndoController } from 'src/persistence';

// Create undo controller once after store is ready
const undo = createSnapshotUndoController(store, { maxDepth: 50 });

// Export current scene
const { envelope, json } = exportScene();

// Import a scene JSON string (validated)
const result = importScene(jsonString);
if (!result.ok) {
    console.error(result.errors);
}

// Undo / Redo in UI handlers
if (undo.canUndo()) undo.undo();
if (undo.canRedo()) undo.redo();
```

---

## Open Questions (Tracked but Deferred)

| Question                                    | Decision Needed By              | Current Stance                       |
| ------------------------------------------- | ------------------------------- | ------------------------------------ |
| Do we persist undo stack cross-session?     | After Phase 3 metrics           | Likely no (complexity > value early) |
| Use gzip/deflate for export download size?  | Before external sharing feature | Defer until size pain reported       |
| Hash-based integrity now or with resources? | Phase 5 planning                | Add with resources (hash reuse)      |

---

## Summary

This V4 implementation plan operationalizes the lean V3 strategy into discrete, testable phases with clear exit criteria, minimizing risk while preserving structured upgrade paths. Each conditional enhancement is gated by explicit metric thresholds, ensuring we only add complexity when justified by real usage data.
