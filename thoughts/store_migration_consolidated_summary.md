# Store Migration Consolidated Status

## Current State

-   The Zustand `sceneStore` is the authoritative source for scene elements, macros, bindings, interaction state, and persistence; UI selectors/hooks (`useSceneElements`, `useSceneSelection`, macro hooks) now read exclusively from the store.
-   Command gateway (`dispatchSceneCommand`) drives all scene mutations with undo coverage, parity checks, and legacy builder mirroring; runtime adapter and persistence layers hydrate from store data first with builder kept only as a compatibility shim.
-   Runtime integration (`SceneRuntimeAdapter` and MIDI visualizer) renders via store-derived runtime primitives, macro tooling operates through store actions with fuzz/acceptance coverage, and feature flags gating store-backed flows have been removed.
-   Regression, lint, and fuzz suites cover builder parity, command gateway, runtime adapter, macros, and persistence; documentation and acceptance tests are in place to guard the migration phases.

## Intended Final Result

-   A store-first runtime stack where the Zustand store is the sole source of truth, runtime adapter/cache hydrates renderable assets, and the visualizer/UI operate without requiring legacy builder instances.
-   Command handling, undo/redo, and persistence operate purely on store-native data structures, enabling template/persistence flows, runtime hydration, and UI property editing without dual-write paths.
-   Legacy builder, macro manager shims, and feature-flag scaffolding are fully retired after parity soak, leaving a simplified, well-tested architecture.

## Remaining Steps

-   Remove dual-write behavior by introducing store-native element creation, schema lookup helpers, and store-backed command payloads so builder mutations become optional and eventually deleted.
-   Migrate remaining runtime/undo consumers off the builder and global macro manager, providing store-centric helpers where necessary before removing legacy dependencies entirely.
-   Extend profiling/telemetry and CLI smoke coverage for runtime performance and template exports to validate the store-only flow prior to full rollout.
-   Continue monitoring acceptance, fuzz, and regression suites while adding canary telemetry to ensure stability before decommissioning the legacy builder stack.
