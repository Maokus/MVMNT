# Store Migration Follow-up Summary

## Part 1 – Build/Test Stabilization
- Installed missing `@rollup/rollup-linux-x64-gnu` binary so `npm run build` succeeds on Linux.
- Updated `dispatchSceneCommand` to prevent duplicate macro mutations when a builder is present, ensuring command gateway tests pass.
- Reworked persistence undo tests to focus on store state, then removed legacy builder-centric suites that no longer reflect the store-first workflow.

## Part 2 – Store-First Cleanup
- Removed store feature flags and parity wiring, making the Zustand scene store the default execution path.
- Simplified `commandGateway` to perform store mutations first while keeping a thin builder compatibility layer.
- Updated runtime initialization to always enable the `SceneRuntimeAdapter` and refreshed contexts/devtools to use the store API even when no builder is available.
- Deleted builder-dependent persistence tests and adjusted remaining tests and fixtures to assert against store exports instead of the legacy builder.

## Part 1 (Current) – Test Stability Audit
- Investigated build/test regressions after the store-first changes and confirmed the production build and full Vitest suite pass after removing obsolete builder hooks.
- Ensured store-driven command paths cover element CRUD, macro updates, and timeline synchronization so tests no longer depend on the hybrid builder fallback.

## Part 2 (Current) – Store-Only UI Pass
- Reworked `SceneSelectionContext`, `SceneElementPanel`, and preview canvas utilities to operate solely on Zustand selectors, leaving the builder as an optional compatibility shim for the property panel.
- Updated menu actions, macro context, and MidiVisualizer template bootstrapping to dispatch commands directly to the store, eliminating builder feature flags and legacy refresh code.
- Cleaned up UI panels to consume store-derived settings (e.g., export dimensions) and removed unused builder props from macro configuration components.
