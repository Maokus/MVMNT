# Store-First Scene Authoring Guide

Welcome to the store-native scene authoring flow. This guide captures the canonical APIs and concepts new contributors need to work inside the store-only architecture.

## Core Principles
- **Zustand stores are authoritative.** `useSceneStore` owns elements, bindings, macros, and interaction state. `useTimelineStore` owns tempo, tracks, and transport. Avoid mutating globals or caching state outside these stores.
- **Commands mutate the scene.** All scene writes go through `dispatchSceneCommand`. It normalizes bindings, keeps macro state synchronized, hydrates undo, and now emits telemetry so observability tooling can track failures and latency.
- **Selectors drive the UI.** React components consume hooks exported from `@state/scene` (e.g., `useSceneElements`, `useSceneSelection`, `useMacroAssignments`). These hooks wrap memoized selectors so components stay referentially stable.

## Common Tasks
### Adding or Updating Elements
```ts
import { dispatchSceneCommand } from '@state/scene';

dispatchSceneCommand(
    {
        type: 'addElement',
        elementType: 'textOverlay',
        elementId: 'title',
        config: {
            text: { type: 'constant', value: 'Hello store!' },
        },
    },
    { source: 'onboarding-guide' },
);
```
Use subsequent `updateElementConfig`, `moveElement`, or `clearScene` commands to adjust the scene. All commands accept an optional `source` tag which flows into telemetry listeners.

### Importing or Exporting Scenes
`DocumentGateway.build()` serializes the current store state. `DocumentGateway.apply()` hydrates the stores from a serialized document without relying on legacy builders. Tests in `src/state/scene/__tests__` and `src/persistence/__tests__` demonstrate end-to-end usage.

### Observing Commands for Telemetry
```ts
import { registerSceneCommandListener } from '@state/scene';

const unsubscribe = registerSceneCommandListener((event) => {
    console.log('[telemetry]', event.source, event.command.type, event.durationMs);
});
```
Attach listeners from devtools, dashboards, or automated soak tests to surface slow or failing commands quickly. Call the returned function to unsubscribe when finished.

## Next Steps
- Review `docs/SCENE_STORE.md` for a deeper architectural reference.
- Explore `src/state/scene/__tests__/commandGateway.test.ts` for store-only command expectations and telemetry assertions.
- Coordinate with SRE/observability partners to wire the telemetry listener into real dashboards and alerts during soak.
