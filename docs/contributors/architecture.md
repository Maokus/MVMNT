# Application architecture

## Domain boundaries

The React workspace receives input and dispatches persistent changes through the scene or timeline
command gateway. Zustand stores hold authoritative document and interaction state. Selectors derive
stable views for React and runtime adapters. Rendering and export consume the same scene and timing
services so preview and deterministic output follow the same model.

```text
UI and shortcuts
      ↓
command gateways ──→ commit stream ──→ undo
       │
       └────────────→ observational telemetry
      ↓
Zustand stores
      ↓
selectors and runtime adapters
      ↓
preview, audio/MIDI playback, and export
```

## Authority

- `useSceneStore` owns the authored scene document: elements, graph, bindings, macros, automation,
  settings, and font assets.
- `useSceneEditorStore` owns scene-specific transient editor/session state. Panel state and transform
  previews never enter scene snapshots.
- `useDocumentRevisionStore` is the single dirty-tracking authority for authored scene, metadata,
  asset, and timeline commands.
- `useTimelineStore` owns tempo, transport, tracks, clips, source caches, and the timeline viewport.
- `dispatchSceneCommand` is the canonical persistent scene mutation path.
- `timelineCommandGateway` is the canonical persistent timeline mutation path.
- `SceneRuntimeAdapter` resolves authored scene state plus editor previews into paint records and
  editor geometry.
- `TimingManager` owns tick, beat, and second conversion against the current tempo map.

Undo observes the protected command-commit stream from both domains and stores canonical domain
snapshots or patches. Telemetry listeners remain observational and can be reset independently.
Components may keep transient pointer or text-entry state, but they must not create a second
persistent authority.

## Runtime subsystems

- `src/core/render/` implements Canvas 2D render objects, compositing, and perspective projection.
- `src/core/scene/built-ins/` owns shipped SDK 2 definitions and their canonical catalog.
- `src/core/scene/runtime/` adapts definitions to bound runtime instances and owns host-only property,
  resource, and bounds behavior.
- `src/core/scene/registry/` stores normalized registrations; `src/core/scene/plugins/` owns external
  bundle loading, capability services, and validation.
- `src/core/timing/` and `src/core/midi/` implement playback time and note queries.
- `src/core/resources/` implements decoded visual resources and lifecycle handles.
- `src/audio/` implements decoded PCM access, feature analysis, caches, and sampling.
- `src/persistence/` translates stores and assets to and from validated `.mvt` packages.
- `electron/` retains filesystem authority and exposes a narrow typed preload bridge.

## Plugin boundary

External elements import only `@mvmnt-app/plugin-sdk` and its documented subpaths. Their bundles
externalize those imports; `plugin-loader.ts` injects the SDK runtime selected by `apiVersion`.
Application aliases such as `@core/*` and Zustand types are private.

Both built-ins and external plugins cross the same definition-runtime boundary. The registry never
imports element implementations or plugin loaders; it receives a normalized registration containing
origin metadata, a serializable schema, and an instance factory. `builtInCatalog` is the ordered
inventory used to bootstrap the default registry.

The SDK package owns serializable definitions, DTOs, and portable helpers. The application owns
services such as rendering, timeline/audio reads, assets, and lifecycle cleanup. Contract tests
compare the package manifest, built declarations, injected modules, and loader behavior.

## Related guides

- [State and commands](state-and-commands.md)
- [Scene format and persistence](scene-format-and-persistence.md)
- [Rendering](rendering.md)
- [Plugin API reference](../plugin-api/reference.md)
