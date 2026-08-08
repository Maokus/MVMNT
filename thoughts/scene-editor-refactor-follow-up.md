# Scene editor refactor follow-up

## Status

The input/selection work is substantially complete. A global shortcut registry now owns the
window listener, and the scene-specific behavior lives in `useSceneShortcuts`. Core document,
undo, transport, and timeline-navigation commands register a domain and priority. Text-editable
targets are distinct from navigation targets, so tree rows remain eligible for scene deletion and
grouping.

The persistence and command work is partially complete. `createSceneSnapshot` now lives in the
dedicated `state/scene/snapshot.ts` adapter and is used by the store facade, document gateway,
subtree bundle paths, and rollback capture. `sceneCommandDefinitions` gives every existing scene
command a persistence impact, rollback strategy, and affected-boundaries declaration. Command
types now live in `scene/commandTypes.ts`; graph mutations and their validation live in
`scene/sceneGraphCommands.ts`; transaction metadata is validated before dispatch. Store startup
subscriptions and resolver registration are composed by `scene/sceneStoreRuntimeWiring.ts`.

The package-level contract now covers snapshot, undo, document application, packaged export/import,
recovery storage, subtree transfer, and failed transactional rollback for all persistent slices where
the boundary applies. Node-transform aggregate gesture state
has been extracted to `aggregateTransformSession.ts` with a direct test. Modal Escape shortcuts are
also registry-owned, so they take priority over selection Escape without adding individual window
listeners.

## Remaining implementation work

### Scene store slices

`src/state/sceneStore.ts` is still about 2,455 lines and contains all slice state, mutations,
import behavior, and snapshot adapters in one module.

- Extract slice creators and their state/action types for elements/bindings, graph/node bindings,
  fonts/assets, and automation/macros.
- Move scene import normalization into an import/export adapter module. `createSceneSnapshot` is
  already extracted. Keep `useSceneStore`, `createSceneStore`, `SceneStoreState`, `importScene`, and
  `exportSceneDraft` as compatibility facades.
- Move store wiring subscriptions and selection/automation resolver registration to a composition
  module so slice modules remain free of startup side effects.
- Preserve the current scene migration behavior and fixture baseline during the move.

### Canonical persistence contract

`persistence/__tests__/sceneSnapshot.contract.test.ts` verifies elements/bindings, graph/node
bindings, macros, custom-font metadata plus acknowledgement, and automation through snapshot,
scene-command undo, document application, package import, recovery storage, and subtree transfer.

- Keep binary font payload verification in the existing font-package tests; this contract verifies
  the stored font metadata and acknowledgement only.
- Replace residual `exportSceneDraft()` snapshot capture call sites with the named snapshot helper
  where direct state access is already available. The command gateway now uses the helper.

### Scene command modules

`src/state/scene/commandGateway.ts` still contains inverse patch generation and non-graph mutation
application, but command types and graph operations are now separate modules.

- Move inverse-patch creation to a patch module and store mutation application to an apply module.
- Complete dispatch strategy selection so definitions, rather than gateway defaults, select
  inverse-patch, snapshot, or transactional rollback.

`scene/__tests__/commandDefinitions.test.ts` now enforces declaration invariants, and the canonical
persistence contract forces a representative multi-boundary failure to restore persistent state.

### Capability splits for large modules

NodeTransformPanel now delegates form normalization, binding-value resolution, and aggregate
gesture state to direct-test modules (`nodeTransformInput.ts`, `nodeTransformValue.ts`, and
`aggregateTransformSession.ts`). Command construction remains in the component.

- Split `timelineStore.ts` into state composition, transport/timing, tracks/clips, audio/cache,
  view state, and persistence adapters. Retain the existing hook and timeline command gateway
  surface.
- Split `persistence/import.ts` into parsing/validation, migration orchestration, asset and plugin
  hydration, and final document application. Import cancellation is already extracted to
  `persistence/import-abort.ts`. Retain `importScene` as the public facade and retain all tested
  migrations.
- Continue reducing `NodeTransformPanel` to layout/wiring by extracting aggregate-edit session
  state and transform command construction into direct-test modules. Value resolution is already
  extracted.
- Split `VisualizerContext` export queue/background lifecycle into a dedicated hook or service.
  Background-export bootstrap parsing is already extracted to
  `context/visualizer/backgroundExportBootstrap.ts`; bootstrap, render loop, and transport already
  have hooks and should remain the provider's composition inputs.
- For every extracted pure transform or interaction state machine, add direct unit coverage and a
  public-entry-point integration test where lifecycle wiring is involved.

### Remaining shortcut migration audit

Core editor shortcuts use the registry, but a number of modal and panel handlers still install
their own `keydown` listeners. These are acceptable only when locally scoped and non-overlapping.

- Audit `src/workspace/modals`, `AutomationLanes`, `useTimelinePointerControls`, the developer
  overlay, onboarding, and menu bar for command overlap.
- Move overlapping global actions to the registry with a modal or focused-control domain. Keep
  component-local focus management local.
- Add a registry integration test for timeline Delete taking precedence only when its selection
  target is active. Modal Escape precedence is covered by the registry test.

## Recommended order and acceptance criteria

1. Complete scene-store composition and move snapshot/import adapters first; run the new persisted
   scene contract suite before and after each extraction.
2. Split the scene command gateway around the now-stable snapshot adapter, with transactional
   rollback tests guarding each cross-slice graph operation.
3. Extract timeline and import capabilities, then finish NodeTransformPanel and visualizer export
   lifecycle modules without changing their public entry points.
4. Finish the shortcut audit after the consuming capability modules have stable ownership.

Completion requires all requested public facades to remain stable, all existing migration tests to
pass, and the root verification commands to pass:

```sh
npx prettier --write .
npm run test
npm run build
npm run compile
```
