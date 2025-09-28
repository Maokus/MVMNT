# Store Migration – Next Steps Consolidation

## Current Status Snapshot

-   Zustand `sceneStore` is the authoritative source for scene elements, bindings, macros, and interaction state.
-   The command gateway now mutates the store directly; builder mirroring and macro manager writes have been removed.
-   UI panels, macro tooling, the runtime adapter, and persistence flows read through store selectors/hooks; store-only acceptance tests cover imports, exports, and command parity.

## Remaining Tasks Before Declaring the Migration Complete

### 1. Remove Legacy Builder References End-to-End

-   Delete any lingering `SceneBuilder`/builder compatibility types or globals that were left as temporary shims (e.g., undo instrumentation comments, type declarations).
-   Sweep documentation (architecture notes, migration guides) to excise references to builder mirroring or dual-write behavior so new readers see the store-only model.

### 2. Harden QA & Telemetry for Store-Only Operation

-   Extend CLI smoke/regression coverage to explicitly run without legacy components and verify template export/import flows under the store-only pipeline.
-   Ensure runtime telemetry and alerting watch store-only mutation paths during soak so regressions surface quickly after the compatibility layer is deleted.

### 3. Finalize Communication & Onboarding Updates

-   Publish an updated onboarding/migration guide that documents store-first APIs, macro selectors, and removal timelines for the legacy systems.

## Suggested Next Actions

1. Sweep the codebase and docs to delete the remaining builder-oriented types/globals and align references with the store-only path.
2. Add/expand store-only CLI smoke coverage plus runtime telemetry dashboards to validate exports/imports and mutation performance without legacy shims.
3. Ship the updated onboarding guide and communication plan so downstream teams are ready for the compatibility layer removal.
