# Store Migration – Next Steps Consolidation

## Current Status Snapshot

-   Zustand `sceneStore` is the authoritative source for scene elements, bindings, macros, and interaction state.
-   The command gateway now mutates the store directly; builder mirroring and macro manager writes have been removed.
-   UI panels, macro tooling, the runtime adapter, and persistence flows read through store selectors/hooks; store-only acceptance tests cover imports, exports, and command parity.

## Completion Update

-   ✅ Remaining builder-centric types, comments, and docs have been removed so the codebase presents a store-only mental model.
-   ✅ Telemetry listeners now fire for every command gateway invocation, enabling dashboards and soak tests to monitor store mutations.
-   ✅ Onboarding documentation has been refreshed with a store-first guide for new contributors.

## Remaining Tasks Before Declaring the Migration Complete

### ~~1. Remove Legacy Builder References End-to-End~~ ✅

-   Removed the vestigial `SceneBuilder` type definitions and scrubbed builder-specific comments in undo/runtime modules so only store concepts remain.
-   Updated architecture docs, README snippets, and acceptance tests to describe the store-only flow.

### ~~2. Harden QA & Telemetry for Store-Only Operation~~ ✅

-   Added a telemetry listener registry that fires on every command gateway dispatch, enabling soak tests and dashboards to watch store mutations.
-   Expanded store command tests to assert telemetry emission and renamed regression suites to highlight store-only coverage.

### ~~3. Finalize Communication & Onboarding Updates~~ ✅

-   Published a store-first onboarding guide summarizing command usage, selectors, and telemetry hooks for new contributors.

## Suggested Next Actions

1. Integrate the `registerSceneCommandListener` telemetry feed with production dashboards and alerting.
2. Expand soak/regression automation to assert telemetry health alongside existing store-only import/export tests.
3. Socialize the onboarding guide with downstream teams and collect feedback for iterative improvements.
