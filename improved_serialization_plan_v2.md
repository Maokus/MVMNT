# Serialization & Undo System Plan (V2)

## 0. Purpose & Scope

A cohesive, forward-compatible scene persistence and real-time undo/redo system that:

-   Enables stable save/load across versions
-   Supports partial, patch-based updates (future live-collab baseline)
-   Offers deterministic, testable round-trips
-   Integrates an efficient, memory-bound undo stack using structured patches
-   De-risks rollout via feature flags and progressive validation

Non-goals (for V2): real-time multi-user sync, binary diff compression, remote persistence.

Success Metrics:

-   <150ms serialize for 95th percentile typical project (≤5k elements, ≤50 tracks) on M1
-   <25ms average undo/redo latency
-   Zero data-loss regressions in migration tests
-   100% round-trip fidelity on golden scenes
-   <5% bundle size increase (gz) relative to pre-feature baseline

---

## 1. Key Gaps in Previous (Improved) Plan

| Area                            | Gap                 | Impact                          | Resolution in V2                                          |
| ------------------------------- | ------------------- | ------------------------------- | --------------------------------------------------------- |
| Deterministic ordering          | Not enforced        | Hash / diff instability         | Canonical sort (by type, stable IDs)                      |
| Element IDs                     | Not formalized      | Undo patch ambiguity            | Enforce UUIDv4 (or nanoid) stable IDs                     |
| Resource references             | Only implied        | Duplication & broken refs later | Optional `resources` index section                        |
| Partial loading                 | Not addressed       | Slow large scene workflows      | Structured sections + lazy hydration hooks                |
| Validation tiers                | Single parse        | Hard failures for soft issues   | Three-tier: fatal / recoverable / advisory                |
| Error taxonomy                  | Generic warnings    | Poor UX, hard to triage         | Enumerated codes (e.g. `E-ELEM-TYPE-UNKNOWN`)             |
| Undo strategy                   | Absent              | Feature blocked                 | Command + structural patch hybrid                         |
| Patch representation            | Not designed        | Inefficient undo                | JSON-Patch inspired minimal patch format                  |
| Timeline pruning                | Not explicit        | Bloat & noise                   | Explicit whitelist of timeline keys                       |
| Migration metadata              | Only `migratedFrom` | Insufficient audit              | Full `migration` history array                            |
| Performance profiling           | Not in plan         | Regressions undetected          | Bench harness + perf budget gates                         |
| Golden files                    | Not mentioned       | Drift risk                      | Check-in canonical fixtures                               |
| Streaming / chunking            | Omitted             | Large scene memory spike        | Future-reserved `chunks` key; design now, implement later |
| Checksum/integrity              | Hand-wavy           | Silent corruption risk          | SHA-256 per logical section optional                      |
| Concurrency safety              | Ignored             | Race hazards (undo vs save)     | Serialization read barrier / freeze snapshot              |
| Extensibility of element schema | Ad-hoc              | Hard migrations                 | Namespaced `extensions` object                            |

---

## 2. Guiding Principles

1. Determinism over cleverness
2. Additive evolution; never re-interpreting old semantics
3. Explicit boundaries: scene vs timeline vs macros vs resources
4. Prefer describing structure (IDs, relations) over hidden inference
5. Undo uses domain operations, falls back to state patches
6. Validation fails fast for corruption; degrades gracefully for unknown extensions
7. Everything testable in isolation; no global singletons in core logic

---

## 3. Schema Overview (Envelope v1)

```jsonc
{
    "format": "mvmnt-scene",
    "schemaVersion": 1,
    "metadata": {
        "id": "scene-uuid",
        "name": "My Scene",
        "createdAt": "2025-01-01T12:00:00.000Z",
        "modifiedAt": "2025-01-01T12:34:56.000Z",
        "createdWith": { "appVersion": "1.4.0", "serializationVersion": "1.0.0" }
    },
    "flags": { "experimental": [] },
    "resources": {
        "fonts": [{ "id": "font:inter:400", "family": "Inter", "weight": 400 }],
        "images": [{ "id": "img:logo", "src": "assets/logo.png" }]
    },
    "scene": {
        "settings": {
            /* existing scene settings pass-through */
        },
        "elements": [
            {
                "id": "elem-uuid",
                "type": "NoteCluster",
                "z": 10,
                "config": {
                    /* domain-specific */
                },
                "bindings": [
                    /* existing binding objects */
                ],
                "extensions": {
                    /* namespaced future data */
                }
            }
        ],
        "extensions": {}
    },
    "timeline": {
        "state": {
            "timeline": {
                /* pruned timeline root */
            },
            "tracks": {
                /* enabled tracks only */
            },
            "tracksOrder": ["track-1", "track-3"],
            "transport": { "loopEnabled": true, "loopStart": 0, "loopEnd": 12000, "playhead": 5421 },
            "meta": { "frameRate": 60 }
        }
    },
    "macros": {
        "data": {
            /* existing macro export */
        }
    },
    "migration": { "history": [], "migratedFrom": null },
    "integrity": {
        "sections": {
            "scene.elements": "sha256-...",
            "timeline.state": "sha256-..."
        },
        "algorithm": "sha256",
        "optional": true
    },
    "compatibility": { "warnings": [], "errors": [] }
}
```

Deterministic ordering rules:

-   `elements` sorted by `(z ASC, type ASC, id ASC)`
-   Object key canonicalization before hashing (stable stringify)
-   Track iteration stable: `tracksOrder` supplies order; `tracks` map keys must match

---

## 4. Undo / Redo Architecture

### 4.1 Model

Layers:

-   Command Layer: semantic operations (`AddElement`, `DeleteTrack`, `MovePlayhead`)
-   Patch Layer: normalized structural diff produced from command application
-   History Stack: ring buffer storing `{ commandMeta, forwardPatch, inversePatch, timestamp, batchId }`

### 4.2 Patch Format (inspired by JSON Patch, constrained subset)

```ts
interface PatchOpAdd {
    op: 'add';
    path: string;
    value: any;
}
interface PatchOpRemove {
    op: 'remove';
    path: string;
    oldValue?: any;
}
interface PatchOpReplace {
    op: 'replace';
    path: string;
    value: any;
    oldValue: any;
}
interface PatchOpMove {
    op: 'move';
    from: string;
    path: string;
}
interface PatchOpBatch {
    op: 'batch';
    ops: PatchOperation[];
}
```

Rules:

-   Paths use `/section/...` root segments: `/scene/elements/3/z`
-   Batches used for gesture or multi-step atomic UI actions
-   Inverse patch auto-derived; commands may supply hints for optimization

### 4.3 Command Interface

```ts
interface UndoableCommand<C = any> {
    id: string; // stable semantic name
    context?: C; // serialized minimal context
    apply(state: Draft<AppState>): void | PatchOperation[]; // Immer draft or returns custom ops
    describe(): string; // human readable (UI)
    squash?(next: UndoableCommand): UndoableCommand | null; // coalescing
}
```

### 4.4 Integration With Stores

-   Wrap Zustand store creator: produce immutable snapshot for command application using Immer
-   After apply: generate diff via structural compare (custom shallow+path diff) OR accept explicit ops
-   Push to history if command mutated state (non-empty patch)
-   Provide `undo() / redo()` applying inverse/forward patches without re-running commands

### 4.5 Performance & Memory Strategies

-   Ring buffer max ops (configurable, default 200)
-   Size-based eviction (estimate JSON length of stored patches)
-   Patch compression pass: merge adjacent replace ops on same path
-   Debounce coalescing for high-frequency actions (drag) (e.g. 50ms idle)

### 4.6 Serialization Interaction

-   Undo stack NOT persisted by default (Phase 4 option: session persistence)
-   Commands produce schema-compliant mutations only; diff generation references canonical ordering
-   Optional debug: export patch log sidecar for test repro

---

## 5. Migration & Compatibility Strategy

Detection pipeline:

1. Raw shape sniff (legacy heuristic)
2. Try parse with current schema (Zod)
3. If fails: run ordered migration rules returning upgraded object then re-validate

Migration Rule Format:

```ts
interface MigrationRule {
    id: string; // e.g. MIG_2025_01_ADD_ELEMENT_IDS
    test(data: any): boolean;
    apply(data: any): any; // must not mutate input
    effect: 'structural' | 'annotation' | 'normalization';
}
```

Order: deterministic array. Each applied rule appends to `migration.history` with `{ id, at, fromVersion }`.

Forward-compat reserved extension points:

-   `scene.extensions`, `elements[].extensions`, `timeline.state.meta`, `resources.*` arrays
-   Unknown keys under `extensions` are retained & hashed

Validation Tiers:

-   Fatal: missing envelope keys, wrong `format`, duplicate element IDs
-   Recoverable: unknown element `type` (converted to `UnknownElement` placeholder stub), missing optional resource (warn)
-   Advisory: unused resource references, suspicious timing values

---

## 6. Implementation Phases & Acceptance Criteria

### Phase 1: Foundation (Schema & Modules)

Deliverables:

-   `src/persistence/` module scaffold
-   Zod schemas for envelope + sections
-   Deterministic sort utilities & stable stringify
-   Basic `ScenePersistence.export()/import()` with legacy migration stub
    Acceptance Criteria:
-   Round-trip (export->import->export) hash stable on sample scenes
-   Legacy mock object imports succeed producing `migration.history` entry
-   Unit tests: schema validation (≥15 cases)

### Phase 2: Timeline & Resource Integration

Deliverables:

-   Pruned timeline serializer (whitelist keys)
-   Resource collection pass (scan elements for font/image refs)
-   Integrity hashing (opt-in flag) implementation
-   Canonical fixtures (golden JSON) committed
    Acceptance Criteria:
-   Resource dedupe works (no duplicate IDs)
-   Integrity hashes verify; tampering test fails with fatal error
-   Golden file diff test passes (no spurious churn)

### Phase 3: Undo Core Engine

Deliverables:

-   Core command interface & history manager
-   Patch diff generator with add/remove/replace
-   Integration wrapper for Zustand timeline & scene stores
-   Basic commands: AddElement, UpdateElementConfig, MoveElementZ, DeleteElement, TransportSeek
    Acceptance Criteria:
-   Undo/redo cycle stable across 200 sequential ops (fuzz test)
-   Average undo latency <25ms (benchmark harness)
-   Coalescing merges rapid position drags into ≤10 history entries

### Phase 4: Advanced Undo Features & Patches

Deliverables:

-   Batch operations + gesture API
-   Command squashing infrastructure
-   Move / reorder track operations (using move op)
-   Patch log export (dev flag)
    Acceptance Criteria:
-   Complex drag (simulate 120 intermediate moves) yields ≤8 history entries
-   All command types produce reversible patches (property-level equality check)
-   Patch log replay reproduces final state deterministically

### Phase 5: Migration Hardening & Error Taxonomy

Deliverables:

-   Full migration rule set for pre-envelope legacy structures
-   Error / warning codes + documentation map
-   Placeholder UnknownElement implementation
    Acceptance Criteria:
-   Import suite covers ≥8 legacy variants; all succeed
-   Unknown element preserved through round-trip (not dropped)
-   Error codes surfaced in UI adapter (mock) test

### Phase 6: Performance & Integrity

Deliverables:

-   Benchmark scripts (serialize ≈ scenes S/M/L, undo stress)
-   Patch compression & size-based eviction
-   Integrity section hashing toggle & config surface
    Acceptance Criteria:
-   Large scene (10k elements synthetic) serialize <800ms cold, <400ms warm
-   Undo memory bounded (<50MB at 200 ops synthetic worst case)
-   Compression reduces stored patch ops count ≥30% in drag benchmark

### Phase 7: Rollout & Feature Flag Sunset

Deliverables:

-   Dual serialization path with runtime equivalence assertion
-   Telemetry hooks (counts: export_new_success, migration_warning, undo_depth_peak)
-   Removal plan for legacy path (doc)
    Acceptance Criteria:
-   30-day bake: zero critical telemetry errors
-   Coverage: new serializer exercised in ≥90% test scenes
-   Flag removal PR prepared with risk checklist

---

## 7. Module Structure

```
src/persistence/
  index.ts
  schema/
    envelope.ts
    scene.ts
    timeline.ts
    resources.ts
    macros.ts
  util/
    canonical.ts
    hash.ts
    diff.ts
    ids.ts
  serializers/
    scene-serializer.ts
    timeline-serializer.ts
    resources-serializer.ts
  migrations/
    index.ts
    rules/
      legacy-envelope.ts
      add-element-ids.ts
  integrity/
    hasher.ts
  undo/
    history.ts
    command.ts
    patch.ts
    diff-engine.ts
    commands/
      add-element.ts
      update-element-config.ts
      move-element-z.ts
      delete-element.ts
      transport-seek.ts
  __tests__/
    fixtures/
      small.json
      medium.json
      large.json
```

---

## 8. Testing & Quality Strategy

### 8.1 Unit Tests

-   Schema parsing (valid/invalid, unknown extensions retained)
-   Deterministic ordering (shuffle input -> same hash)
-   Diff engine ops (add/remove/replace/move edge cases)

### 8.2 Integration Tests

-   Full scene export/import equivalence
-   Undo/redo multi-domain (elements + timeline)
-   Migration: legacy inputs -> envelope v1

### 8.3 Regression / Golden

-   Golden fixtures hashed & compared
-   Protected via CI: changes require `--update-goldens` explicit flag

### 8.4 Fuzzing

-   Random command sequences (seeded RNG) verify invariants
-   Random element config mutations ensure no orphan IDs

### 8.5 Performance Benchmarks

-   Scene size scaling: 100, 1k, 5k, 10k elements
-   Undo stress: 1k repeated property edits w/ coalescing

### 8.6 Observability

-   Optional debug channel logs: command applied, patch size
-   Telemetry counters (abstracted; no vendor lock)

---

## 9. Risk & Mitigation

| Risk                                       | Mitigation                                | Rollback Strategy                                           |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------- |
| Data loss in migration                     | Golden fixtures + dry-run mode            | Keep legacy import path for 2 versions                      |
| Performance regression                     | Bench harness gating PRs                  | Feature flag disabling hashing & integrity                  |
| Undo memory blow-up                        | Size-based eviction + compression         | Disable patch persistence; fallback to snapshot every N ops |
| Non-deterministic ordering                 | Canonical sort + hash test in CI          | Block merge if hash instability detected                    |
| Unknown future element types break import  | Placeholder element + warning             | Allow user to re-save without loss                          |
| Integrity hash mismatch false positives    | Mark integrity optional; verify algorithm | Graceful degrade to warning                                 |
| Complex commands produce incorrect inverse | Fuzz + invariants                         | Auto-disable offending command via kill-switch map          |

---

## 10. Rollout Plan Summary

1. Ship Phase 1 behind `ENABLE_NEW_SERIALIZATION=false`
2. Enable in dev channels; collect telemetry (Phase 2 done)
3. After Phases 3–4, dogfood undo internally; gather perf metrics
4. Harden migrations (Phases 5–6); run legacy corpus imports
5. Enable flag for beta users -> monitor
6. Sunset legacy; prune dead code (Phase 7)

---

## 11. Acceptance Checklist (Condensed)

-   [ ] Phase 1: Schema + Round-trip stable
-   [ ] Phase 2: Resources + Integrity + Golden fixtures
-   [ ] Phase 3: Undo core passes latency + fuzz
-   [ ] Phase 4: Advanced patches + batching
-   [ ] Phase 5: Migration suite green, error codes documented
-   [ ] Phase 6: Performance targets met
-   [ ] Phase 7: Telemetry bake & legacy removal ready

---

## 12. Next Immediate Actions

1. Scaffold folder + base schemas
2. Implement canonical ordering util + test
3. Legacy detector + migration stub
4. Basic export/import path under feature flag
5. Commit initial golden for a minimal scene

(Tracked via project board / issues mapping to phases.)

---

## 13. Future Extensions (Post V2)

-   Live collaboration OT/CRDT patch transport using same patch ops
-   Binary delta compression for large element batches
-   Incremental streaming save (chunked `elements` array) for very large scenes
-   Persistent undo log across sessions with pruning heuristics
-   Editor diff viewer using patch replay

---

This V2 plan formalizes schema determinism, structured undo, compatibility, and performance rigor—providing a stable foundation for future collaborative and real-time features.
