# Store-First Runtime Vision

## Purpose
This document outlines the target interaction model between the normalized scene store, the `SceneRuntimeAdapter`, the visualizer core, and the UI layer once the migration to the Zustand-backed architecture is complete. It complements the Store Migration Implementation Plan by focusing on the run-time stack that renders and interacts with scenes.

## Target Architecture Overview
- **Zustand Scene Store** remains the single source of truth for all scene, macro, and interaction data. It exposes typed selectors that surface normalized records, derived lists, and interaction metadata.
- **SceneRuntimeAdapter** listens to store slices, hydrates normalized records into cached runtime objects, and exposes a query surface that higher layers use to render without touching raw store structures.
- **Visualizer Core (`MIDIVisualizerCore` successor)** consumes the adapter APIs to drive rendering, timing, and playback orchestration. It becomes agnostic to how scenes are stored as long as the adapter contracts stay intact.
- **UI Layer** splits into two strata: the canvas renderer (React/Canvas/WebGL hybrid) that works with runtime primitives delivered by the core, and the rest of the UI (inspector panels, timelines, toolbars) that talks directly to the store via hooks/commands.

The goal is a triangular flow: UI commands mutate the store, the adapter produces new/updated runtime assets, and the core pushes those into the render loop.

## Component Responsibilities & Interaction Points
### Zustand Scene Store
- Publishes immutable snapshots through selectors (`useSceneElements`, `useSceneSelection`, `useMacroAssignments`, etc.).
- Provides command gateways that wrap store mutations in undo-aware transactions.
- Emits change events (via Zustand subscriptions) that the adapter and interaction services respond to.

### SceneRuntimeAdapter
- **Hydration:** Creates `SceneElement` runtime instances from normalized store records, resolving bindings, macros, and asset references.
- **Caching & Dirtiness:** Maintains per-element signatures/versions so that only dirty elements are rehydrated when store slices change.
- **Diagnostics:** Reports hydration failures or data contract issues back to the store (e.g., via a diagnostics slice) for surfaced warnings.
- **Runtime Queries:** Offers typed getters like `getElementRuntime(id)`, `getRenderableSceneGraph()`, and `getPerformanceBudget()` that the visualizer core calls.
- **Legacy-free Operation:** Does not fall back to builder code paths; instead, hydration failures trigger diagnostics and, optionally, feature flags to protect releases.

### Visualizer Core
- Subscribes to the adapter for render-ready graphs and timing metadata.
- Owns the render loop, animation frame scheduling, and integration with audio/MIDI pipelines.
- Dispatches interaction updates (hit-testing, hover, drag) back through store commands so that state remains normalized.
- Acts as the integration point for platform services (e.g., transport controls, analytics) but never mutates scene data directly.

### UI Layer
#### Canvas Renderer
- Receives render graph snapshots or incremental updates from the core.
- Delegates pointer/gesture events to core-provided handlers which, in turn, dispatch store commands.
- Re-renders only the affected regions when adapter invalidates runtime nodes.

#### Panels, Toolbars, Timelines
- Consume store selectors/hooks for data (e.g., selection, properties, macros).
- Dispatch commands via the gateway (`dispatchSceneCommand`) to mutate the store.
- Listen for diagnostics surfaced by the adapter to highlight issues in the UI (e.g., error badges, toast notifications).

## Data Flow Summary
1. **User Interaction:** UI dispatches a typed command (`dispatchSceneCommand({ type: "updateElement", payload })`).
2. **Store Update:** Scene store reducers apply the change, updating normalized state and emitting version bumps.
3. **Adapter Reaction:** `SceneRuntimeAdapter` subscription detects changed slices, rehydrates dirty runtime elements, and updates caches.
4. **Core Update:** Visualizer core pulls the refreshed runtime graph and schedules render updates / audio sync.
5. **UI Feedback:** Canvas re-renders, panels reflect the latest selector outputs, and diagnostics (if any) are surfaced.

## Retired Files & Pipelines
- **`src/core/scene-builder.ts` and related builder helpers**: fully replaced by store selectors, commands, and the adapter. Any thin shims that once dual-wrote to the store are removed.
- **Legacy hydration pipelines** such as `HybridSceneBuilder` and the `buildScene()` factories: superseded by adapter-based hydration.
- **Direct builder-based persistence utilities** (`DocumentGateway` helpers that consume runtime objects) are replaced by store-driven serialization.
- **Context providers that expose builder mutations** (e.g., `SceneSelectionContext` legacy API) are deleted once panels rely solely on store hooks.
- **Legacy runtime caches** tied to builder lifecycle (e.g., `SceneElementCache`, `LegacyRenderCache`) are consolidated into the adapter cache implementation.

## Remaining Work to Reach This Vision
- Finalize and stabilize the scene store schema, ensuring all existing documents migrate cleanly.
- Complete dual-write parity checks and retire builder mutation entry points, guaranteeing the store is authoritative.
- Implement the production-ready `SceneRuntimeAdapter` with diagnostics and performance telemetry.
- Refactor `MIDIVisualizerCore` to consume adapter APIs, including adapting tests/benchmarks to the new data flow.
- Migrate canvas rendering and interaction handlers to the core/store contract; remove any lingering local state hacks.
- Update panels and tooling to rely exclusively on store selectors and command gateways; delete builder-dependent contexts.
- Replace persistence pipelines with store-based import/export flows and run regression suites to confirm parity.
- Document new extension points and contribution guidelines so future features hook into the store-first runtime correctly.

## Migration Execution Plan

### Runtime Adapter Roadmap
1. **Adapter hardening (Week 1):**
   - Finish parity instrumentation inside `SceneRuntimeAdapter`, logging hydration failures and mismatched signatures.
   - Add metrics hooks so parity errors can be surfaced in devtools and analytics dashboards.
2. **Core integration scaffolding (Week 2):**
   - Wrap the adapter in a lightweight provider that exposes `getRenderableSceneGraph()`, `getDiagnostics()`, and `subscribe()` APIs.
   - Build a compatibility shim that lets the legacy `HybridSceneBuilder` continue to hydrate while the adapter feeds parity snapshots (feature-flagged).
3. **`MIDIVisualizerCore` adoption (Weeks 3-4):**
   - Create adapter-backed constructors that inject the provider instead of directly instantiating `HybridSceneBuilder`.
   - Update render loop, timing, and persistence pathways to query adapter APIs; remove direct builder reads/writes.
   - Migrate unit/integration tests to mock the adapter contracts, ensuring coverage for diagnostics propagation and scene serialization.
4. **Runtime-only validation (Week 5):**
   - Run performance benchmarks to compare adapter-backed rendering with legacy builder paths and tune caching thresholds.
   - Capture telemetry on hydration churn to validate selector granularity and macro binding updates.

### UI Migration Milestones
1. **Selector-first panels (Week 1):**
   - Update panel hooks (scene element list, macro manager, timeline) to consume the Zustand selectors exclusively.
   - Remove legacy fallbacks that read `sceneBuilder.elements`, replacing them with selector-driven derived data.
2. **Command-only tooling (Week 2):**
   - Audit devtools and window tooling (`registerWindowTools`) to ensure all mutations go through `dispatchSceneCommand`.
   - Add parity-aware logging to highlight any remaining direct builder mutations invoked from the console.
3. **Context consolidation (Weeks 3-4):**
   - Collapse `SceneSelectionContext` into a selector-based provider that forwards only store state and command helpers.
   - Update canvas/preview interactions to rely on store-backed callbacks (no builder mutations) and gate builder reads behind feature flags.
4. **UX verification & cleanup (Week 5):**
   - Run manual QA flows (element CRUD, macro editing, undo/redo) against the selector-driven UI.
   - Delete deprecated builder utilities and update documentation to reflect the new data flow for contributors.

### Dependencies & Risk Mitigation
- Maintain dual-write parity assertions throughout the rollout to prevent regressions; enable strict mode in CI before removing fallbacks.
- Stage the `MIDIVisualizerCore` integration behind a feature flag to allow incremental rollout and quick rollback.
- Coordinate persistence pipeline changes with adapter adoption so export/import paths always operate on normalized store payloads.

