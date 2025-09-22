Use this document to add progress and notes on the store migration implementation.

## 2025-02-20 – Phase 0 pass
- Added `snapshotBuilder` helper + tests to capture builder/macros invariants.
- Recorded `scene.edge-macros` fixture and parity test (`buildEdgeMacroScene`) for regression diffing.
- DocumentGateway now covered by phase-0 regression tests (export + apply) using the fixture.
- Prototyped undo middleware reuse: instrumentation wraps builder mutations and undo/redo round-trips cleanly.
- Mutation audit written (`docs/store-migration/phase0-builder-mutation-audit.md`) enumerating all direct builder writes.
- Follow-ups: extend undo instrumentation for `updateElementId` and template resets; start plumbing command gateway for SceneSelection + menu flows.

## 2025-02-21 – Phase 1 scaffolding in place
- Implemented normalized `sceneStore` with actions for add/move/duplicate/remove, binding updates, and import/export parity (`src/state/sceneStore.ts`).
- Added memoized selectors (`createSceneSelectors`) covering ordered elements and macro inverse index (`src/state/scene/selectors.ts`).
- Documented architecture and slice responsibilities in `docs/architecture/scene-store.md`.
- Tests: `npm test -- --run src/state/scene/__tests__/sceneStore.test.ts`.
- Next: wire command gateway dual-write in Phase 2 and start replacing UI reads with selectors once command layer lands.

## 2025-02-22 – Phase 3 UI selectors groundwork
- Added interaction actions to `sceneStore` (`setInteractionState`) with normalization + coverage in `sceneStore.test.ts` so UI selection can round-trip through Zustand.
- Introduced store-facing hooks (`src/state/scene/hooks.ts`) for ordered elements, selection view, macro assignments, and raw interaction access. Re-exported via `@state/scene`.
- Feature-flagged SceneSelectionContext now hydrates from the store when `VITE_ENABLE_SCENE_STORE_UI` is on while keeping builder parity for legacy mode.
- Layer panel (`SceneElementPanel`) now reads elements/selection via selectors (`useSceneElements`, `useSceneSelection`) and falls back to context data when the flag is off.
- Feature flag helper lives at `src/config/featureFlags.ts`; enable with `VITE_ENABLE_SCENE_STORE_UI=true` during local runs to exercise the store-backed flow.

## 2025-02-23 – Phase 2 dual-write gateway
- Implemented `dispatchSceneCommand` + `synchronizeSceneStoreFromBuilder` (`src/state/scene/commandGateway.ts`) to route builder mutations through the store with parity assertions + telemetry.
- Updated store actions (`sceneStore.ts`) for element renames/macros, aligned `clearScene`, and wired SceneSelectionContext/MenuBar/VisualizerCore/DocumentGateway through the gateway.
- Added parity feature flags, undo instrumentation for `updateElementId`/template resets, and tests covering the command gateway (`commandGateway.test.ts`).
- New script `npm run lint:scene` enforces no direct `sceneBuilder` mutations outside sanctioned modules.
