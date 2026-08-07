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
command a persistence impact, rollback strategy, and affected-boundaries declaration. The original
large modules have not yet been fully split into their requested capability files.

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

`persistence/__tests__/sceneSnapshot.contract.test.ts` now verifies elements/bindings, graph/node
bindings, macros, custom-font metadata plus acknowledgement, and automation through snapshot,
scene-command undo, and document application. It does not yet exercise package import, recovery,
or subtree transfer in the same contract suite.

- Extend the existing contract fixture through package export/import, recovery autosave/load, and
  subtree transfer where a field is applicable.
- Add an explicit failed-command rollback assertion alongside the existing undo assertion.
- Assert both data equality and absence of transient interaction/runtime fields. Keep binary font
  payload verification in the existing font-package tests; this contract should verify the stored
  font metadata.
- Replace residual `exportSceneDraft()` snapshot capture call sites, including the command gateway
  facade, with the named snapshot helper where direct state access is already available.

### Scene command modules

`src/state/scene/commandGateway.ts` remains about 1,080 lines and still contains the command
union, inverse patch generation, mutation application, and graph operations.

- Move command discriminated-union types and metadata into `scene/commands/types.ts` and a typed
  registry module. Avoid a type-only import cycle from command definitions back into the gateway.
- Move inverse-patch creation to a patch module and store mutation application to an apply module.
- Move graph-specific command validation and application (group, ungroup, subtree deletion,
  duplication, reorder, reparent, transform) into a graph-command module.
- Make the definition metadata executable: dispatch should consistently choose inverse-patch,
  snapshot, or transactional rollback from the definition, and validate that multi-boundary
  commands have a transaction declaration before applying.
- Add tests that enumerate command definitions, verify every command declares metadata, and force
  representative multi-boundary failures to restore all persistent slices.

`scene/__tests__/commandDefinitions.test.ts` now enforces the declaration invariants. Failure
coverage for representative multi-boundary operations remains to be added.

### Capability splits for large modules

NodeTransformPanel now delegates form normalization and binding-value resolution to direct-test
modules (`nodeTransformInput.ts` and `nodeTransformValue.ts`), but its aggregate-session and
command-construction behavior remains in the component. The requested staged splits are otherwise
not complete.

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
- Add a registry integration test for modal Escape taking precedence over scene Escape and timeline
  Delete taking precedence only when its selection target is active.

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
