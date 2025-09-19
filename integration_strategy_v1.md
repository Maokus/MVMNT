# Integration Strategy v1 – Phase 6 Expansion (UI State Extraction & Legacy Bridge)

> Purpose: Provide a pragmatic, staged roadmap to evolve from the current stable document system (as described in `document_writeup_v1.md`) to a production‑grade integrated application where all persisted state, undo/redo, serialization, deserialization, and runtime reconciliation flow through the document core. This replaces (or neutralizes) legacy UI/state stores while preserving behavior and offering controlled rollback at every promotion step.

---

## 0. Scope & Non‑Goals

**In Scope:** Extraction of ephemeral UI state, legacy action bridging, staged authority transfer, gesture batching alignment, quirk compatibility, telemetry sufficient for confidence, final decommission of legacy store(s).

**Out of Scope (Deferred):** Full metrics dashboard, property‑based fuzzing, plugin sandboxing, cross‑window collaboration, advanced security hardening, multi‑schema migration chain (beyond additive), distributed undo merging.

**Success Definition:** Application runs exclusively on the document store + a dedicated UI store for ephemerals; undo/redo only affects persistent document; no hidden legacy mutations; all structural actions are authoritative through the mutation funnel; adapter removed (or isolated as optional compatibility shim) with green tests.

---

## 1. Baseline (Current State)

Refer to `document_writeup_v1.md` – implemented:

-   Deterministic schema + migration stub.
-   Validation, structural hash.
-   Mutation funnel + batched undo/redo via patches.
-   Deterministic serialization / deserialization.
-   Incremental reconciler (identity preserving).

Outstanding relative to full integration:

-   Legacy stores (if any) still own portions of UI + perhaps structural logic.
-   Ephemeral versus persisted boundary not fully enforced.
-   No adapter / shadow parity harness in place.

---

## 2. Target End State Snapshot

Systems:

-   `documentStore` (persisted domain) – only source for structural & persisted semantic data.
-   `uiStore` (ephemeral) – selections, hover, drag state, transient playhead, panel open/close, scrub preview.
-   Reconciler reacts only to document mutations (plus explicit UI subscription where needed for purely visual cues).
-   All structural commands route: Adapter (transitional) → Mutation funnel → Reconcile.
-   Undo/redo applies only document patches; UI state unaffected unless explicitly derived.
-   Compatibility quirks either removed or behind flags defaulted OFF.

---

## 3. Phase Overview Table

| Phase | Name                               | Primary Goal                                                                    | Authority Model | Rollback Cost | Promotion Signal                                            |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------- | --------------- | ------------- | ----------------------------------------------------------- |
| P0    | Inventory & Boundary Marking       | Enumerate legacy state/actions; classify fields                                 | Legacy          | None          | Inventory doc complete & approved checklist                 |
| P1    | UI Store Extraction (Passive)      | Introduce `uiStore` & mirror ephemeral fields                                   | Legacy (writes) | Low           | UI fields sourced from `uiStore` in new code paths          |
| P2    | Adapter Skeleton & Action Registry | Wrap legacy actions (logging only)                                              | Legacy          | Low           | 100% targeted actions wrapped; no behavior change           |
| P3    | Shadow Mode (Mirror & Diff)        | Dual-run: legacy mutates; adapter produces normalized specs & dry-run mutations | Legacy          | Low           | Divergence counter stable (=0 or explained) over N sessions |
| P4    | Partial Ownership Transfer         | Subset (low-risk structural) authoritative via document funnel                  | Split           | Medium        | Selected action list authoritative; no regressions in tests |
| P5    | Full Structural Ownership          | All structural mutations via document; legacy read-through only                 | Document        | Medium        | No direct legacy writes detected for structural sets        |
| P6    | Quirk Resolution & Cleanup         | Toggle / remove compatibility quirks; finalize semantics                        | Document        | Medium        | All quirk tests pass with flags off                         |
| P7    | Adapter Decommission               | Remove bridge or reduce to optional thin shim                                   | Document        | High          | All mapped actions green without adapter path               |
| P8    | Hardening & Exit Criteria          | Stability burn-in, telemetry removal/pruning                                    | Document        | High          | Exit checklist satisfied (see Section 11)                   |

---

## 4. Detailed Phase Specifications

Each phase lists: Goal, Deliverables, Acceptance Criteria, Instrumentation (delta), Rollback Procedure.

### Phase P0 – Inventory & Boundary Marking

**Goal:** Establish authoritative map of legacy state & actions; decide ephemeral vs persisted classification.
**Deliverables:** `legacy_inventory.md` with:

-   Stores & file paths.
-   Action table: name, parameters, side effects, mutates (structural?|ephemeral?), frequency, gesture grouping.
-   Field classification: `persisted-candidate | ephemeral-only | derivable`.
-   Known quirks / ordering dependencies.
    **Acceptance Criteria:**
-   100% of referenced legacy action names appear in registry.
-   No ambiguous classification items (max TBD list length = 0).
-   At least one candidate list for early Partial Ownership set identified.
    **Instrumentation:** None (manual logging allowed temporarily).
    **Rollback:** Not needed (read-only activity).

### Phase P1 – UI Store Extraction (Passive)

**Goal:** Introduce `uiStore` and begin sourcing new code paths from it while legacy still writes.
**Deliverables:**

-   `src/state/uiStore.ts` (Zustand) with typed state (selection, playhead, hover, drag ephemeral, panel toggles).
-   Migration of React components to read UI state from `uiStore` instead of legacy store.
-   Sync layer: a one-way bridge copying changes from legacy → `uiStore` (no reverse).
-   Lint/grep check ensuring no ephemeral fields remain in document schema.
    **Acceptance Criteria:**
-   Undo/redo cycles leave playhead & selection intact (integration test).
-   All ephemeral selectors in new components read from `uiStore` (grep: 0 usages of old store paths in updated areas).
-   Document diff after user ephemeral interactions remains unchanged (hash stable across ephemeral ops).
    **Instrumentation:** Dev-only console warn if a component still reads from legacy ephemeral field.
    **Rollback:** Remove `uiStore` import lines; revert component reads (low effort).

### Phase P2 – Adapter Skeleton & Action Registry

**Goal:** Wrap legacy structural actions in an adapter registry (no mutation duplication yet) to enable tracing.
**Deliverables:**

-   `legacyBridge/action-map.ts` with interface `{ legacyName, intent, translateParams (stub), batchPolicy, compatibilityQuirks[] }`.
-   `legacyBridge/adapter.ts` function `invokeLegacyAction(name, ...args)` performing: lookup → console timing → call original.
-   Telemetry counters: `adapter.invocationsByAction` (dev).
    **Acceptance Criteria:**
-   100% of targeted structural actions called through adapter (instrumentation assertion: unwrapped count = 0 after typical session script).
-   Overhead per call < 0.5ms median (manual sample) – else simplify wrapper.
    **Instrumentation:** Basic timing + invocation counts.
    **Rollback:** Bypass adapter by calling originals directly.

### Phase P3 – Shadow Mode (Mirror & Diff)

**Goal:** For each legacy structural action, produce a normalized `MutationSpec` and dry-run document mutation to compare projected structural invariants (counts, element positions) without committing authoritative document changes beyond legacy baseline.
**Deliverables:**

-   `MutationSpec` type & translator functions in `legacyBridge/translate.ts`.
-   Dry-run funnel entry: `simulateDocMutation(spec)` returning resulting draft & patch summary.
-   Divergence detector: compares subset invariants (e.g., track count, element bounding box map) vs legacy runtime projection.
-   Counter: `adapter.divergenceCount` + log sample of first K divergences.
    **Acceptance Criteria:**
-   For scripted golden transcript (recorded sequence) divergence count = 0 or each divergence tagged with known quirk ID.
-   Dry-run overhead < 2ms median per structural action on sample doc (manual measure).
-   No reentrancy loops (guard variable stable; test with nested action triggers).
    **Instrumentation:** Divergence counter, timing sampling (performance.now diff stored in ring buffer – optional).
    **Rollback:** Disable dry-run branch; revert adapter to Phase P2.

### Phase P4 – Partial Ownership Transfer

**Goal:** Make a safe subset of structural actions authoritative via the document mutation funnel while legacy reads become projections.
**Subset Selection Criteria:** High-frequency geometry edits with deterministic translation & no hidden side-effects.
**Deliverables:**

-   Ownership flag map: `actionOwnership[legacyName] = 'legacy' | 'document'`.
-   Enforced path: if ownership='document', adapter translates → applies `applyDocMutation` → skips legacy original OR updates legacy mirror store through projection.
-   Freeze / proxy guard preventing legacy write to affected structural objects (dev-only: throws or warns).
-   Gesture batching alignment: commit final state only after 250ms idle for drag gestures (intermediate ephemeral updates sent to `uiStore`).
    **Acceptance Criteria:**
-   All actions in subset produce identical final document state vs legacy baseline transcripts (hash match) for golden tests.
-   No direct legacy writes detected to owned structural objects (guard counter = 0).
-   Undo entries reflect batched gestures (drag series -> single undo) – test asserts undo stack length for scenario.
    **Instrumentation:** Guard counters, authoritative action timings.
    **Rollback:** Flip ownership flags back to 'legacy'; disable guard; re-run transcripts (should restore prior behavior).

### Phase P5 – Full Structural Ownership

**Goal:** All structural mutations route exclusively through document; legacy stores become read-only projections (or eliminated).
**Deliverables:**

-   Ownership map: all structural actions = 'document'.
-   Read-through selectors (if temporary) mapping legacy selector calls to document-derived results (thin layer).
-   Removal or stubbing of legacy mutation functions (fail fast if invoked directly).
-   Reconciler integration validated for all previously legacy-owned domains.
    **Acceptance Criteria:**
-   0 legacy mutation calls during comprehensive scripted session (assert counter).
-   Full golden transcript (all key user flows) passes with no divergence.
-   Memory usage does not exceed +15% baseline of Phase P2 (due to removal of dual structures) – observational.
    **Instrumentation:** Fallback invocation trap count (should remain 0).
    **Rollback:** Re-enable subset legacy mutations (requires retaining translation code; medium complexity). Keep snapshot from end of Phase P4 for quick revert.

### Phase P6 – Quirk Resolution & Cleanup

**Goal:** Remove or gate legacy behavioral quirks; normalize forward semantics.
**Deliverables:**

-   `legacyBridge/quirks.ts` enumerating quirk flags with default OFF.
-   Dual-mode tests: each quirk scenario executed with flag ON and OFF; document expected differences stored explicitly.
-   Updated adapter translation removing conditional logic where quirk disabled.
    **Acceptance Criteria:**
-   All quirk tests pass in both modes; forward mode (all off) becomes default.
-   No runtime references to deprecated quirk branches (grep: pattern check).
    **Instrumentation:** Count of quirk branch executions (expected 0 with all OFF in normal run).
    **Rollback:** Re-enable affected quirk flags (no structural migration necessary).

### Phase P7 – Adapter Decommission

**Goal:** Remove transitional adapter complexity; optionally retain a minimal compatibility shim if external plugins exist.
**Deliverables:**

-   Deletion (or archiving) of `legacyBridge/*` except docs & quirk archive markdown.
-   Direct action creators now call `applyDocMutation` (or typed command layer) without translation indirection.
-   Updated `ARCHITECTURE.md` reflecting canonical flow.
    **Acceptance Criteria:**
-   Test suite green after removal; no imports from removed adapter paths.
-   Bundle size reduced vs Phase P6 (record simple build artifact size diff ≥ measurable decrease for removed code, even small).
-   No missing action warnings at runtime.
    **Instrumentation:** None beyond build size diff log.
    **Rollback:** Restore adapter directory from VCS (high cost if extensive forward edits made after removal – perform after stabilization window).

### Phase P8 – Hardening & Exit

**Goal:** Final polish, ensure resilience and remove transitional telemetry.
**Deliverables:**

-   Pruned telemetry: only keep essential dev diagnostics (optional toggle env var).
-   Final golden transcript regeneration (serves as integration regression baseline).
-   README/Architecture updated with integration strategy summary + removal note.
-   Optional micro stress test script (synthetic 1k element gesture) documented.
    **Acceptance Criteria:**
-   All exit criteria (Section 11) satisfied simultaneously.
-   No transitional counters logging (adapter._, divergence_, quirkBranches) in normal dev run.
-   Stress script completes without errors and performance within informal budget (e.g., median structural action overhead < 1.5ms).
    **Rollback:** N/A (this is stabilization; prior phases available via VCS tags).

---

## 5. Testing Strategy (Layered)

| Layer                         | Purpose                                 | Artifact Examples                                           |
| ----------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| Unit – Translation            | Correct param → MutationSpec mapping    | `translate_geometry.test.ts`                                |
| Unit – UI Store               | Ephemeral independence from undo        | `ui_ephemeral_undo.test.ts`                                 |
| Contract – Golden Transcripts | Behavioral parity & determinism         | `transcript_parity.test.ts`                                 |
| Shadow Diff (P3)              | Early divergence detection              | `shadow_diff_runner.ts` script                              |
| Ownership Tests               | Guard against legacy writes             | `ownership_guards.test.ts`                                  |
| Quirk Mode Dual Tests         | Validate forward vs legacy quirks       | `quirk_modes.test.ts`                                       |
| Gesture Batching              | Undo consolidation & final commit state | `gesture_batching.test.ts`                                  |
| Performance Smoke             | Ensure no egregious regression          | `perf_smoke.test.ts` (timing assertions w/ soft thresholds) |

Golden Transcript Format (suggested minimal JSON):

```json
{
  "actions": [ { "name": "addElement", "args": ["trackA", 0] }, ... ],
  "finalDocumentHash": "abcd1234",
  "selectedInvariants": { "trackCount": 3, "elementCount": 57 }
}
```

---

## 6. Telemetry (Transitional Only)

Dev-only counters (phased removal):

-   `adapter.invocationsByAction` (P2–P6)
-   `adapter.divergenceCount` (P3–P4)
-   `ownership.guardViolations` (P4–P5)
-   `quirk.branchesTaken` (P3–P6)
-   `gesture.batchMerged` (P4–P5 for tuning)

All removed or disabled by P8 default build.

---

## 7. Risk Register (Focused)

| Risk                                | Phase Exposure | Mitigation                               | Trigger Escalation                |
| ----------------------------------- | -------------- | ---------------------------------------- | --------------------------------- |
| Hidden mutation ordering dependency | P3–P4          | Shadow diff + targeted invariant list    | >3 distinct invariant divergences |
| Gesture latency regression          | P4–P5          | Measure batch commit; cap overhead < 4ms | P95 gesture commit > 8ms          |
| Dual state drift memory overhead    | P3–P4          | Release shadow drafts promptly           | Heap +20% vs P2                   |
| Unmapped action slips through       | P2–P5          | Wrapper assert + log unknowns            | Unknown count > 0 after session   |
| Quirk removal behavior change       | P6             | Dual-mode tests                          | Failing forward-mode quirk tests  |

---

## 8. Rollback Strategy

Feature flag (environment or build-time): `ENABLE_NEW_STATE_CORE`.

-   P4+: If severe regression: flip flag → revert authoritative ownership to legacy (use preserved ownership map snapshot from P3). Keep translation utilities isolated so rollback does not reintroduce drift.
-   Maintain last known good legacy snapshot (serialized) until P7 completion.
-   Rollback decision triggers: unresolved divergence > 24h, data corruption (hash mismatch after undo/redo cycle), or critical UX regression reported.

---

## 9. Operational Playbooks

**Investigate Divergence:** Reproduce with transcript → isolate MutationSpec → diff normalized doc paths → add quirk flag or fix translation.

**Add New Structural Action (During P4–P6):**

1. Add to `action-map.ts` with intent & ownership='legacy'.
2. Implement translator & unit test (legacy params → MutationSpec).
3. Shadow run (P3 style dry-run) verifying no divergence.
4. Flip ownership to 'document'.

**Gesture Policy Adjustment:** Modify batch policy constant; run gesture batching test & perf smoke; ensure undo entry count stable.

---

## 10. Documentation Artifacts

-   `integration_strategy_v1.md` (this file) – living until P8; then snapshot.
-   `legacy_inventory.md` – created P0, frozen after P4 (append-only notes).
-   `golden_transcripts/` – JSON transcripts + README describing capture procedure.
-   `docs/ARCHITECTURE.md` – updated P7/P8 with final canonical flow.
-   `legacyBridge/quirks_archive.md` – produced when quirks removed.

---

## 11. Exit Criteria Checklist (P8)

All must be true concurrently:

1. All structural actions authoritative via document funnel; adapter removed (or inert shim with zero invocations).
2. Undo/redo test suite green; no UI ephemeral state altered by undo operations.
3. Golden transcripts (≥3 representative flows) show zero divergence vs baseline invariants.
4. No legacy write guard violations recorded across full manual exploratory session.
5. Quirk flags default OFF; dual-mode tests pass.
6. Transitional telemetry disabled (no adapter.\* logs in console in dev).
7. Build passes; bundle size not increased vs P6 (preferably decreased).
8. README / ARCHITECTURE updated; inventory & quirk archive committed.
9. Performance smoke: median structural action overhead < 1.5ms; P95 gesture commit < 8ms (informal).
10. Rollback assets (legacy snapshot, adapter code) archived in VCS tag; not needed for normal operation.

---

## 12. Phase Sequencing Rationale

Ordering minimizes risk by learning translation on shadow data before ownership, isolating ephemeral separation early so structural actions remain pure, and delaying quirk removal until after full ownership to avoid conflating translation vs behavior changes.

---

## 13. Lightweight Timeline (Indicative Solo Dev)

| Week | Focus                                       |
| ---- | ------------------------------------------- |
| 1    | P0–P1 (Inventory + UI store)                |
| 2    | P2–P3 (Adapter + Shadow, first transcripts) |
| 3    | P4 (Partial ownership)                      |
| 4    | P5 (Full ownership)                         |
| 5    | P6 (Quirk cleanup)                          |
| 6    | P7–P8 (Decommission + hardening)            |

---

## 14. Quick Reference (Cheatsheet)

-   Authoritative structural mutation path (final): `actionCreator -> applyDocMutation -> reconciler`
-   Ephemeral only: `uiStore` (never serialized)
-   Add new structural field mid-transition: Migration adds default (additive), no schema bump
-   Debug divergence: `window.__adapterStats` (if exposed) → review last MutationSpec & invariants
-   Undo Integrity: Verify stable doc hash across undo/redo cycles (test helper `expectHashCycle()`)

---

## 15. Future Enhancements (Post Exit)

| Idea                              | Rationale                                   | Trigger                           |
| --------------------------------- | ------------------------------------------- | --------------------------------- |
| Intent taxonomy for actions       | Richer undo semantics & analytics           | Complex composite gestures needed |
| Property-based transcript fuzzing | Increased confidence under random sequences | >2 post-launch structural bugs    |
| Worker-based reconcile            | Main thread frame drops                     | Reconcile > 10ms P95              |
| Metrics panel                     | Ongoing perf visibility                     | Manual profiling fatigue          |
| Collaborative merge layer         | Multi-user editing                          | Collaboration feature kickoff     |

---

End of integration strategy v1.
