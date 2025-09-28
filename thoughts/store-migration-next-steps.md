# Store Migration – Next Steps Consolidation

## Current Status Snapshot

-   Zustand `sceneStore` is the authoritative source for scene elements, bindings, macros, and interaction state.
-   The command gateway dual-writes to the legacy builder and macro manager for compatibility while the runtime adapter and persistence flows already hydrate from store data first.
-   UI panels, macro tooling, and selection flows now consume store selectors/hooks directly; feature flags gating store usage have been removed.

## Outstanding Transition Work

### 1. Retire Dual-Write Paths

-   Introduce store-native element creation + schema lookup helpers so command payloads no longer require builder defaults.
-   Collapse `dispatchSceneCommand` mirroring once the store owns creation/serialization, leaving the builder as an optional compatibility layer only during soak.
-   Audit undo middleware and command instrumentation to ensure they operate without builder references before removing the legacy wiring entirely.

### 2. Remove Legacy Macro Dependencies

-   Eliminate `globalMacroManager` mirroring by moving runtime bindings, undo instrumentation, and macro UI consumers to read/write macros exclusively through the store.
-   Provide first-class TypeScript types and selectors for macro consumption so contexts/components can drop remaining `// @ts-ignore` shims around macro helpers.

### 3. Finalize Runtime & UI Independence

-   Deliver store-backed schema lookup utilities so property editors and runtime hydration stop reaching into builder instances.
-   Finish migrating the runtime adapter and visualizer to rely solely on store-derived data, then delete the remaining builder fallbacks once parity soak completes.
-   Profile render performance under the store-only runtime adapter and wire telemetry/alerts to watch for regressions ahead of general rollout.

### 4. Validation & Documentation Follow-Through

-   Extend CLI smoke/regression coverage to exercise template exports/imports using the store-only pipeline.
-   Keep acceptance, fuzz, and lint suites updated to block reintroducing direct builder mutations or macro manager dependencies.

## Suggested Next Actions

1. Spike the store-native element creation helpers and validate undo coverage without builder intervention.
2. Replace macro context consumption with typed selectors and rip out the `globalMacroManager` mirror once runtime bindings can hydrate directly from the store.
3. Schedule performance/telemetry instrumentation while the runtime adapter runs in store-only mode to catch regressions before the builder is deleted.
4. Update migration docs and onboarding guides as each dependency (builder, macro manager, feature flags) is retired to keep downstream teams aligned.
