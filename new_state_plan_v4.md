# State Architecture Plan – Version 4 (Expanded Transition & Legacy Bridge Detail)

> v4 focuses on the real complexity of Phase 6 (UI state extraction + legacy bridge) by explicitly modeling the compatibility layer, dual-control risks, migration staging, test strategy, and rollback paths while preserving the lean spine from v3.

---

## 1. Delta Overview (v3 -> v4)

| Area            | v3 Simplification                 | v4 Expansion                                                                                                             |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Legacy Bridge   | "Simple pass-through" assumption  | Explicit multi-stage adapter with action mapping, data shape transforms, batching harmonization, runtime ownership model |
| Concurrency     | Implicit assumption of clean swap | Defined dual-control hazard matrix + mitigation (ownership tokens, event routing rules, guard rails)                     |
| Testing         | Minimal integration tests         | Layered strategy: contract tests, golden transcripts, shadow-mode diffing, deterministic harness                         |
| Instrumentation | Optional console.time             | Scoped transitional telemetry: adapter invocation logs, divergence counters, gesture merge stats                         |
| Migration Plan  | Single phase                      | Incremental staged cutover (Inventory → Shadow → Partial Ownership → Full Ownership → Decommission)                      |
| Rollback        | Not addressed                     | Explicit rollback triggers, preserved snapshot + adapter kill switch                                                     |
| Risk Tracking   | Deferred conceptually             | Formal risk register with mitigations & decision triggers                                                                |

Everything outside Phase 6 remains intentionally lean from v3; only clarifications added where they intersect with transition.

---

## 2. Core Guiding Principles (Reaffirmed + Transition Additions)

1. Deterministic Document Core (unchanged).
2. Single Mutation Funnel (new system) — BUT legacy actions are wrapped; no direct mutation escapes.
3. Progressive Cutover — never a big-bang unless metrics prove negligible risk.
4. Bug-for-Bug Compatibility First, Then Improvement (avoid premature behavioral fixes during bridge).
5. Adapter Transparency — every legacy call is labeled, timed, and traceable.
6. Contain Dual Control — explicit ownership boundary of runtime objects per stage.
7. Reversible Steps — each stage introduces at most one irreversible structural change (schema additions only; no destructive removals mid-way).
8. Observability for Confidence — minimal but targeted transitional counters.
9. Lean but Explicit — complexity is enumerated and deliberately bounded.

---

## 3. Phase Recap (Phases 1–5 Short Form)

Phases 1–5 (schema + validation + mutation funnel + serialization + reconciler) are prerequisites and must be stable (tests green) before engaging Phase 6 bridging. No structural doc changes introduced during bridge other than potential addition of new normalized fields if required to mirror legacy semantics (add-only policy until full cutover).

---

## 4. Expanded Phase 6 – UI State Extraction & Legacy Bridge

### 6.1 Legacy Landscape Inventory (Pre-Work)

Deliverable: `legacy_inventory.md` enumerating:

-   Stores: names, file paths, purpose (timelineStore, selectionStore, playbackStore, etc.).
-   Action Signatures: `(name, parameters, side-effects, mutation targets, async?)`.
-   State Fields: classify as `persisted-candidate` vs `ephemeral-only` vs `derivable`.
-   Hidden Couplings: computed selectors relying on implicit mutation order.
-   Gesture/Batch Semantics: which actions are spammy (drag, scrub, resize).

Output structured as a machine-readable table (JSON optionally) to bootstrap mapping.

### 6.2 Target Architecture Snapshot

New world split:

-   `documentStore` (Zustand + mutation funnel) — strictly persisted domain.
-   `uiStore` (Zustand) — selections, playhead position, panel visibility, transient drag state, hover context, ephemeral caches.
-   Reconciler — consumes document deltas only; UI does not directly mutate runtime graph.

### 6.3 Transition Staging (Incremental Cutover)

| Stage | Name                                 | Goal                                          | Adapter Mode                | Ownership                                      | Rollback Cost             |
| ----- | ------------------------------------ | --------------------------------------------- | --------------------------- | ---------------------------------------------- | ------------------------- |
| 0     | Inventory & Freeze                   | Stabilize baseline                            | None                        | Legacy only                                    | None                      |
| 1     | Shadow Mode                          | Observe parity                                | Mirror (write legacy + new) | Runtime driven by legacy                       | Low                       |
| 2     | Partial Ownership                    | Subset of actions authoritative in new system | Fork & Resolve              | Split by domain (e.g., structure vs transient) | Medium                    |
| 3     | Full Ownership + Legacy Read-Through | New system leads; legacy reads proxy          | Read-Through Adapter        | New only                                       | Medium (disable adapter)  |
| 4     | Adapter Decommission                 | Remove bridge                                 | Removed                     | New only                                       | High (requires re-adding) |

Promotion Criteria per stage: defined metrics (divergence count = 0 over N actions) + manual QA checklist.

### 6.4 Adapter Responsibilities (Explicit Scope)

The Adapter (module: `legacyBridge/adapter.ts`):

1. Action Mapping: maps legacy action names to structured descriptors `{ intent, translateParams, apply }`.
2. Param Transformation: reshapes legacy parameters to document schema (ID normalization, unit conversions).
3. Gesture Normalization: coalesces rapid fire legacy calls into a single `applyDocMutation` batch when semantics allow.
4. Side-Effect Containment: prevents legacy code from directly mutating runtime objects (enforced by freezing selected subtrees in shadow stages).
5. Divergence Detection: optional diff of selected derived values (e.g., track count, element bounds) between legacy state & new document projection.
6. Telemetry Hooks: emits events `{ actionName, durationMs, batched, divergenceDetected }`.
7. Bug-for-Bug Mode Flag: toggles compatibility patches (e.g., known off-by-one selection behavior) — documented for later cleanup.

### 6.5 Action Mapping Matrix Template

Create `legacyBridge/action-map.ts` exporting a registry:

```ts
interface LegacyActionBinding {
    legacyName: string;
    stage: number; // minimum stage where new system authoritative
    batchPolicy: 'immediate' | 'gesture-merge' | 'debounce-50' | 'frame';
    translate: (legacyArgs: any, ctx: AdapterContext) => MutationSpec[]; // high-level semantic ops
    apply: (mutations: MutationSpec[], funnel: FunnelAPI) => void; // calls applyDocMutation appropriately
    compatibilityQuirks?: string[]; // ids referencing documentation
}
```

`MutationSpec` is a small intermediate normalized representation decoupling legacy parameters from document patches (improves testability; golden tests operate at this layer).

### 6.6 Data Shape Transformation Strategy

Patterns:

-   ID Assurance: legacy may pass raw indices; translate to stable IDs via lookup tables built during Stage 1 shadow mirroring.
-   Derived Fields: if legacy stored redundant data (e.g., cached width), compute on reconcile side instead of persisting.
-   Unit Harmonization: central util `normalizeUnits()` — single source for px/ms conversion differences.
-   Canonical Ordering: enforce ordering in arrays only at funnel boundary; adapter never reorders silently.

### 6.7 Gesture Batching & Debounce Harmonization

Legacy Patterns Observed (hypothetical):

-   Drag emits `updateElementPosition` every 8ms.
-   Scrub emits `setPlayhead` every animation frame.

Adapter Policies:

-   For structural document mutations (position, size): use `gesture-merge` with a 250ms trailing commit; intermediate updates remain in-memory ephemeral preview (UI state) — only final commit hits document unless persistence is needed for live-dependent computations.
-   For playhead (ephemeral): STOP persisting; redirect entirely to `uiStore` (document unaffected). During shadow stage, still mirror to detect dependencies before removal.

### 6.8 Bug-for-Bug Compatibility Strategy

Catalog each legacy quirk:

-   Example: Selection clearing order (legacy clears, then adds — transient flicker relied on by a plugin). Represent as `quirkId = selection.clearBeforeAdd`.

Config:

```ts
const Compatibility = { quirks: { selectionClearBeforeAdd: true /* toggled off after decommission */ } };
```

Adapter paths branch on quirks; unit tests run in BOTH modes for certain actions once stable.

All quirks documented in `legacyBridge/quirks.md` with: description, origin, removal criteria, test references.

### 6.9 Dual-Control (Concurrency) Hazard Matrix

| Hazard                                   | Description                                                    | Stage Exposure      | Mitigation                                                         |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Double Mutation                          | Legacy + new both mutate same object                           | Shadow / Partial    | Freeze legacy write paths (Object.freeze proxies) once mirrored    |
| Event Feedback Loop                      | Mutation triggers legacy listener which triggers adapter again | All bridging stages | Adapter reentrancy guard + mutation provenance tag                 |
| Stale Reads                              | Legacy selectors reading outdated doc projection               | Partial Ownership   | Provide read-through projections updated post-mutation tick        |
| Race Between Gesture Finalization & Undo | Undo invoked mid-gesture creating inconsistent state           | Partial             | Gesture token lock — undo waits or flushes batch                   |
| Runtime Object Dual Instantiation        | Legacy recreates object the reconciler also manages            | Shadow              | Ownership map prevents duplicate create; legacy path becomes no-op |

### 6.10 Runtime Object Ownership Model

Introduce `runtimeOwnership.ts`:

-   Map: `objectId -> { owner: 'legacy' | 'new' | 'shared', ref }`.
-   Stage Transitions:
    -   Stage 1: all `legacy`.
    -   Stage 2: domain-based (e.g., timeline structure -> new, playback transport -> legacy).
    -   Stage 3+: all `new` (legacy creates become warnings).

Reconciler consults ownership; adapter downgrades create calls when owner != legacy.

### 6.11 Event Routing & Conflict Resolution

Global event bus wrapper tags events with `source = legacy|adapter|system`.
Rules:

1. Legacy listeners receiving `source=adapter` events that map to the same action are ignored (prevents ping-pong).
2. Adapter maintains `activeGestureId`; events outside current gesture scope cannot close the batch.
3. Undo/Redo emits `source=system`; adapter does not mirror those back to legacy (legacy state is recomputed by projecting from document if still partially active).

### 6.12 Incremental Cutover Plan (Detailed Steps)

1. Stage 0 Freeze
    - Add lightweight guard preventing new direct mutations (console.warn when legacy mutates banned fields).
    - Snapshot baseline behavior transcripts (see 6.15 Test Strategy).
2. Build Inventory & Action Map Skeleton.
3. Stage 1 Shadow Mode
    - Wrap each legacy action: perform legacy mutation, THEN synthesize normalized `MutationSpec` & dry-run `applyDocMutation` inside a sandbox draft; diff results (no commit yet).
    - After parity confidence (low divergence), switch to committing new doc in parallel (non-authoritative) and run reconcile in a separate namespace (shadow runtime) for comparison counts.
4. Stage 2 Partial Ownership
    - Flip `authoritative` flag for a safe subset (e.g., element geometry changes). Legacy path becomes pass-through reading post-mutation projection.
    - Introduce ownership tokens; freeze legacy objects for those domains.
5. Stage 3 Full Ownership
    - All structural actions routed purely through document; legacy store becomes thin projection (read-only selectors proxying doc/ui stores).
6. Stage 4 Decommission
    - Remove projection layer; delete adapter bindings; turn off quirks; purge shadow runtime.

### 6.13 Transitional Telemetry (Lean)

Counters (dev only, behind flag):

-   `adapter.invocationsByAction`.
-   `adapter.batchMergeCount`.
-   `adapter.divergenceCount` (shadow mode).
-   `adapter.quirkBranchesTaken`.
-   `runtime.ownershipWarnings`.

Expose a small debug panel or log summary every 5s in dev.

### 6.14 Risk Register & Mitigations

| Risk                              | Likelihood | Impact                      | Mitigation                                                                 | Trigger to Escalate             |
| --------------------------------- | ---------- | --------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| Hidden Coupling on Mutation Order | Medium     | Inconsistent derived caches | Shadow diff of derived snapshots; force recompute after each adapter batch | >5 unique divergence types      |
| Gesture Latency Increase          | Medium     | UX lag                      | Benchmark micro-latency; cap adapter batch overhead < 4ms                  | P95 > 8ms                       |
| Memory Bloat (dual graphs)        | Low        | Dev env slowdown            | Release shadow runtime objects after Stage 1                               | >20% heap growth                |
| Quirk Unknown                     | Medium     | Unexpected behavior change  | Inventory rigorous; add temporary logging of unbound actions               | Any unbound action logged twice |
| Rollback Complexity               | Low        | Prolonged downtime          | Maintain Stage 0 snapshot harness & feature flag gating                    | Rollback time > 30 min          |

### 6.15 Testing Strategy (Layered)

1. Unit – Adapter translation (`translate()`), ensuring param->MutationSpec correctness.
2. Contract – Golden transcripts: record sequences of legacy action calls + resulting observable states (serialized doc subset + key UI ephemeral fields). Re-run with adapter authoritative; assert equivalence (minus intentional deltas like removed ephemeral persistence).
3. Shadow Diff – Automated during Stage 1: assert derived invariants (counts, bounding boxes) match.
4. Quirk Toggle Tests – For each quirk, confirm old vs new mode differences isolated & documented.
5. Ownership Tests – Simulate Stage transitions; assert legacy create/update suppressed post-ownership transfer.
6. Concurrency – Simulate overlapping gesture + undo; ensure no invariant break (structural hash stable after cycle).

Test Infra Additions:

-   `recordTranscript(actions: LegacyAction[])` utility.
-   Deterministic random seed harness to generate mixed action sequences.

### 6.16 Performance Considerations

Budget:

-   Adapter translation + funnel overhead per structural action target < 1.5ms (median) in dev.
-   Batching reduces high-frequency drag commit count by >90% vs legacy baseline.

Measurement Approach: `performance.now()` sampling + aggregated dev summary (no persistent metrics infra yet).

### 6.17 Exit Criteria (Phase 6 Completion)

-   `divergenceCount` = 0 for 3 consecutive full golden transcripts.
-   All legacy structural actions mapped & authoritative in new system.
-   No runtime objects with owner = legacy.
-   All quirks flagged for removal either removed or scheduled (tracked in backlog with ticket IDs).
-   Adapter removed or reduced to read-only backward-compatible thin layer (if external plugins still depend).
-   Test suite green with quirk flags both on (legacy compat) and off (forward mode) for critical paths.

### 6.18 Rollback / Fallback Plan

Feature flag: `ENABLE_NEW_STATE_CORE`.

-   Rollback Path (Stage ≥2):
    1. Disable flag -> adapter reverts to legacy authoritative mode.
    2. Discard uncommitted batch (flush gesture queue).
    3. Reload last persisted legacy snapshot (kept in parallel during Stage 2–3 window).
-   Persisted Document Migration: Only additive fields introduced pre-cutover. No destructive schema changes until after Stage 4; ensures backward readability.

### 6.19 Decommission Checklist

-   Remove `legacyBridge/*` directory (except historical docs).
-   Delete quirk flags & tests in compatibility mode (leave one archival doc outlining removed quirks).
-   Remove shadow telemetry & counters.
-   Final update to `README` + `ARCHITECTURE.md` summarizing new canonical flow.

---

## 5. Minimal Code Skeletons (Illustrative)

```ts
// legacyBridge/adapter.ts
import { applyDocMutation } from '../state/documentStore';
import { actionMap } from './action-map';
import { startBatch, commitBatchMaybe } from './batching';

let reentrancy = 0;

export function invokeLegacyAction(name: string, ...args: any[]) {
    const binding = actionMap.get(name);
    if (!binding) {
        console.warn('[Adapter] Unmapped legacy action', name);
        return legacyInvokeDirect(name, ...args); // fallback safety
    }
    if (reentrancy > 0) return; // guard loops
    reentrancy++;
    try {
        const mutations = binding.translate(args, getAdapterContext());
        scheduleAccordingToPolicy(binding.batchPolicy, () => {
            applyDocMutation(name, (draft) => {
                for (const m of mutations) applyMutationSpec(draft, m);
            });
        });
    } finally {
        reentrancy--;
    }
}
```

```ts
// legacyBridge/batching.ts
export function scheduleAccordingToPolicy(policy: BatchPolicy, fn: () => void) {
    switch (policy) {
        case 'immediate':
            fn();
            break;
        case 'gesture-merge':
            queueGesture(fn);
            break;
        case 'debounce-50':
            debounce(fn, 50);
            break;
        case 'frame':
            requestAnimationFrame(fn);
            break;
    }
}
```

---

## 6. Backlog Additions (v4 Specific)

| Item                        | Rationale                           | Trigger                                |
| --------------------------- | ----------------------------------- | -------------------------------------- |
| Formal Transcript DSL       | Easier long scenario authoring      | >5 complex transcripts maintained      |
| Adapter Telemetry Viewer UI | Faster divergence triage            | Divergence debugging consumes >1h/week |
| Pluggable Action Translator | If external extensions emerge       | >2 external integration requests       |
| Memory Snapshot Diff Tool   | Validate no leaks in shadow runtime | Heap concerns raised                   |

---

## 7. Implementation Ordering (Refined for Phase 6)

1. Inventory + Freeze
2. Build Action Map Scaffolding + Quirk Catalog
3. Shadow Mode (dry-run) translation tests
4. Shadow Mode (parallel commit) + divergence counters
5. Ownership Token Introduction (subset domain)
6. Expand Ownership Coverage incrementally
7. Full Ownership + Legacy Read-Through
8. Quirk Deactivation (progressive)
9. Adapter Decommission
10. Documentation & Cleanup

---

## 8. Developer Quick Reference (Phase 6 Work)

| Need                          | Path                                 |
| ----------------------------- | ------------------------------------ |
| Add new legacy action mapping | `legacyBridge/action-map.ts`         |
| Inspect adapter stats         | Dev console: `window.__adapterStats` |
| Toggle quirk                  | `Compatibility.quirks.<id>`          |
| Record transcript             | `recordTranscript([...])` helper     |
| Force flush gesture batch     | `adapterDebug.flushGesture()`        |

---

## 9. Summary

Version 4 surfaces the true cost & strategy of migrating UI + state layers without destabilizing runtime behavior. By formalizing the adapter contract, staging ownership transfer, and instrumenting just enough observability, we reduce migration risk while keeping the lean philosophy intact. The bridge is treated as a first-class, temporary subsystem with explicit exit criteria—not an afterthought.

---

## 10. Next Immediate Actions (If Phase 3 Complete)

1. Create `legacy_inventory.md` (automated script to list actions if feasible).
2. Scaffold `legacyBridge/` directory with adapter + action map placeholders.
3. Write first translation tests for 1–2 high-frequency actions (drag, playhead move) even before full shadow mode.
4. Decide staging boundaries (which action domains migrate first) and codify in action map `stage` fields.

(These steps unblock the structured, low-risk start of Phase 6.)
