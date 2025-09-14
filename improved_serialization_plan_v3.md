# Serialization & Undo System Plan (V3 – Pragmatic MVP First)

> Goal: Ship reliable save/load + basic undo fast, then iterate only when real usage shows need.

---

## 0. Philosophy Shift (From V2 to V3)

| Principle     | V2 Bias                    | V3 Adjustment                          |
| ------------- | -------------------------- | -------------------------------------- |
| Scope         | Comprehensive foundation   | Ruthless minimal core                  |
| Undo          | Patch/command architecture | Snapshot ring buffer (upgrade later)   |
| Migration     | Rule engine                | None (not needed yet)                  |
| Validation    | Tiered system early        | Fatal-only first, expand later         |
| Integrity     | Hashing + sections         | Defer (optional later)                 |
| Resources     | Structured index           | Inline for now, add section later      |
| Performance   | Pre-optimized design       | Measure first, optimize only if needed |
| Extensibility | Fully reserved hooks       | Reserve only what’s cheap now          |

---

## 1. Success Criteria (MVP / Phase 1)

Must have:

-   Deterministic round-trip (export → import → export === structurally equal)
-   (No legacy load required — greenfield only)
-   Undo/redo supports last N (configurable, default 50) meaningful state changes
-   Average snapshot capture < 25ms for typical scenes (< 2k elements)
-   No data loss across 100 undo/redo stress cycles in tests

Nice later (NOT required for MVP): hashing, diff-based undo, resources section, advisory validation, command squashing, performance dashboards.

---

## 2. Minimal Envelope (V1-Lite)

```jsonc
{
    "format": "mvmnt-scene",
    "schemaVersion": 1,
    "metadata": {
        "id": "scene-uuid",
        "name": "Untitled",
        "createdAt": "ISO",
        "modifiedAt": "ISO"
    },
    "scene": {
        /* elements + settings */
    },
    "timeline": {
        /* pruned timeline state */
    },
    /* no migration metadata (greenfield) */
    "compatibility": { "warnings": [] }
}
```

Rules (MVP):

-   Omit: `resources`, `integrity`, `macros`, `flags`, `extensions`, any migration metadata
-   Keep `compatibility.warnings` as a simple string array (future structure later)
-   Element ordering: stable by `(z ASC, type ASC, id ASC)`
-   Track ordering: use existing `tracksOrder` from store (no computed sorting)

---

## 3. Undo Strategy (Snapshot v1)

### Rationale

-   90% usability with 10% complexity
-   Zero risk of incorrect inverse operations
-   Fast to ship; defers inventing a patch language

### Design

-   Ring buffer: fixed-length array (default 50, max 100 configurable)
-   Each entry: `{ stateJSON: string, size: number, timestamp }`
-   Capture policy:
    -   After any state-changing action (Zustand subscribe + shallow inequality gate)
    -   Debounce high-frequency changes (e.g. pointer drag) with a 40–60ms trailing timer
    -   Skip if serialized JSON unchanged from previous (string compare)
-   Redo stack cleared on new mutation (standard model)
-   Memory cap (soft): estimate total bytes (sum of `stateJSON.length`), if over threshold (e.g. 10MB) drop oldest

### API

```ts
interface UndoController {
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
    clear(): void;
    getDepth(): { undo: number; redo: number };
}
```

Implementation detail: A lightweight wrapper around the root Zustand store; rehydrate by `set(JSON.parse(entry.stateJSON), true)` (replace mode).

### Upgrade Path (Undo v2 – Deferred)

When needed: introduce command+patch pipeline; co-exist behind feature flag; migration one-way (snapshot history discarded).

---

## 4. Migration (Intentionally Deferred)

Early development: all saved scenes originate from this version; no legacy inputs exist.

Policy:

-   Do NOT build migration scaffolding now.
-   Add a migration layer only the moment a breaking schema change is introduced and at least one persisted scene exists in the wild.
-   When needed: start with a single `upgrade(raw)` function; only generalize after >2 historical versions.

Placeholder stub (future):

```ts
// export function upgrade(raw: any): CurrentEnvelope { return raw }
```

---

## 5. Validation (Stage 1)

Fatal only:

-   `format !== 'mvmnt-scene'`
-   Missing required top-level keys
-   Duplicate element IDs
-   Non-array where array expected
    Return `{ ok: boolean, errors: string[], warnings: string[] }` (warnings always empty in Phase 1 except from migration heuristics).

Stage 2 (later): Add recoverable + advisory tiers, unknown element placeholders.

---

## 6. Deterministic Serialization Utilities

Minimal helpers:

```ts
canonicalizeElements(elements: Element[]): Element[] // sort by z,type,id
serializeStable(obj: any): string // JSON.stringify with stable key order
```

Key ordering strategy: shallow stable sort of object keys recursively (cheap for expected depth). Only apply for final export, not for every snapshot.

---

## 7. Testing Strategy (Slim First, Grow Later)

Phase 1 Tests:

1. Round-trip: exported JSON deep-equal after re-import + re-export (ignoring `modifiedAt`).
2. Element ordering deterministic under shuffled input.
3. Undo cycle: 75 random mutations -> full undo -> state equals initial.
4. Snapshot throttle: rapid 30 incremental drags produce ≤ N snapshots (expectation ~5–8 depending on debounce window).
5. Memory guard: simulate large states; verify eviction of oldest snapshots when over byte limit.

Deferred Tests (later phases): golden fixture hash, performance benchmarks, patch invertibility fuzz.

---

## 8. Phased Rollout Roadmap (Lean)

| Phase | Goal                             | What Ships                                       | Flag                          | Exit Criteria                                |
| ----- | -------------------------------- | ------------------------------------------------ | ----------------------------- | -------------------------------------------- |
| 1     | Core persistence + snapshot undo | Minimal schema, exporter/importer, undo ring     | `SERIALIZATION_V1`            | Round-trip + undo tests green                |
| 2     | Hardening                        | Validation warnings, golden fixtures, more tests | Same                          | Stable golden; no regressions 2 weeks        |
| 3     | Optional perf + polish           | Profiling, memory metrics, scene size guidance   | `SERIALIZATION_PROFILING`     | Metrics dashboard baseline                   |
| 4\*   | (Conditional) Patch undo         | Command+patch engine, diff impl                  | `UNDO_V2_PATCH`               | Demonstrated memory pressure OR feature need |
| 5     | Ecosystem                        | `resources` section, integrity hashing           | `SERIALIZATION_RESOURCES`     | Resource dedupe working                      |
| 6     | Advanced validation              | UnknownElement, advisory taxonomy                | `SERIALIZATION_VALIDATION_V2` | Import resilience proven                     |

\*Phase 4 only if snapshot memory > target or domain ops require semantic diffs.

---

## 9. Out-of-Scope (Explicitly Deferred)

-   Multi-user / real-time collaboration
-   Integrity hashing (SHA-256) until Phase 5
    -- Migration logic / version upgrade pathways
-   JSON patch format, move ops, batch squashing
-   Incremental streaming / chunking
-   Telemetry pipelines (basic counters can start later)
-   Cross-session undo persistence

---

## 10. Minimal Module Layout (Phase 1)

```
src/persistence/
  index.ts               // public API
  export.ts              // exportScene(state)
  import.ts              // importScene(json)
    /* migrate.ts (not needed yet) */
  validate.ts            // validateEnvelope()
  ordering.ts            // canonicalizeElements()
  stable-stringify.ts    // serializeStable()
  undo/
    snapshot-undo.ts     // createSnapshotUndoController(store)
  __tests__/
    roundtrip.test.ts
    undo.test.ts
    /* migration.test.ts (deferred; no legacy) */
    ordering.test.ts
```

(Only add folders when a file exceeds ~250 lines or concern diversifies.)

---

## 11. Implementation Sequence (Task-Level)

1. Scaffold folder & public API surface (feature-flag guard).
2. Implement `canonicalizeElements` + test.
3. Implement basic export (pull from stores, order elements, stable stringify for final output only).
4. Implement basic import (parse -> validate -> inject into store).
5. Add snapshot undo controller and wire into store subscription with debounce.
6. Write Phase 1 test suite.
7. Add feature flag integration & fallback to no-op save (if flag disabled).
8. Internal dogfood (manually export/import multiple scenes, verify stability).
9. Tighten tests (edge cases: empty scene, large element arrays, duplicate IDs rejection).

---

## 12. Feature Flags (Naming & Behavior)

-   `SERIALIZATION_V1`: Enables new export/import path + snapshot undo. Off => existing behavior (no regression to legacy loader if not present, just disabled save or placeholder warning).
-   `SERIALIZATION_PROFILING`: Adds console metrics (serialize ms, size bytes, undo depth peak).
-   Future flags per roadmap table.

Flag implementation: Simple environment or build-time constant injection (e.g. `import.meta.env.VITE_FEATURE_*`). Avoid runtime flag objects until multiple flags accumulate.

---

## 13. Metrics to Capture (When Profiling Enabled)

-   Serialize duration (ms, median + P95 via in-memory ring)
-   Serialized size (compressed vs raw length if gzip lib already present; else raw only)
-   Undo snapshot count + cumulative byte size
-   Dropped snapshot count due to eviction

No permanent storage; dev console / debug panel only until product need surfaces.

---

## 14. Upgrade Path Notes

| From             | To                | Action                                                                      |
| ---------------- | ----------------- | --------------------------------------------------------------------------- |
| Snapshot undo    | Patch-based undo  | Discard snapshot stacks; start capturing patches once flag flips            |
| V1-lite schema   | V1+resources      | Add `resources` section on export; importer tolerates absence               |
| Basic validation | Tiered            | Extend `validateEnvelope` to emit warnings; consumers ignore unknown fields |
| No migrations    | Introduce upgrade | Add `upgrade(raw)` only when a breaking schema change is released           |

---

## 15. Risk Matrix (MVP-Focused)

| Risk                                       | Impact                     | Likelihood | Mitigation                                                                                                       |
| ------------------------------------------ | -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Memory spikes (large scenes)               | OOM / perf jank            | Low-Med    | Snapshot byte cap + max depth                                                                                    |
| Non-deterministic ordering                 | Hash churn, diffs noisy    | Med        | Ordering test + stable stringify limited to export                                                               |
| Undo debounce too aggressive               | Lost fine-grain undo steps | Med        | Tune window; provide test ensuring minimal step capture                                                          |
| Early schema change without migration      | Potential scene breakage   | Low        | Adopt "no breaking change" rule until upgrade layer added; add upgrade only when first break needed              |
| Hidden perf cost of stringify per snapshot | Latency                    | Low        | Snapshot store state structurally (clone) and only stringify upon capture; measure cost, optimize if > threshold |

---

## 16. Exit Checklist (Phase 1)

-   [ ] New export/import behind `SERIALIZATION_V1`
        (Migration support intentionally absent in Phase 1)
-   [ ] Undo ring buffer working (manual + automated tests)
-   [ ] 6 core tests green (round-trip, ordering, migration, undo cycle, debounce, memory cap)
-   [ ] Documentation comment in `index.ts` summarizing API
-   [ ] No TypeScript errors; bundle size delta < 3% (approximate quick check)

---

## 17. API (Draft)

```ts
// index.ts
export { exportScene } from './export';
export { importScene } from './import';
export { createSnapshotUndoController } from './undo/snapshot-undo';
export type { UndoController } from './undo/snapshot-undo';
```

---

## 18. Fast Follow Candidates (After Phase 1 Ship)

1. Add warning-level validation for stale references.
2. Add `resources` section if duplication metrics exceed threshold.
3. Basic size & duration perf instrumentation.
4. Investigate patch-based undo only if: snapshot memory > 15MB typical OR need selective partial replays.

---

## 19. Summary

V3 trims abstraction weight, front-loads user-visible value (reliable save/load + undo), and intentionally defers sophisticated mechanisms until justified by data. This reduces initial time-to-ship and risk while preserving clear upgrade on-ramps.

---

## 20. Next Immediate Action

Implement Phase 1 Step 1–3 (scaffold + ordering + export) under feature flag.
