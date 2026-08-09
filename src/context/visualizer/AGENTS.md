# Visualizer Context Ownership

- `VisualizerContext.tsx` is the public React facade. Keep it focused on selecting stores, owning the renderer, and wiring capability hooks.
- `useVisualizerBootstrap` owns renderer/bootstrap setup, `useRenderLoop` owns frame scheduling, and `useTransportBridge` owns timeline-clock synchronization.
- Export state transitions and background-export setup belong in `useExportLifecycle`, backed by `ExportLifecycleService`. Do not add export cleanup effects directly to the facade.
- Verify focused changes with `npx vitest run src/context/visualizer` and run the root verification suite before handoff.
