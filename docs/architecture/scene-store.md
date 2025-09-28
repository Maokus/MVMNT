# Scene Store Architecture

The scene store (`src/state/sceneStore.ts`) is the canonical source of truth for scene structure, property bindings, macros, interaction state, and persistence metadata. All UI panels, command surfaces, and runtime adapters read and write through this normalized Zustand slice instead of mutating `HybridSceneBuilder` directly.

## State Layout
| Slice | Purpose |
| --- | --- |
| `settings` | Authoritative scene dimensions, tempo, and global flags (`SceneSettingsState`). |
| `elements` | Map of element metadata (`SceneElementRecord`) keyed by id. |
| `order` | Stable element ordering array that drives rendering and export. |
| `bindings` | Normalized property bindings per element plus an inverse macro index. |
| `macros` | Macro definitions and insertion order used by the macro tooling. |
| `interaction` | UI-facing interaction state (selection, hover, clipboard placeholders). |
| `runtimeMeta` | Mutation bookkeeping (schema version, dirty flags, hydration timestamps). |

Mutation helpers tag every change with a `SceneMutationSource` so undo middleware, telemetry, and command instrumentation can attribute updates as the command gateway runs.

## Actions & Command Gateway
All scene mutations run through the command gateway (`dispatchSceneCommand`). The gateway applies store mutations first, mirrors updates into legacy compatibility layers (builder + `globalMacroManager`), and asserts parity. Representative actions:

- `addElement`, `duplicateElement`, `removeElement`, `moveElement` keep `elements`, `order`, and bindings synchronized.
- `updateBindings` patches element bindings and rebuilds the inverse macro index.
- `updateSettings` merges scene settings while preserving memoized selector stability.
- `clearScene`, `importScene`, and `exportSceneDraft` manage persistence using normalized store data only.

Undo middleware instruments the gateway so history replay stays in lockstep with the store. As we eliminate legacy dependencies the gateway will transition to store-only payloads.

## Selectors & Hooks
`src/state/scene/selectors.ts` exposes memoized selectors (`createSceneSelectors`) that power UI hooks (`useSceneElements`, `useSceneSelection`, macro selectors, etc.). These selectors compose ordered element views, macro assignments, and settings snapshots while keeping references stable across unrelated updates. Components import hooks from `@state/scene` to stay decoupled from underlying Zustand plumbing.

## Runtime & Persistence Integration
- `SceneRuntimeAdapter` subscribes to the store, hydrates runtime element instances, and invalidates caches based on per-element revision counters.
- `DocumentGateway` serializes from the store and hydrates it before optionally syncing the legacy builder for backward compatibility.
- Acceptance, fuzz, and regression suites cover command parity, macro churn, runtime hydration, and persistence round-trips so store-backed flows remain safe.

## Compatibility & Remaining Cleanup
The legacy builder remains only as a mirror updated by the command gateway to support straggling consumers. Next steps focus on delivering store-native element creation/schema helpers, removing the `globalMacroManager` mirror, and deleting the builder once runtime, undo, and telemetry no longer reference it. Until then, parity assertions and linting guard against reintroducing direct builder mutations.
