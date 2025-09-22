# Scene Store Architecture

The scene store (`src/state/sceneStore.ts`) provides a normalized Zustand slice that replaces direct `HybridSceneBuilder` mutations. It centralizes scene data, maintains macro bindings, and exposes import/export helpers that operate entirely on serializable data.

## Top-Level State

| Slice | Purpose |
| --- | --- |
| `settings` | Authoritative scene dimensions & tempo (`SceneSettingsState`). |
| `elements` | Map of element metadata (`SceneElementRecord`) keyed by id. |
| `order` | Stable element ordering array used by runtime/layout. |
| `bindings` | Normalized property bindings per element plus a macro inverse index. |
| `macros` | Snapshot of global macros (`SceneMacroState`) with insertion order. |
| `interaction` | UI-facing interaction state (selection, hover, clipboard placeholders). |
| `runtimeMeta` | Mutation bookkeeping (schema version, dirty flags, hydration timestamps). |

`SceneMutationSource` tags every mutating action so telemetry/undo layers can attribute changes once middleware is wired up in later phases.

## Property Bindings & Macro Indexing

- `ElementBindings` capture each property as either a constant or macro reference.
- `rebuildMacroIndex` produces `byMacro`, an inverse map of macro id → assignments. It runs after every mutation to guarantee consistency for parity checks and later telemetry.
- Helpers (`cloneBinding`, `deserializeElementBindings`, `serializeElement`) keep bindings immutable and serialize back to `PropertyBindingData` without invoking the builder.

## Actions

The store currently ships with:

- `addElement`, `duplicateElement`, `removeElement`, `moveElement` — manage `elements`, `order`, and binding maps while keeping macro assignments synchronized.
- `updateBindings` — applies partial binding patches and refreshes the inverse index.
- `updateSettings` — merges into `settings` while preserving memoized selector stability.
- `clearScene` — wipes elements/order/bindings but leaves macros for future reuse.
- `importScene` / `exportSceneDraft` — round-trip the Phase 0 fixture shape using store data only (fulfilling the Phase 1 acceptance criteria).

Every mutation funnels through `markDirty` so `runtimeMeta.persistentDirty` reflects unsaved work and captures the last mutation source/timestamp.

## Selectors

`src/state/scene/selectors.ts` exports `createSceneSelectors`, which builds memoized selectors per consumer:

- `selectOrderedElements` returns the ordered element views (id, type, bindings) and keeps references stable when unrelated slices change.
- `selectMacroAssignments` exposes the macro inverse index as a sorted list for telemetry or inspection.
- `selectElementById` and `selectSceneSettings` provide convenience accessors.

A shared `sceneSelectors` instance is exported for components that do not need isolated caches, while tests can instantiate their own selectors to control memoization boundaries.

## Import/Export Flow

`importScene` accepts the builder-style serialized payload (match to `scene.edge-macros.json`) and constructs state with fully normalized bindings. `exportSceneDraft` walks the store order and emits the same shape, including sequential `index` values and macro packages, so persistence and undo systems can operate without `HybridSceneBuilder` involvement.

## Testing

`src/state/scene/__tests__/sceneStore.test.ts` covers:

- Phase 0 fixture round-trip via store import/export.
- Macro index consistency when bindings mutate.
- Duplication and reordering flows.
- Selector memoization stability under unrelated updates.

Run with `npm test -- --run src/state/scene/__tests__/sceneStore.test.ts` for a quick verification pass.
