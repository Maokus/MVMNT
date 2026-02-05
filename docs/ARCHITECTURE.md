# Architecture Overview

## Domain Boundaries

Logical domains keep responsibilities isolated:

-   **animation/** – Stateless animation primitives for piano rolls
-   **core/** – Runtime engine logic (scene runtime adapter, rendering, timing, playback clock, resource management).
-   **state/** – Zustand stores, selectors, and middleware. Hosts the canonical timeline and scene stores plus command/undo infrastructure.
-   **workspace/** – Components for the main workspace ui
-   **math/** – Generic math, geometry, and numeric helpers.
-   **export/** – Code for export functions
-   **utils/** – Shared utilities (logging, throttling, feature flag helpers, etc.).

Music theory helpers and MIDI parsing live under `core/midi/` alongside the playback/timeline stack so the runtime can consume them without depending on UI code.

## Canonical Time & Scene Authority

-   Tick-based timeline (`timelineStore`) remains the source of truth for transport, tempo, and note scheduling. Seconds/beats are derived through shared timing utilities when needed.
-   `sceneStore` holds all scene elements, bindings, macros, interaction state, and persistence metadata. UI components and runtime adapters read from this store instead of mutating legacy globals.
-   The command gateway (`dispatchSceneCommand`) is the only sanctioned mutation entry point for scene data. It applies store mutations and feeds undo/telemetry instrumentation for observability.
-   Undo middleware spans both timeline and scene domains so transactions remain atomic across stores when commands mutate multiple slices.

## Data Flow

1. User input (UI, hotkeys, transport) dispatches commands or store actions.
2. Command gateway/store actions update Zustand state and emit mutation metadata.
3. Memoized selectors derive ordered elements, macro assignments, timing windows, etc.
4. Runtime layers (`SceneRuntimeAdapter`, playback clock) consume derived data to render frames or drive audio/MIDI output.
5. Export pipeline leverages the same runtime APIs to produce deterministic renders.

## Runtime Pipeline Highlights

-   **SceneRuntimeAdapter** hydrates cached runtime objects from the store and invalidates them per element revision.
-   **Visualizer Core** consumes adapter primitives and timing data to orchestrate playback and rendering.
-   **Animation Controllers** translate ticks into easing/phase curves for visual transitions.
-   **Scheduling** iterates tick windows deterministically for playback and export.

## State & Selector Guidelines

-   Prefer hooks/selectors exported from `@state/*` barrels to keep components agnostic of store wiring.
-   Derived data (seconds, view models, macro assignments) must come from selectors rather than ad-hoc computation inside components.
-   Lint rules and tests guard against bypassing `dispatchSceneCommand` when mutating scene state.

## Error & Logging Strategy

-   Non-fatal warnings use `debug-log.ts` gating (dev builds) to reduce production noise.
-   Throw for invariant violations; surface recoverable issues via UI state.

## Testing Approach

-   Unit tests cover timing conversions, store reducers/actions, selector memoization, and runtime adapter helpers.
-   Integration tests validate command gateway parity, persistence import/export, and runtime hydration.
-   Fuzz/acceptance suites exercise macro churn, undo replay, and store-only import/export paths to guard the migration.

## Future Cleanup

-   Harden store telemetry dashboards and alerts to surface command failures quickly.
-   Continue tightening lint/test coverage to stop regressions that bypass the command gateway or normalize store invariants.
-   Keep onboarding materials current so new contributors land directly in the store-first workflow.
