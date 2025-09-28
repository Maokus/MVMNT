# Cleanup Proposal v1

## 1. Eliminate dual macro state to simplify mental model

-   **Observation:** Scene commands update both the Zustand store and the legacy `globalMacroManager`, and runtime/UI consumers still read from that singleton (`dispatchSceneCommand` `applyMacroSideEffects`, `MacroContext`, `SceneElement`). This creates two sources of truth that new contributors have to reason about and increases the risk of state drift.【F:src/state/scene/commandGateway.ts†L1-L177】【F:src/context/MacroContext.tsx†L1-L92】【F:src/core/scene/elements/base.ts†L1-L196】
-   **Proposal:** Introduce a dedicated macro synchronization service backed by the store. Export selector-driven helpers for runtime bindings so elements read macro values from store snapshots rather than the global manager. Deprecate the singleton by routing legacy APIs through the new service until they can be removed entirely. This allows us to delete the macro side-effects block in the command gateway and removes the need for `@ts-ignore` imports in React contexts.

## 2. Break up the Visualizer context monolith

-   **Observation:** `VisualizerContext` mixes canvas bootstrap, render loop management, transport synchronization, and event wiring in a single 500+ line hook with long comments referencing the retired scene builder, which makes the lifecycle very hard to follow for newcomers.【F:src/context/VisualizerContext.tsx†L120-L256】
-   **Proposal:** Extract the render-loop logic, transport subscriptions, and initialization routines into focused hooks/modules (e.g., `useVisualizerBootstrap`, `useRenderLoop`, `useTransportBridge`). While doing so, update the stale builder-centric comments and document the expected call order. This will make the context easier to navigate and simplify testing.

## 3. Clarify timeline time-domain helpers

-   **Observation:** The timeline store keeps canonical state in ticks but exposes helpers that accept seconds/bars and rely on `any` casts against `Partial<TimelineState>`, which hides type errors and leaves questions about which time domain each field represents.【F:src/state/timelineStore.ts†L12-L37】【F:src/state/timelineStore.ts†L42-L136】
-   **Proposal:** Split the conversion helpers into a dedicated `timelineTime` module that works with explicit typed inputs (`TimelineTimingContext`). Update the store/actions/selectors to call those helpers so we can remove the `any` casts and document which units each method expects. Supplement with unit tests that cover ticks↔seconds conversions to make the behavior discoverable.

## 4. Remove ad-hoc TypeScript suppressions around macros

-   **Observation:** `MacroContext` still relies on `// @ts-ignore` to import the macro manager even though the scene store is now authoritative, signalling an incomplete type story for macro APIs.【F:src/context/MacroContext.tsx†L1-L90】
-   **Proposal:** Migrate callers to store-powered selectors as described in item 1. This will reduce friction for future refactors and improve IDE support.
