# State Architecture Plan – Version 2

## Executive Summary

Version 1 of the plan establishes a solid directional shift (document vs UI store, reconciler, patch-based undo). However, it leaves gaps in: measurable success criteria, failure modes, migration safety, performance budgets, observability, concurrency preparedness, rollback strategy, schema governance, and operational risk mitigation. Version 2 tightens these areas with explicit contracts, KPIs, risk matrix, lifecycle states, and guardrails to ensure the architecture evolves sustainably and is testable at each stage.

---

## Section A – Critical Weaknesses in v1 (Gap Analysis)

| #   | Category                    | Weakness / Missing Detail                                                     | Consequence                    | Mitigation in v2                                                               |
| --- | --------------------------- | ----------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| 1   | KPIs                        | No concrete performance budgets (serialize, reconcile, undo)                  | Undetected regressions         | Define numeric budgets + CI perf smoke tests                                   |
| 2   | Memory                      | No cap formula for patch history / object retention                           | Memory bloat & GC churn        | Memory accounting + soft/hard caps, adaptive pruning                           |
| 3   | Schema Governance           | Version bump rules & deprecation policy unspecified                           | Ad‑hoc migrations & drift      | Formal SemVer-like schema discipline + migration registry                      |
| 4   | Reconciler Diff Strategy    | Only conceptual diffing; no algorithmic complexity target                     | Accidental O(N) per change     | Define complexity target (O(C) where C = changed nodes) + structural hash spec |
| 5   | Undo Semantics              | Drag batching defined but not formalized (time window, action classification) | Inconsistent UX                | Explicit batching contract + classification table                              |
| 6   | Error Handling              | Corrupt / malicious document recovery strategy absent                         | User data loss risk            | Structured Result<T,Err[]> + repair heuristics + quarantine flag               |
| 7   | Observability               | No instrumentation (counts, timings, patch size, reconciliation cycles)       | Blind spots; perf regressions  | Metrics bus + dev console panel hooks                                          |
| 8   | Testing Depth               | Lacks mutation-fuzzer, property-based invariants, large scale soak tests      | Hidden edge-case failures      | Add property-based tests + synthetic scale harness                             |
| 9   | Rollout Strategy            | No incremental adoption / feature flag plan                                   | Big bang risk                  | Dual-write bridge + feature flags + progressive migration steps                |
| 10  | Concurrency / Future Collab | No forward compatibility for multi-actor editing                              | Costly retrofit later          | Reserve op metadata fields + conflict policy scaffold                          |
| 11  | ID Collisions               | No collision detection / reuse policy                                         | Subtle bugs (stale references) | Central ID allocator + runtime assertion & uniqueness index                    |
| 12  | Determinism                 | Deterministic ordering mentioned but not enforced / hashed                    | Non-reproducible bugs          | Canonical ordering function + structural hash spec & tests                     |
| 13  | Security / Trust            | Unsandboxed imported macros / bindings risk                                   | Potential code injection       | Validate macro types; no executable code in document; runtime sandbox          |
| 14  | Progressive Migrations      | Single migrate function only                                                  | Complex upgrades fragile       | Composable pipeline: detect → multi-step elevate → validate                    |
| 15  | Partial Imports             | No partial merge strategy (import subset)                                     | Users forced to full replace   | Introduce merge import mode & conflict strategy                                |
| 16  | Resource Integrity          | Fonts/media references unvalidated                                            | Broken runtime after load      | Resource registry + validation pass + missing placeholder strategy             |
| 17  | Timestamp Policy            | Only modifiedAt update guidance vague                                         | Drift & noise                  | Debounced commit boundary + monotonic guard                                    |
| 18  | Dev Ergonomics              | No lint/ES rules to stop doc mutation in runtime                              | Inadvertent coupling returns   | ESLint rule + freeze proxy in dev                                              |
| 19  | Failure Recovery            | No safe-mode load path                                                        | Crashes block document access  | Safe-mode open (skip reconcile, show repair report)                            |
| 20  | Export/Import Compatibility | Legacy pipelines unspecified                                                  | Broken integrations            | Adapter layer + deprecation schedule                                           |

---

## Section B – Core Principles (Augmented)

1. Purity Boundary: Document store remains a pure CRDT-ready POJO graph; runtime & UI are projections only.
2. Determinism: Same input document → identical structural hash & serialized string (byte-for-byte except whitespace tolerance policy).
3. Minimal Diff Propagation: Reconciler processes only affected nodes; unaffected runtime references remain identity-equal.
4. Explicit Mutations: All document mutations traverse a single funnel `applyDocMutation()` ensuring patches, metrics, batching, validation.
5. Predictable Undo: Each undo entry corresponds to a user-intent grouping (formalized classification table) not raw atomic mutations.
6. Observability First: Every reconciliation + mutation emits structured metrics in dev & lightweight counters in prod (behind feature gate).
7. Forward Compatibility: Reserved fields (`_meta`, `_ops`) allow later multi-user operational transforms without breaking older docs.
8. Defense-in-Depth: Validate on import, sanitize macros/bindings, quarantine invalid sections not immediately fatal.
9. Performance Budgets Are Contracts: Breaching a budget is a test failure, not a warning.
10. Rollout Safety: Feature-flag gating + dual-path comparators to assert equivalence before removing legacy paths.

---

## Section C – Measurable KPIs & Budgets

| Metric                                 | Target (Initial) | Hard Fail Threshold    | Measurement Strategy                   |
| -------------------------------------- | ---------------- | ---------------------- | -------------------------------------- |
| Serialize 1k elements                  | < 40ms           | > 70ms                 | Benchmark test (warm + cold)           |
| Deserialize 1k elements                | < 55ms           | > 90ms                 | Same harness                           |
| Reconcile single element prop change   | < 1.2ms          | > 3ms                  | Spy + perf.now diff                    |
| Full initial reconcile for 1k elements | < 120ms          | > 200ms                | Boot projection benchmark              |
| Undo patch apply (median)              | < 2ms            | > 5ms                  | Patch timing instrumentation           |
| Patch entry memory (avg)               | < 2.5 KB         | > 5 KB                 | Size estimator (JSON length heuristic) |
| History depth (default)                | 100 entries      | -                      | Configurable & enforced                |
| Duplicate element IDs (runtime)        | 0                | >0 triggers hard error | Assertion counter                      |
| Structural hash collision (synthetic)  | 0 in 100k        | >0                     | Random doc fuzzer                      |

---

## Section D – Architectural High-Level View

Document Store (Persisted) → Reconciler (Diff + Projection) → Runtime Graph (Classes / caches) → UI Store (Ephemeral) / Renderer / Playback.
Backward compatibility layer (Phase Bridge) intercepts old `timelineStore` calls and proxies into document actions until decommissioned.

---

## Section E – Phase Plan (Refined)

Each phase lists: Goal, Scope, Deliverables, Acceptance Criteria (AC), Verification (Manual + Automated), Risks & Mitigations.

### Phase 1 – Canonical Schema & Governance

Goal: Authoritative, versioned schema + migration pipeline.
Scope: `src/document/types.ts`, `schema-governance.md`, `migrations/registry.ts`, `createEmptyDocument()`, structural hash util.
Deliverables:

-   Types with doc comments.
-   `SCHEMA_VERSION` constant.
-   `migrateChain(raw: unknown): Result<DocumentRoot, MigrationError[]>`.
-   `computeStructuralHash(doc)` stable (sorted JSON + xxhash/fast fallback – placeholder deterministic string if no native dep allowed yet).
-   ID allocator `createId(type)` with uniqueness registry (dev only).
    AC:

1. All required root keys present; extraneous dropped (test).
2. Running migrate on current version is idempotent (hash stable).
3. Hash stable across runs (100 random docs property test).
4. Governance doc defines: semver rules (minor = backward additive; major = breaking), deprecation staging (Warn → Soft Fail → Hard Fail).
   Verification:

-   Manual: REPL create empty doc, ensure `schemaVersion === SCHEMA_VERSION` and hash constant between calls.
-   Automated: Property-based hash determinism test (seeded random generation). Fuzzer ensures no throw.
    Risks: Hash algorithm change → mismatch; Mitigation: embed `hashAlgoVersion` field.

### Phase 2 – Validation & Resource Integrity Layer

Goal: Rigorous validation on import + resource reference safety.
Scope: `validateDocument(doc)` returning issues (severity: error|warn|info), resource registry introspection.
Deliverables:

-   Validation categories: structure, referential integrity (track IDs, macro refs), resource existence (fonts, media), macro binding shape.
-   Quarantine strategy: Unknown element types moved to `doc.scene.elementsQuarantine` with report.
    AC:

1. Invalid ref (dangling track) yields error and removal (test ensures count reduced & error collected).
2. Missing resource replaced by placeholder entry with `status: 'missing'`.
3. Validation pass <= 10ms on 1k elements baseline.
   Verification: Import synthetic corrupted doc; console prints validation report summary.
   Risks: Over-aggressive pruning. Mitigation: mark removed items in report for potential recovery UI.

### Phase 3 – Document Store (Core Mutations Funnel)

Goal: `useDocumentStore` with mutation funnel + metrics.
Scope: `src/document/store.ts`, `applyDocMutation()`, patch event emitter, metrics counters.
Deliverables:

-   Actions enumerated + classification metadata (mutationType, intentGroup).
-   Middleware composition (Immer + dev freeze + metrics).
    AC:

1. All state changes path through `applyDocMutation` (enforced by internal symbol guard, test via monkey patch fail attempt).
2. Modified timestamp updates only once per macro-task batch (debounced microtask flush).
3. Metrics counters increment: mutations total, per type, patches bytes.
4. Type-level guarantee: cannot return runtime objects.
   Verification: Manual devtools log after a series of mutations shows aggregated metrics.
   Risks: Accidental direct set. Mitigation: Freeze root outside funnel in dev.

### Phase 4 – Serialization / Deserialization + Stable Ordering

Goal: Deterministic serialization + migration + validation pipeline.
Scope: `serializeDocument`, `deserializeDocument`, stable ordering util ensuring canonical sequence (tracks per trackOrder, elements by original index if stable else zIndex then id).
AC:

1. Round-trip preserves structural hash.
2. Reordering tracks changes hash; editing nonfunctional whitespace does not (string comparison test).
3. Deserialize rejects mismatched major versions (migration path increments).
4. Large doc (1k elements) serialize < 40ms.
   Verification: Benchmark test & manual console round-trip.
   Risks: Hash drift due to ordering; Mitigation: explicit ordering test matrix.

### Phase 5 – Reconciler (Diff + Projection Engine)

Goal: Incremental diff application; identity preservation for untouched runtime nodes.
Scope: `reconciler/` module with `createReconciler()`, diff signatures using per-node version counters or subtree hashes.
AC:

1. Changing one element property updates exactly 1 runtime element (spy count).
2. Removing element calls its dispose hook (spy).
3. Full reconcile after cold start within budget; incremental within single-change budget.
4. No document writes from reconciler (dev assert).
   Verification: Tests w/ spies; manual console logs reconcile cycles (cycle id + changed nodes count).
   Risks: Hidden O(N) path; Mitigation: perf test with 1k baseline diff.

### Phase 6 – Undo/Redo via Immer Patches (Intent Batching)

Goal: Patch-based history with intent grouping & memory caps.
Scope: `history/` implementing stacks, batch manager, memory arbiter.
Deliverables:

-   Intent classification table (e.g., drag, macro-edit, track-rename) with grouping rules.
-   `beginBatch(key)`, `endBatch(key)` + automatic time-based closure (e.g., 250ms inactivity).
-   Memory monitor: approximate patch size; if cap exceeded → drop oldest with warning metric.
    AC:

1. Drag gesture (simulate 100 interim updates) yields exactly 1 undo entry.
2. History depth never > configured max; dropping oldest preserves invariants.
3. Redo after undo reproduces identical structural hash.
4. Applying undo triggers exactly one reconcile cycle.
   Verification: Automated tests + manual sequence in console.
   Risks: Patch explosion for large changes; Mitigation: Diff segmentation + large-change guard (warn if patch > threshold).

### Phase 7 – High-Frequency Interaction API

Goal: Specialized APIs for drag/resize/time-scrub minimizing overhead.
Scope: `interaction/` helpers layered atop mutation funnel (flag `historical:false` for interim).
AC:

1. Interim (draft) mutations not added to history but visible in runtime within < 16ms frame.
2. End action commits final patch + one history entry.
3. Frame drop threshold (average reconcile < 8ms during drag) satisfied in synthetic test.
   Verification: Fake timers + performance harness.
   Risks: Starvation (never committing). Mitigation: Safety timeout commits after 2s.

### Phase 8 – UI Store Extraction & Legacy Bridge

Goal: Isolate ephemeral state; maintain compatibility for in-flight features via bridge.
Scope: `useUIStore`, `bridge/timelineLegacyAdapter.ts` forwarding old selectors.
AC:

1. No ephemeral fields remain in document store (grep-based test + type test).
2. Undo does not affect playhead (test ensures immutable before/after values).
3. Legacy adapter logs deprecation on first use (once per session).
   Verification: Manual console using old API path still functional.
   Risks: Hidden coupling. Mitigation: Temporary runtime assertion when UI store fields appear in document state.

### Phase 9 – Observability & Dev Tooling

Goal: Instrumentation + developer visualization.
Scope: Metrics aggregator, simple dev panel (if React component) or console table printer.
AC:

1. Metrics: totalMutations, reconcileCycles, avgReconcileMs, largestPatchBytes, historyDepth.
2. CLI/dev toggle enabling instrumentation; disabled adds < 1% overhead (microbenchmark).
3. Warning emitted when budgets exceeded.
   Verification: Manual: open panel, perform actions, observe live counters.
   Risks: Overhead; Mitigation: lazy instrumentation wrappers.

### Phase 10 – Robust Import / Safe Mode / Partial Merge

Goal: Safe import + partial merging feature.
Scope: `importDocument(source, { mode: 'replace'|'merge'|'partial' })`.
AC:

1. Merge mode merges tracks, elements by ID; conflicts resolved by policy (new wins or keep-existing configurable).
2. Partial mode imports only selected subsets (e.g., macros) leaving others intact.
3. Corrupt doc enters safe mode (skip reconcile) and returns structured error list.
   Verification: Tests for each mode + manual corrupt file load.
   Risks: Partial merge duplications; Mitigation: ID reconciliation mapping step.

### Phase 11 – Security & Sandbox (Macros/Bindings)

Goal: Prevent execution of untrusted code via document payload.
Scope: Macro descriptors limited to declarative config. Binding expressions replaced by reference tokens not raw JS.
AC:

1. Deserialize rejects raw function bodies / `() =>` strings.
2. Attempt to inject code yields validation error.
3. Sandbox test ensures macros cannot escalate (no `eval`).
   Verification: Tests with malicious payload.
   Risks: Future need for user scripts; Mitigation: plan separate signed plugin channel.

### Phase 12 – Performance & Scale Bench Harness

Goal: Ensure budgets maintain under synthetic load.
Scope: `bench/` scripts generating large docs; run in CI (non-blocking for nightly full run, subset on PR).
AC:

1. Budget tests pass; failures block merge.
2. Trend report (simple JSON artifact) produced.
   Verification: Local run prints metrics table.
   Risks: Flaky perf due to environment; Mitigation: ratio comparisons to baseline (±20%).

### Phase 13 – Rollout & Decommission Legacy

Goal: Gradual transition & removal of old paths.
Scope: Feature flags: `ff.newDocumentStore`, `ff.newUndo`, `ff.newReconciler`.
AC:

1. Dual-run mode: legacy + new produce identical serialized output (diff test) for 10 exemplar scenarios.
2. After stability window, flag default ON; legacy code path enters read-only compatibility for one release.
3. Final removal leaves no references (grep test) to legacy timeline store modules.
   Verification: Diff harness output zero differences.
   Risks: Divergence during dual-run; Mitigation: comparator test in CI.

### Phase 14 – Integration Scenarios & Acceptance Matrix

Goal: Holistic validation of flows.
Scope: Expanded integration tests referencing acceptance matrix YAML (`tests/acceptance-matrix.yaml`).
AC:

1. All required scenario cases present & green.
2. Matrix generator script outputs coverage report (missing items = fail).
   Verification: CI artifact includes matrix coverage.
   Risks: Drift between docs & tests; Mitigation: matrix as single source, docs reference generated view.

### Phase 15 – Documentation & Developer Education

Goal: Persistent understanding & onboarding ease.
Scope: `docs/STATE_MODEL.md`, updated `ARCHITECTURE.md`, `MIGRATIONS.md`, `OBSERVABILITY.md`.
AC:

1. Diagrams (data flow + lifecycle) embedded (mermaid or exported PNG).
2. Quick Start Section: “Adding a new document action” checklists.
3. Changelog entry enumerating deprecations & flags.
   Verification: Manual doc lint + link checker.
   Risks: Stale docs; Mitigation: PR template requiring matrix update references.

### Phase 16 – Post-Launch Monitoring & Hardening

Goal: Early anomaly detection & stabilization.
Scope: Runtime sampling hooks (counts per minute) + error aggregation funnel.
AC:

1. Error rate threshold alert simulation (< defined environment, test harness stub).
2. Patch size anomaly detection triggers warning (3× rolling median).
   Verification: Simulated workload script.
   Risks: Noise; Mitigation: Exponential smoothing of metrics.

---

## Section F – Intent Classification Table (Undo Grouping)

| Intent Group     | Examples (Action Names)           | Batching Rule                                          | Historical? | Close Conditions        |
| ---------------- | --------------------------------- | ------------------------------------------------------ | ----------- | ----------------------- |
| element-drag     | moveElementTemp                   | Time + explicit end                                    | Only final  | `endDrag` or 250ms idle |
| element-resize   | resizeTemp                        | Same as drag                                           | Only final  | `endResize`             |
| property-edit    | updateElementProps, updateTrack   | No grouping unless identical key repeated within 500ms | Yes         | 500ms idle              |
| macro-edit       | updateMacro, removeMacro          | Group sequential macro edits within 400ms              | Yes         | Idle timeout            |
| structural       | addTrack, removeTrack, addElement | Each atomic (no batch)                                 | Yes         | Immediate               |
| timeline-meta    | updateTimelineMeta                | Group within 300ms                                     | Yes         | Idle                    |
| import/migration | bulkApply                         | Single batch                                           | Yes         | On completion           |

---

## Section G – Risk Matrix (Top 10)

| Risk                          | Likelihood | Impact   | Score | Mitigation                   | Owner (Placeholder) |
| ----------------------------- | ---------- | -------- | ----- | ---------------------------- | ------------------- |
| Diff not O(C)                 | Med        | High     | 12    | Perf tests + profiling       | Arch Lead           |
| Patch memory blowout          | Med        | High     | 12    | Memory cap + pruning         | Core Dev            |
| Migration bug corrupts doc    | Low        | Critical | 15    | Backup + dry-run validate    | Persistence Lead    |
| Undo grouping inconsistency   | Med        | Med      | 9     | Intent table tests           | UX Dev              |
| Resource missing crash        | Med        | Med      | 9     | Placeholder injection        | Runtime Dev         |
| Hash collision                | Low        | High     | 8     | Longer hash + collision test | Arch Lead           |
| Dual-run divergence           | Med        | High     | 12    | Automated diff harness       | Integration Dev     |
| Over-instrumentation slowdown | Med        | Med      | 9     | Lazy gating                  | Perf Eng            |
| Validation false positives    | Med        | Med      | 9     | Quarantine vs delete policy  | Persistence Lead    |
| Legacy code linger            | High       | Med      | 12    | Grep gating in CI            | Release Eng         |

(Score heuristic = Likelihood(1–5) \* Impact(1–5)).

---

## Section H – Testing Strategy Enhancements

1. Property-Based Generators: Random doc generator with constraints (no invalid refs unless testing validator).
2. Invariant Checks: After every mutation in fuzz test – (a) no duplicate IDs, (b) trackOrder length equals track count, (c) hash recompute stable unless intentional change.
3. Mutation Fuzzer: 10k random operations under perf budget threshold.
4. Snapshot Equivalence for Dual-Run: Compare legacy vs new serialized structure ignoring known ephemeral differences.
5. Canary Performance Test: Quick subset (10%) run on PR; full bench nightly.
6. Security Tests: Attempt injection of JS code into macros/bindings.
7. Stress Undo/Redo Loop: Apply random undo/redo sequences (length 2× history depth) verifying final doc matches predicted stack simulation.

---

## Section I – Operational & Rollout Checklist

Pre-Enable Flag:

-   All Phase 1–7 tests green.
-   Dual-run comparator passing.
-   Performance budgets satisfied.
-   Documentation for new action contribution merged.
    Post-Enable Monitoring (First 1–2 weeks):
-   Track reconcile cycles / min, average patch size.
-   Watch for anomaly alerts.
    Decommission:
-   Remove legacy store modules, update import map, run grep tests.

---

## Section J – Glossary (Extended)

-   Structural Hash: Deterministic digest of canonical JSON (ordering + stripped volatile fields).
-   Intent Group: Semantic grouping representing a single logical undoable user action.
-   Quarantine: Holding area for unrecognized or invalid payload segments.
-   Dual-Run Mode: Operating both legacy and new pipelines in parallel for equivalence validation.
-   Safe Mode: Load path disabling reconciliation to present recovery UI.

---

## Section K – Open Questions / Future-Proofing

1. Collaboration: Choose baseline (CRDT vs OT). Reserved `_ops` field keeps options open.
2. Worker Offload: Reconciler may migrate to Web Worker; design diff messages now (structured patch arrays) to simplify.
3. Compression: Large docs – optional compression layer (LZ4 / brotli) for exports with version tag.
4. Partial Lazy Loading: Defer rehydration of offscreen elements.
5. Telemetry: Anonymized aggregation of mutation patterns to guide optimization.

---

## Section L – Implementation Ordering Justification

Front-load schema + validation to prevent compounding migration complexity. Delay high-frequency interaction optimizations until core correctness & diffing validated. Instrumentation introduced before broad rollout to ensure visibility. Legacy decommission only after dual-run equivalence stability.

---

## Section M – Acceptance Matrix (Excerpt Example)

| Requirement                 | Phase(s) | Test Ref (Planned)            |
| --------------------------- | -------- | ----------------------------- |
| Deterministic Serialization | 4        | serialize.determinism.test.ts |
| Incremental Reconcile O(C)  | 5,12     | reconcile.perf.test.ts        |
| Undo Intent Grouping        | 6        | undo.intent-group.test.ts     |
| Validation & Quarantine     | 2,10     | validation.quarantine.test.ts |
| Dual-Run Equivalence        | 13       | dualrun.diff.test.ts          |
| Observability Metrics       | 9        | metrics.exposure.test.ts      |

(Full matrix auto-generated in Phase 14.)

---

## Section N – Immediate Next Steps (Actionable)

1. Implement Phase 1 files & migration registry skeleton.
2. Add random document generator utility for property tests (used starting Phase 1 tests).
3. Set up CI job template for performance harness (placeholder script returning JSON metrics).
4. Create developer doc `schema-governance.md`.

---

## Section O – Exit Criteria for v2 Plan Adoption

-   Stakeholder review sign-off of KPIs & budgets.
-   Risk matrix owners assigned.
-   Tooling tasks (CI harness, comparator) stubbed.
-   Phase 1 PR opened with tests & docs.

---

## Appendix – Example Structural Hash Pseudocode

```
function computeStructuralHash(doc: DocumentRoot): string {
  const canonical = stableStringify(doc, { exclude: ['modifiedAt'] });
  return xxhash64(canonical + '|v1');
}
```

---

End of Plan v2.
