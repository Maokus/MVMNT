# Store Migration Implementation Plan (v2)

## Objectives & Scope

-   Establish a single authoritative scene + macro state inside a normalized Zustand slice while preserving render-time performance and undo determinism.
-   Replace direct `HybridSceneBuilder` mutations with a command-oriented store gateway so UI/business logic runs through audited actions.
-   Align persistence (DocumentGateway, import/export, templates) and runtime adapters with the new store so serialization never depends on runtime objects.
-   Validate and, where necessary, correct the assumptions captured in v1 so the migration lands on a stable, well-understood surface.
-   We will implement this plan one phase at a time. During implementation, update smi_progress_and_notes.md on anything that another agent picking up after you should know about the task at hand. Keep it concise to avoid wasting context size.

## Non-Goals (v2)

-   Changing the public document schema beyond normalization and required field renames.
-   Rebuilding the timeline/audio pipeline; we only coordinate undo batching and shared transactions.
-   Delivering real-time collaboration in this iteration; the new command layer should remain collaboration-ready.

## Baseline & Research Snapshot

-   `HybridSceneBuilder` owns canonical arrays/registries and coordinates with the timeline store for duration (`src/core/scene-builder.ts`).
-   `MIDIVisualizerCore` instantiates its own builder instance, renders via cached runtime objects, and keeps interaction state locally (`src/core/visualizer-core.ts`).
-   Persistence flows (`src/persistence/document-gateway.ts`, import/export) consume builder helpers for serialization and application logic.
-   Zustand already ships in the project; timeline/transport slices show a local pattern for middleware, undo integration, and selector memoization.
-   React contexts such as `SceneSelectionContext` mutate builder state directly; Phase 3 in this plan owns the migration onto store-backed hooks while maintaining feature parity.

## Assumptions & Verification Strategy

-   **Store module location** → Place the slice under `src/state/sceneStore.ts`. _Status_: Confirmed in follow-up responses. _Action_: Codify in ADR/update contribution guide during Phase 1.
-   **Command/middleware extensibility** → Existing snapshot middleware can host scene transactions. _Status_: Verified via Phase 0 undo integration tests; `instrumentSceneStoreForUndo` covers store mutations without regressions. _Follow-up_: Extend instrumentation to cover `updateElementId` and template resets before dual-write activation in Phase 2.
-   **Builder mutation entry points are centralized** → Phase 0 audit (see `docs/store-migration/phase0-builder-mutation-audit.md`) inventories all production mutation surfaces. _Status_: Inventory complete; Phase 1 will add lint/static analysis to catch regressions. _Mitigation_: Build adapters or shims for any outliers before enabling parity checks.
-   **Legacy documents remain compatible with normalized schema** → _Status_: Baseline export/import regression fixture captured in `src/persistence/__fixtures__/phase0/scene.edge-macros.json`. _Follow-up_: Phase 6 expands coverage with legacy document round-trips and normalization transforms. _Mitigation_: Ship backfill transforms guarded by semantic versioning.
-   **Production parity checks are acceptable** → _Status_: Mandated in follow-up responses. _Action_: Phase 2 work includes performance budget definition, sampling/telemetry plan, and feature flag safety valve.

## Guiding Principles

-   Guardrails early: feature flags, parity assertions, and audit logging land before UI cutovers.
-   Production parity: dual-write diffing and telemetry must run in prod (with sampling/alerting) until the builder is retired.
-   Command layer first: UI components dispatch commands; direct builder access is removed or shimmed behind the gateway.
-   Optimize where it matters: runtime adapter caches only rebuild dirty elements; selectors stay memoized to protect render loops.
-   Undo/redo atomicity: scene + timeline mutations batch via shared snapshot middleware and transaction utilities.
-   Documentation keeps pace: each phase delivers notes so teams onboarding mid-migration understand new APIs.

## Phase Breakdown & Detailed Criteria

### Phase 0 – Safety Net, Inventory & Assumption Validation

**Key Activities**

-   Snapshot builder state shapes and invariants via a `snapshotBuilder()` helper; capture sample fixtures covering edge macros.
-   Perform a repo-wide audit (including optional plugin directories) to catalogue every builder mutation entry point; log findings and owners.
-   Prototype reuse of existing snapshot middleware with scene payloads to confirm transaction compatibility.
-   Author baseline import/export regression tests (fixtures from audit) and wire them into CI.

**Acceptance Criteria**

-   Audit report checked into docs with confirmed mutation entry points and resolution plans.
-   Snapshot helper available to unit/integration tests and parity assertions.
-   Regression test suite green in CI; fixtures stored for future diffs.
-   Decision log updated confirming `sceneStore.ts` location and middleware compatibility (or capturing follow-up work).

#### Phase 0 status update – 2025-02-20

-   Snapshot helper available under `src/state/scene/snapshotBuilder.ts` with edge macro fixture (`src/persistence/__fixtures__/phase0/scene.edge-macros.json`) and parity tests (see `src/state/scene/__tests__`).
-   Builder mutation inventory captured in `docs/store-migration/phase0-builder-mutation-audit.md`; lint/static follow-up scheduled for Phase 1.
-   Undo middleware compatibility verified via `scene-middleware.integration.test.ts`; instrumentation gaps (`updateElementId`, template resets) queued for Phase 2.
-   DocumentGateway regression suite added (`persistence.phase0.scene-regression.test.ts`) to guard import/export while store lands.

### Phase 1 – Scene Store Scaffolding & Data Modeling

**Key Activities**

-   Create `src/state/sceneStore.ts` with normalized slices (`settings`, `elements`, `order`, `bindings`, `macros`, `interaction`, `runtimeMeta`).
-   Define shared TypeScript models and ID utilities; document schema in `docs/architecture/scene-store.md`.
-   Build selectors for sorted element lists, macro assignments, inverse macro mapping, and runtime convenience accessors.
-   Implement core actions (`addElement`, `moveElement`, `duplicateElement`, `removeElement`, `updateSettings`, `updateBindings`, `importScene`, `exportSceneDraft`).
-   Unit-test reducers/selectors (Vitest) using fixtures from Phase 0; ensure tests cover ID stability, ordering, macro inverse index integrity.

**Acceptance Criteria**

-   Store can import/export fixtures without relying on builder code paths.
-   Selector memoization verified via tests (ensuring stable references on irrelevant updates).
-   Documentation updated with model diagrams and updated contribution guide referencing `sceneStore.ts`.
-   Store slice passes TypeScript strict mode and lints; unit tests cover >90% of action branches.

### Phase 2 – Dual-Write Gateway & Production Parity Scaffolding

**Key Activities**

-   Introduce a command gateway (`dispatchSceneCommand`) wrapping builder mutators and exposing typed command payloads.
-   Wrap all identified builder mutation entry points from Phase 0 with dual-write logic (legacy builder mutation + store action dispatch).
-   Implement parity assertion leveraging snapshot helper; reuse existing snapshot middleware to batch undo transactions.
-   Extend undo instrumentation to cover Phase 0 gaps (`updateElementId`, template resets) and validate via scene gateway tests.
-   Build production-safe parity execution: sampling knobs, telemetry events, failure logging, and a feature flag for emergency disable.
-   Add ESLint rule/codemod to block direct builder mutations outside the gateway; fix offenders.

**Acceptance Criteria**

-   All commands routed through the gateway in static analysis; lint rule enforced in CI.
-   Dev builds fail-fast on parity drift; production builds run parity checks with observable metrics and alert thresholds defined.
-   Undo middleware successfully batches dual-write operations without duplicate history entries (tested via automated integration tests).
-   Performance benchmark (micro) proves parity checks stay within agreed budget or have fallback plan documented.

### Phase 3 – Store-First UI Panels & Selection Context Migration

**Key Activities**

-   Inventory all `SceneSelectionContext` consumers and catalogue the selection/interaction data each requires.
-   Implement store-driven hooks (`useSceneElements`, `useSceneSelection`, `useMacroAssignments`, `useInteractionState`) that satisfy those contracts and expose migration-friendly APIs.
-   Refactor `SceneSelectionContext` to read from the store via the new hooks while maintaining a compatibility layer for legacy callers during the flag period.
-   Update properties panel, element tree, macro editors, and overlay components to rely on selectors while commands keep using the gateway.
-   Add interaction state tests ensuring hover/drag flows remain responsive (mock store updates + Testing Library simulations).

**Acceptance Criteria**

-   Selection context inventory and compatibility approach documented and checked in with owners for affected panels.
-   With feature flag enabled, panels function end-to-end without reading builder state; disabling builder access in the flagged build causes no regressions.
-   UI interaction tests cover at least CRUD flows, selection changes, and macro editing.
-   Telemetry dashboards confirm parity drift remains zero after UI migration smoke tests.
-   Documentation updated for hook usage patterns and migration guidance for feature teams.

### Phase 4 – Runtime Adapter & Visualizer Cutover

**Key Activities**

-   Implement `SceneRuntimeAdapter` that consumes store state, resolves bindings/macro constants, and caches runtime objects with version counters.
-   Refactor `MIDIVisualizerCore` to depend on the adapter/store, leaving builder as a thin shim delegating to commands.
-   Profile adapter cache invalidation and FPS using stress scenes; optimize dirty-flag propagation if necessary.
-   Provide beta toggle for reverting to legacy builder-backed rendering during rollouts.

**Acceptance Criteria**

-   Visualizer renders via adapter with benchmarked parity to legacy FPS (±5%).
-   Cache invalidation verified through targeted tests (dirty element updates only rebuild affected runtime nodes).
-   Legacy fallback toggle tested and documented for QA.
-   Production parity telemetry shows no sustained drift or performance regressions during canary rollout.

### Phase 5 – Undo/Redo & Macro Consolidation

**Key Activities**

-   Port macro manager state/actions into the store; maintain inverse mapping and validation utilities.
-   Extend undo middleware integration to cover scene + macro changes with atomic history entries.
-   Update macro editing UI and timeline synchronization to operate on store selectors/actions exclusively.
-   Add regression tests for repeated macro edits, undo/redo loops, and mixed scene/timeline commands.

**Acceptance Criteria**

-   Undo/redo history accurately restores scene and macro state across complex sequences (validated by automated tests).
-   Macro inverse index remains consistent after random operation fuzzing (test harness using fixtures).
-   Timeline coordination documented and validated with at least one integration scenario (e.g., scene duration change via macro).

_Status 2025-09-23_: ✅ `scene-middleware.integration.test.ts` covers macro + timeline undo/redo, `macroIndex.fuzz.test.ts` stress-tests the inverse index, and documentation + notes updated with macro store enablement details.

### Phase 6 – Persistence & Template Refactor

**Key Activities**

-   Update `DocumentGateway` to serialize from/hydrate into the store; maintain one-version compatibility adapters.
-   Rewrite scene templates to emit pure data payloads and apply them via `importScene` instead of mutating builders.
-   Migrate export pipeline, CLI tools, and contract tests to rely solely on store data.
-   Run migration scripts against stored legacy documents to verify normalization transforms.

**Acceptance Criteria**

-   Persistence tests round-trip legacy fixtures and new store-native documents without touching builder helpers.
-   Compatibility adapters documented with retirement schedule; telemetry added to detect remaining legacy loads.
-   Template generation and export CLI succeed in CI with store-only pathways.

### Phase 7 – Deprecation, Cleanup & Enablement

**Key Activities**

-   Remove remaining `HybridSceneBuilder` logic, leaving only thin compatibility shims behind feature flags.
-   Delete dual-write scaffolding and parity assertions after sustained green metrics; switch production flag to store-only mode.
-   Update architecture docs, and ADRs to reflect the new single source of truth.
-   Make recommendations on code structure and clean up code, removing any references to the implementation roadmap in documentation or comments.
-   Ensure new functionality is stable, then remove feature flags and feature flag handling (make the new processes the default without any flags)

**Acceptance Criteria**

-   Builder code marked deprecated or removed with no runtime consumers.
-   Feature flags toggled to make store the only code path; rollback switch documented (if any) and verified.
-   Final performance and regression benchmarks signed off.

## Cross-Cutting Workstreams

-   **Observability & Parity Telemetry**: Define metrics, dashboards, and alert thresholds for parity drift, command latency, and adapter performance; ensure availability in staging and prod before dual-write.
-   **Tooling & Automation**: Extend linting/codemods, add CLI scripts for parity sweeps, and generate scene fixtures automatically from reference docs.
-   **Developer Enablement**: Maintain migration playbook, run brown-bag sessions, and keep ADRs updated per phase.
-   **QA & Release Management**: Coordinate feature flag rollout plans, smoke test scripts, and rollback procedures with QA/release teams.
-   **Security & Compliance**: Review telemetry/flag usage for PII handling and update data retention policies if new logs are introduced.

## Testing & Verification Strategy

-   **Unit**: Reducers, selectors, runtime adapter caches, command gateway edge cases, macro inverse index.
-   **Integration**: Import/export flows, undo batching across scene + timeline, UI CRUD/macro interactions under feature flag.
-   **Regression**: Visual diff or snapshot tests of render output for critical scenes; parity telemetry monitoring.
-   **Performance**: Benchmark adapter rebuild cost, command latency, and FPS before/after cutover; document budgets per phase.
-   **Manual QA**: Flagged builds exercised by power users using checklist derived from exposition doc Section 20.

## Risks & Mitigations

-   **Hidden mutation entry points**: Mitigated by Phase 0 audit + lint rule; add runtime logging during dual-write to catch stragglers.
-   **Parity overhead in production**: Define sampling strategy and fallback toggle; profile frequently.
-   **Undo transaction leaks**: Integration tests + shared middleware validation before enabling prod flag.
-   **Schema drift affecting legacy docs**: Maintain versioned migrations and run nightly compatibility tests on sample corpus.
-   **Team adoption lag**: Continuous documentation updates, brown-bags, and pair sessions to keep feature teams aligned.

## Immediate Next Steps

1. Kick off Phase 0 audit (builder mutation inventory + middleware spike).
2. Create regression fixtures and integrate baseline import/export tests into CI.
3. Draft architecture note for the planned `sceneStore.ts` module to socialize with stakeholders.
