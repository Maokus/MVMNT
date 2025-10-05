# Scene Store Architecture

The scene store (`src/state/sceneStore.ts`) is the canonical source of truth for scene structure, property bindings, macros, interaction state, and persistence metadata. All UI panels, command surfaces, and runtime adapters read and write through this normalized Zustand slice; no legacy builder mirrors remain in the mutation path.

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
All scene mutations run through the command gateway (`dispatchSceneCommand`). The gateway applies store mutations, ensures macro synchronization, and emits telemetry so downstream observers can monitor mutation performance. Representative actions:

- `addElement`, `duplicateElement`, `removeElement`, `moveElement` keep `elements`, `order`, and bindings synchronized.
- `updateBindings` patches element bindings and rebuilds the inverse macro index.
- `updateSettings` merges scene settings while preserving memoized selector stability.
- `clearScene`, `importScene`, and `exportSceneDraft` manage persistence using normalized store data only.

Undo middleware instruments the gateway so history replay stays in lockstep with the store while telemetry listeners receive the same timing metadata for monitoring dashboards.

## Selectors & Hooks
`src/state/scene/selectors.ts` exposes memoized selectors (`createSceneSelectors`) that power UI hooks (`useSceneElements`, `useSceneSelection`, macro selectors, etc.). These selectors compose ordered element views, macro assignments, and settings snapshots while keeping references stable across unrelated updates. Components import hooks from `@state/scene` to stay decoupled from underlying Zustand plumbing.

## Runtime & Persistence Integration
- `SceneRuntimeAdapter` subscribes to the store, hydrates runtime element instances, and invalidates caches based on per-element revision counters.
- `DocumentGateway` serializes from the store and hydrates it without relying on legacy builders or global singletons.
- Acceptance, fuzz, and regression suites cover command parity, macro churn, runtime hydration, and persistence round-trips so store-backed flows remain safe.

## Telemetry & Operational Monitoring
`registerSceneCommandListener` (exported from `@state/scene`) exposes a lightweight subscription for telemetry and alerting systems. Each command dispatch reports the command payload, duration, and source label so dashboards can surface anomalies (slow commands, failures) in near real time. The listener registry is side-effect free and safe to use in tests or browser devtools.
