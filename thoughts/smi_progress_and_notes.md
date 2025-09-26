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

## 2025-09-22 – Phase 4 runtime adapter shakedown
- Introduced `SceneRuntimeAdapter` (`src/state/scene/runtimeAdapter.ts`) to hydrate/cached `SceneElement` instances from the Zustand store with per-element revision tracking + diagnostics.
- Wired `MIDIVisualizerCore` to prefer the adapter behind `VITE_ENABLE_SCENE_RUNTIME_ADAPTER`, with automatic fallback + disposal pathways to legacy builder rendering on failures.
- Added `SceneRuntimeAdapter` coverage (`runtimeAdapter.test.ts`) verifying selective cache invalidation + order stability, and updated feature flags (`enableSceneRuntimeAdapter`).
- Commands: `npm test -- --run src/state/scene/__tests__/runtimeAdapter.test.ts`, `npm run lint:scene`.
- Follow-up: profile render FPS vs builder baseline and plumb telemetry hooks before enabling the runtime adapter in canary builds.

## 2025-09-23 – Phase 5 macro consolidation & undo
- Scene macros now live in the store: added `createMacro`, `updateMacroValue`, and `deleteMacro` actions plus selectors/hooks so UI pulls from Zustand when `VITE_ENABLE_SCENE_STORE_MACROS` (defaults to `VITE_ENABLE_SCENE_STORE_UI`).
- `MacroContext`, property panels, and macro config dispatch through the command gateway which dual-writes builder + store and respects feature flags; fallbacks keep legacy manager functional if builder unavailable.
- Undo instrumentation now wraps macro manager methods; regression added in `scene-middleware.integration.test.ts` to confirm snapshots capture macro and timeline state.
- Randomized fuzz test `macroIndex.fuzz.test.ts` exercises bindings/macro churn and asserts inverse index correctness.
- Manual reminder: enable `VITE_ENABLE_SCENE_STORE_MACROS` to exercise the store-backed macro UI; legacy path remains for safety toggles.

## 2025-09-24 – Phase 6 persistence & templates
- DocumentGateway now serializes exclusively from the scene store and hydrates it before optionally syncing the legacy builder; macros are restored even when no builder is present.
- Scene templates emit pure data payloads, hydrate the store via `importScene`, and then reuse the command gateway for builder compatibility.
- Regression coverage added for store-only hydration, legacy padding normalization, and template-driven exports (`npm test -- --run src/persistence/__tests__/persistence.phase0.scene-regression.test.ts`).
- Follow-up: extend CLI smoke to cover template payload export once timeline normalization scripts land.

## 2025-09-25 – Phase 7 kickoff & verification sweep
- Added `storeMigration.acceptance.test.tsx` to codify the acceptance criteria for phases 1-6 in a single suite and keep regressions visible.
- Defaulted `VITE_ENABLE_SCENE_STORE_UI`/`MACROS` to `true` so the store-backed flows are the standard path; env vars remain as a rollback hatch if needed.
- Marked `HybridSceneBuilder` as deprecated in-place to signal remaining legacy usage that still needs to be unwound.
- Next: collapse dual-write mode once store-only command payloads exist, then delete feature flag plumbing entirely.

## 2025-09-26 – Phase 7 cleanup sprint
- Removed the store UI/macro feature flags and made the Zustand selectors the sole data source for selection panels, macro tooling, and property editors.
- Updated `MacroContext`, `MacroConfig`, and the element property panels to read/write macro assignments directly through the store while still mirroring updates into `globalMacroManager` for runtime compatibility.
- Simplified `SceneSelectionContext` and the scene element panel so interaction state always flows through `useSceneSelection`, eliminating the legacy selection mirror state.
- Authored the "Store Migration Briefing" note for legacy engineers summarizing the entire migration and documenting where element bindings now live.
