# Scene editor refactor follow-up

## Status

The input/selection work is substantially complete. A global shortcut registry now owns the
window listener, and the scene-specific behavior lives in `useSceneShortcuts`. Core document,
undo, transport, and timeline-navigation commands register a domain and priority. Text-editable
targets are distinct from navigation targets, so tree rows remain eligible for scene deletion and
grouping.

The persistence and command work is complete. `createSceneSnapshot` lives in the
dedicated `state/scene/snapshot.ts` adapter and is used by the store facade, document gateway,
subtree bundle paths, and rollback capture. `sceneCommandDefinitions` gives every existing scene
command a persistence impact, rollback strategy, and affected-boundaries declaration. Command
types now live in `scene/commandTypes.ts`; graph mutations and their validation live in
`scene/sceneGraphCommands.ts`; transaction metadata is validated before dispatch. Store startup
subscriptions and resolver registration are composed by `scene/sceneStoreRuntimeWiring.ts`.

Scene-store composition is now split across dedicated creators for elements/bindings,
graph/node bindings, fonts/assets, and automation/macros in `state/scene/slices/`. The internal
`scene/storeTypes.ts` boundary keeps slice modules independent of the application singleton.
Record/array element normalization and graph-order preservation live in
`scene/importExportAdapter.ts`, alongside the `exportSceneDraft` compatibility adapter. Runtime
subscriptions and selection/automation resolver registration remain isolated in
`scene/sceneStoreRuntimeWiring.ts`, outside the side-effect-free slice creators.

The package-level contract now covers snapshot, undo, document application, packaged export/import,
recovery storage, subtree transfer, and failed transactional rollback for all persistent slices where
the boundary applies. Node-transform aggregate gesture state
has been extracted to `aggregateTransformSession.ts` with a direct test. Modal Escape shortcuts are
also registry-owned, so they take priority over selection Escape without adding individual window
listeners.

## Completed implementation

### Scene store slices (complete)

`src/state/sceneStore.ts` remains the stable application-facing compatibility facade.

- [x] Add slice creators and state/action contracts for elements/bindings, graph/node bindings,
      fonts/assets, and automation/macros, composed by `scene/storeComposition.ts`.
- [x] Move record/array import normalization and graph-order preservation into
      `scene/importExportAdapter.ts`; keep `createSceneSnapshot` as the canonical persistence adapter.
- [x] Keep `useSceneStore`, `createSceneStore`, `SceneStoreState`, `importScene`, and
      `exportSceneDraft` stable for existing consumers.
- [x] Keep store subscriptions and selection/automation resolver registration in
      `sceneStoreRuntimeWiring.ts`, leaving slice construction free of startup side effects.
- [x] Preserve existing store-boundary migrations and fixture behavior. Direct adapter coverage
      guards graph-ordered record normalization through both the adapter and compatibility facade.

### Canonical persistence contract (complete)

`persistence/__tests__/sceneSnapshot.contract.test.ts` verifies elements/bindings, graph/node
bindings, macros, custom-font metadata plus acknowledgement, and automation through snapshot,
scene-command undo, document application, package import, recovery storage, and subtree transfer.

- [x] Keep binary font payload verification in the existing font-package tests; the canonical
      contract verifies stored font metadata and acknowledgement only.
- [x] Use `createSceneSnapshot` at direct-state production call sites. `exportSceneDraft` remains
      only as a compatibility facade and in tests that explicitly verify that facade.

### Scene command modules (complete)

`src/state/scene/commandGateway.ts` is now a small dispatch facade.

- [x] Move inverse-patch creation to `scene/commandPatch.ts` and non-graph store mutation application
      to `scene/commandApply.ts`.
- [x] Select inverse-patch, snapshot, or transactional rollback from `sceneCommandDefinitions`.

`scene/__tests__/commandDefinitions.test.ts` now enforces declaration invariants, and the canonical
persistence contract forces a representative multi-boundary failure to restore persistent state.

### Capability splits for large modules (complete)

NodeTransformPanel now delegates form normalization, binding-value resolution, and aggregate
gesture state to direct-test modules (`nodeTransformInput.ts`, `nodeTransformValue.ts`, and
`aggregateTransformSession.ts`). Command construction remains in the component.

- [x] Split timeline state contracts/composition, transport timing, view state, and persistence
      normalization into `state/timeline/`; existing clip command and audio/cache modules remain the
      owning capability modules. The hook and command gateway surface is unchanged.
- [x] Split persistence import into artifact parsing, migration orchestration, document shaping,
      plugin/asset/audio hydration, and final document application under `persistence/import/`.
      `importScene` remains the public facade and all migrations remain covered.
- [x] Extract aggregate-edit session state and transform command construction from
      `NodeTransformPanel` into direct-tested modules.
- [x] Move mutable export queue/background ownership into `ExportLifecycleService`; bootstrap,
      render-loop, and transport hooks remain provider composition inputs.
- [x] Add direct unit coverage for the extracted view, transform-command, and export-lifecycle
      state machines, with existing public-entry integration suites retained.

### Shortcut migration audit (complete)

Core editor shortcuts use the registry, but a number of modal and panel handlers still install
their own `keydown` listeners. These are acceptable only when locally scoped and non-overlapping.

- [x] Audit modals, `AutomationLanes`, `useTimelinePointerControls`, the developer overlay,
      onboarding, and the menu bar for command overlap.
- [x] Move all global `keydown` actions in those surfaces to the shortcut registry with modal,
      focused-control, document, or timeline ownership. Component-local field handlers remain local.
- [x] Cover timeline Delete precedence only while a timeline selection can handle the command;
      modal Escape precedence remains covered.

## Completion audit

The requested public facades remain stable. The audit found no production `exportSceneDraft()`
snapshot captures and no standalone global `keydown` listeners in the named shortcut surfaces.
The canonical persistence, migration, scene command, timeline, transform, export lifecycle, and
shortcut suites cover the extracted boundaries. Final repository verification uses:

```sh
npx prettier --write .
npm run test
npm run build
npm run compile
```

Verified on 2026-08-09: formatting completed, 220 test files passed (1,010 tests passed and one
pre-existing test skipped), the renderer/electron production build completed, and both TypeScript
compile targets passed.
