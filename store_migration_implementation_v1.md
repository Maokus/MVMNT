# Store Migration Implementation Plan (v1)

## Objectives & Scope

-   Establish a single authoritative scene + macro state inside a normalized Zustand store slice while keeping render-time performance characteristics intact.
-   Replace direct `HybridSceneBuilder` mutations in UI/business logic with store actions to enable deterministic undo/redo, collaborative readiness, and easier diffing.
-   Align persistence (DocumentGateway, import/export, templates) with the new store so serialization never depends on runtime instances.

## Non-Goals (v1)

-   Changing the public document schema beyond what is required for normalization; migrations will be handled with backwards-compatible transforms when unavoidable.
-   Rewriting the timeline store or audio playback pipeline; we only consume their data and coordinate undo batching.
-   Shipping live multi-user collaboration; the command layer will simply be future-compatible.

## Baseline & Research Snapshot

-   `HybridSceneBuilder` currently owns element arrays/registry and interacts with the timeline store for duration (`src/core/scene-builder.ts`).
-   `MIDIVisualizerCore` instantiates its own builder, renders via cached runtime objects, and caches interaction state locally (`src/core/visualizer-core.ts`).
-   Persistence flows (`src/persistence/document-gateway.ts`, import/export) call into builder helpers for serialization and apply-logic.
-   Zustand is already available in the project (`package.json` dependency). Existing slices (timeline) demonstrate local patterns we can extend.
-   React contexts such as `SceneSelectionContext` read/mutate builder state directly; `selectioncontext_to_zustand_v1.md` documents a parallel migration we should coordinate with.

## Guiding Principles

-   Guardrails first: enable diff-based parity checks and feature flags before redirecting traffic to the new store.
-   Prefer command-style actions dispatched from a single mutation layer; UI components should not know about builder internals.
-   Incremental rollout: dual-write and shadow comparisons keep regression surface manageable.
-   Maintain render-time optimizations by introducing an adapter cache that regenerates runtime objects only on dirty elements.
-   Keep undo/redo atomic by batching scene + timeline changes behind shared transaction utilities.

## Phase Breakdown & Exit Criteria

### Phase 0 – Safety Net & Inventory

-   Snapshot builder state shape (`snapshotBuilder()` helper) and document expected invariants (ordering, identity uniqueness, macro linkage).
-   Implement a dev-only assertion that compares builder snapshots to a pure data model; wire it into core mutation paths and undo stack.
-   Add baseline serialization/import tests to cover representative scenes and macros; capture current outputs for regression diffing.
-   Exit: CI green with new tests; diff assertion helper available but not yet required to pass.

### Phase 1 – Scene Store Scaffolding

-   Create `sceneStore.ts` (or similar) with normalized slices: `settings`, `elements` (by id + order array), `bindings`, `macros`, `interaction`.
-   Define TypeScript models shared across store/actions/adapter. Include derived selectors for sorted element lists and macro assignments.
-   Implement core actions (`addElement`, `updateBindings`, `moveElement`, `duplicateElement`, `removeElement`, `updateSettings`, `importScene`, `exportSceneDraft`).
-   Cover reducers/selectors with unit tests (Vitest) using fixtures from Phase 0.
-   Exit: Store slice can import/export scenes independent of builder, and all reducers have baseline tests.

### Phase 2 – Dual-Write Wrappers & Mutation Hardening

-   Introduce a mutation gateway (e.g., `dispatchSceneCommand`) used by builder methods and UI contexts.
-   Wrap every builder mutator (`addElement`, `removeElement`, `updateSceneSettings`, etc.) so they dispatch store actions after performing legacy work.
-   Add ESLint rule or codemod to forbid direct `SceneElement` setter usage outside the gateway; fix existing offenders in UI panels/contexts.
-   Activate parity assertion: after each command, diff builder snapshot vs store representation (ignoring transient runtime caches).
-   Exit: Dual-write path handles all known scene mutations; parity checks pass in dev builds during normal workflows.

### Phase 3 – Store-First UI Panels

-   Refactor `SceneSelectionContext` consumers to derive selection, ordering, and metadata from the store (leveraging the `selectioncontext_to_zustand_v1.md` plan).
-   Introduce feature flag (`SCENE_STORE_UI`) gating new selectors/hooks. Build new hooks (`useSceneElements`, `useSceneSelection`, `useMacroAssignments`).
-   Update properties panel, element panel, and preview overlay to read from store while still using builder via adapter in command layer.
-   Exit: Flagged UI operates solely on store selectors; disabling builder access at the context level does not break the UI while the flag is on.

### Phase 4 – Runtime Adapter & Visualizer Cutover

-   Implement `SceneRuntimeAdapter` that reads store state, resolves bindings/macro constants, and maintains a per-element runtime cache with version counters.
-   Rework `MIDIVisualizerCore` to inject the adapter instead of a live builder list; builder becomes a thin facade delegating to the adapter/store.
-   Optimize cache invalidation (dirty flags) and measure FPS against current implementation using profiling scenes.
-   Add fallbacks for legacy pathways (flag to revert to builder arrays) while in beta.
-   Exit: Visualizer renders via adapter with no regressions in test scenes; builder no longer keeps authoritative data structures.

### Phase 5 – Undo/Redo & Macro Consolidation

-   Move macro manager state into the store; actions update both macro values and inverse assignment index.
-   Integrate scene slice with existing undo middleware using patch recording; ensure commands affecting scene + timeline can batch into a single history entry.
-   Update macro editing UI to use store selectors/actions exclusively.
-   Exit: Undo/redo covers element CRUD, binding changes, macro value edits, and maintains consistent inverse indices after repeated operations.

### Phase 6 – Persistence & Template Refactor

-   Update `DocumentGateway.build/apply` to serialize from and hydrate into the store; keep compatibility adapters for one version.
-   Rewrite scene templates to output pure data payloads and apply them via `importScene` rather than mutating builders.
-   Migrate export pipeline and tests to rely on store data; remove old serialization helpers that touched runtime objects.
-   Exit: Persistence tests operate on store payloads; builder serialization code is removed or marked deprecated with no consumers.

### Phase 7 – Deprecation & Cleanup

-   Delete or dramatically shrink `HybridSceneBuilder`, leaving only legacy shims marked `@deprecated` (possibly behind a compatibility build flag).
-   Remove dual-write scaffolding, parity assertions, and feature flags after sustained stability.
-   Update architecture docs, onboarding guides, and coder mods to reflect new authoritative store.
-   Exit: Store is sole source of truth; legacy builder code paths removed; documentation updated; performance benchmarks stable.

## Cross-Cutting Workstreams

-   **Data Modeling & Schema Evolution**: Finalize normalized models, ID generation strategy, and stored binding shape. Provide migration utility for existing documents if property names change.
-   **Command Bus & Transaction Layer**: Define a small command abstraction (`dispatchSceneCommand`) that batches store actions, ensures undo compatibility, and logs telemetry for debugging.
-   **Macro Binding Index**: Maintain an inverse mapping (`macroId -> Set<elementId/property>`) inside the slice with dev-only validation to guard against drift.
-   **Interaction State Integration**: Relocate hover/drag/selection state from `MIDIVisualizerCore` into the store with minimal latency, exposing selectors for overlays.
-   **Performance Budgeting**: Instrument adapter and selector hot paths with profiling marks; run stress scenes (>=1000 elements) to ensure frame budget < 5ms for rebuild bursts.
-   **Feature Flagging & Rollout**: Use environment flags (e.g., `VITE_ENABLE_SCENE_STORE`) to stage rollout. Provide QA toggles and fallback to builder for emergency rollback.
-   **Tooling & Automation**: Add lint rules to enforce command usage, extend CLI scripts to run parity checks, and generate migration test fixtures automatically from reference documents.
-   **Documentation & Developer Education**: Produce quickstart notes describing new store APIs, selector patterns, and command conventions. Update ADRs/architecture docs accordingly.

## Testing & Verification Strategy

-   **Unit**: Reducers/selectors (store), runtime adapter cache invalidation, macro index maintenance, command dispatcher.
-   **Integration**: Import legacy docs → ensure store serialization round-trips; UI interaction tests covering element CRUD and macro edits via Testing Library.
-   **Regression**: Visual diff tests or snapshot of render tree to detect changes in visual output for key scenes.
-   **Performance**: Scripted benchmarks measuring adapter rebuild cost and render loop FPS before/after cutover.
-   **Manual QA**: Feature-flagged builds tested by power users; checklist derived from Section 20 of exposition document.

## Assumptions Logged

-   New store slice will live under `src/state/sceneStore.ts` alongside existing Zustand stores (to keep import consistency).
-   Existing command or middleware infrastructure can be extended to support scene transactions without introducing a new global event bus.
-   Builder mutation entry points are centralized enough (`HybridSceneBuilder` methods + `SceneSelectionContext`) that wrapping them captures all writers.
-   Document files saved today are compatible with a normalized schema that still represents bindings as constant/macro unions.

## Open Questions / Follow-Ups

-   Need confirmation on the preferred directory naming (`sceneStore.ts` vs `scene/sceneStore.ts`) to avoid conflicts with future module boundaries.
-   Should dual-write parity checks run in production behind logging, or remain dev-only to avoid performance hits? Consult with ops/observability owners.
-   How will timeline store undo batching integrate with scene commands—do we reuse existing snapshot middleware or create a unified patch queue?
-   Are there undocumented builder mutations in plugins/extensions (if any) that bypass the central UI contexts and need adapters?
-   What telemetry or analytics are required when the new store goes live (e.g., flag usage, error logging) to detect regressions quickly?

## Follow up responsese

-   just sceneStore.ts is fine
-   dual write parity checks should "run in production" to avoid any bugs relating to different processing between dev and production. The performance issue is ok because the plan is to finish refactoring till there is only one source of truth before pushing to production anyways
-   reuse existing snapshot middleware
-   Agent should carry out research to check if their are undocumented builder mutations in plugins/extensions that bypass central ui contexts and need adapters
-

## Steps towards v2

-   Add a sweep in Phase 0–1 to confirm no hidden builder mutation entry points, instead of deferring to later.
