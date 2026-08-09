# State and commands

## Store ownership

`useSceneStore` is composed in `src/state/scene/` and exposed through `src/state/sceneStore.ts`.
Persistent scene state includes element records, the graph, element and node bindings, macros,
automation, scene settings, and font assets. `useSceneEditorStore` separately owns automation and
property-panel state, the property clipboard, transform previews, runtime invalidation, and the
authored-document revision. Hierarchy selection remains in `useSelectionStore`.

`useTimelineStore` is exposed through `src/state/timelineStore.ts`; action implementations live in
`src/state/timeline/`. It owns transport, timing, tracks, MIDI and audio clips, media caches, and
timeline view state.

Read state through focused selectors and exported hooks. Avoid whole-store subscriptions and
component-local copies of derived document data.

## Scene commands

Call `dispatchSceneCommand(command, options)` for persistent scene edits. Commands validate input,
update related slices atomically, emit telemetry, and provide undo patches. Structural commands
cover graph operations such as add, delete, duplicate, reorder, group, ungroup, and reparent.
Property commands cover constants, macros, automation, and compound edits.

Use `batch` when several scene mutations form one user action. A failed child restores the scene
snapshot captured before the batch. Continuous pointer gestures must use a stable merge session so
intermediate updates collapse into one undo entry.

`createSceneCommandGateway(dependencies)` binds the command behavior to an isolated store for tests
and alternate runtimes. Application consumers import commands from `@state/scene`; handler modules
are not application entrypoints. Runtime services are wired by the application composition root,
not as a side effect of importing `sceneStore.ts`.

## Timeline commands

The timeline gateway supports typed commands and versioned JSON descriptors:

```ts
import { timelineCommandGateway } from '@state/timelineStore';

const result = await timelineCommandGateway.dispatchById('timeline.addTrack', {
    type: 'midi',
    name: 'MIDI track',
});
```

Persistent track and clip edits go through `src/state/timeline/commandGateway.ts`. Transport timing,
viewport state, and persistence shaping remain in their owning timeline capabilities rather than in
UI components.

## Selection and shortcuts

Selection is transient and separated by editing domain. Scene hierarchy selection is node-based;
timeline clip selection stores a point, range, or explicit clip references in `useSelectionStore`.
Clip commands resolve stored references against the current timeline, making stale references safe.

Before adding a keyboard handler, inspect `src/context/shortcuts/`, `SceneSelectionContext`, and the
timeline navigation owner. A command must have one global shortcut owner and must protect editable
targets consistently.

## Undo and telemetry

Scene and timeline gateways emit command events consumed by undo and development diagnostics.
Listeners are observational; they must not become a second mutation path. Undo snapshots use the
canonical domain export helpers rather than hand-selected state fields.

Relevant tests live near `src/state/scene/`, `src/state/timeline/`, and `src/state/undo/`.
