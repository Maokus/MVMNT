# Architecture Overview

## Key Domain Boundaries

- **audio/** – Audio engine, feature extraction, waveform analysis, offline mixing.
- **automation/** – Keyframe automation system: data model, curve evaluator, evaluator cache, React hooks, and clipboard. See [docs/automation/overview.md](automation/overview.md).
- **community/** – Community API integration and sharing UI.
- **core/** – Runtime engine: scene model, rendering pipeline, timing, MIDI parsing, resource management, and the plugin SDK. See subsystems below.
- **export/** – Video/image exporters and audio mixdown.
- **fonts/** – Offline-first built-in, device, embedded Project, and Google acquisition flow. See [font-system.md](font-system.md).
- **math/** – Generic math, geometry, and numeric helpers.
- **persistence/** – Import/export, document gateway, local save service, and scene packaging.
- **state/** – Zustand stores, selectors, and middleware. Hosts the canonical timeline and scene stores plus command/undo infrastructure.
- **utils/** – Shared utilities (logging, throttling, feature flag helpers, etc.).
- **workspace/** – Components for the main workspace UI (panels, modals, forms, layouts).

Music theory helpers and MIDI parsing live under `core/midi/` alongside the playback/timeline stack so the runtime can consume them without depending on UI code.

## Canonical Time & Scene Authority

- Tick-based timeline (`timelineStore`) is the source of truth for transport, tempo, and note scheduling. Seconds/beats are derived through shared timing utilities.
- `sceneStore` holds all scene elements, bindings, macros, interaction state, and persistence metadata. UI components and runtime adapters read from this store.
- The command gateway (`dispatchSceneCommand`) is the only sanctioned mutation entry point for scene data. It applies store mutations and feeds undo/telemetry instrumentation.
- Undo middleware spans both timeline and scene domains so transactions remain atomic across stores when commands mutate multiple slices.

## Data Flow

1. User input (UI, hotkeys, transport) dispatches commands or store actions.
2. Command gateway/store actions update Zustand state and emit mutation metadata.
3. Memoized selectors derive ordered elements, macro assignments, timing windows, etc.
4. Runtime layers (`SceneRuntimeAdapter`, playback clock) consume derived data to render frames or drive audio/MIDI output.
5. Export pipeline leverages the same runtime APIs to produce deterministic renders.

## Core Subsystems

### Rendering Pipeline (`core/render/`)

- **ModularRenderer** – Orchestrates canvas layers and compositing.
- **Render objects** – Typed primitives (`Rectangle`, `Text`, `Arc`, `BezierPath`, `Line`, `Polygon`, `VisualMedia`, `GlowLayer`, `ClipLayer`, `CompositeLayer`, `PixelGrid`, etc.) with a shared geometry/options split. Plugins compose these to produce frames.
- **Compile step** – Flattens the scene element tree into an ordered render list each frame.
- **Scheduler bridge** – Connects the playback clock to `requestAnimationFrame`.

### Timing (`core/timing/`)

- **TimingManager** – Central orchestrator for tempo-aware time queries.
- **TempoMapper** – Converts between ticks, beats, and seconds via the tempo curve.
- **PlaybackClock** – Tracks wall-clock playback time and emits frame events.
- **NoteQuery** – Windowed note lookup used by scene elements and export.

### Scene Elements (`core/scene/elements/`)

- `SceneElement` base class (`base.ts`) defines the lifecycle, property system, and render object API all elements inherit.
- Elements live in subdirectories by category: `audio-displays/`, `midi-displays/`, `misc/`.
- Third-party elements are authored as external SDK plugin projects; see the [plugin quickstart](plugin-api/plugin-quickstart.md).

### Visual Asset Registry (`core/resources/`)

- `VisualResourceHandle` manages one visual asset reference and auto-destroys on dispose.
- `BundledSprite` / `BundledSparrowHandle` – sprite and Sparrow atlas helpers with identical public APIs (`.get()`, `.build()`, `.destroy()`).
- `resolveProjectAssetDescriptor` converts registry UUIDs to `VisualSourceDescriptor`s for loading.
- External definitions create auto-disposed handles through `context.assets`. See
  [docs/visual-asset-registry.md](visual-asset-registry.md).

## Plugin System (`core/scene/plugins/`)

Plugins are the primary extensibility mechanism. The public API is the versioned
`packages/plugin-sdk` workspace package. Plugin bundles externalize its modules and the loader
injects the SDK 2 callback runtime selected by `apiVersion`.

**Supported API line:** SDK `^2.x`.

### SDK Domains

| Sub-path        | Contents                                              |
| --------------- | ----------------------------------------------------- |
| `animation`     | Easing, interpolation, FloatCurve                     |
| `render`        | Canvas render object constructors                     |
| `scene`         | Definition callbacks, schemas, and capability context |
| `api`           | Capability constants and structured results           |
| `timeline`      | Timeline read API and note selection                  |
| `audio`         | Audio sampling and custom calculator registration     |
| `timing`        | Seconds/beats/ticks helpers                           |
| `safety`        | Author-side safety helpers                            |
| `utils`         | MIDI helpers and utilities                            |
| `visual-assets` | Lifecycle-scoped visual asset handles                 |

### Capability Model

Plugins declare needed capabilities; the host resolves them at runtime. Unavailable capabilities cause graceful fallback rendering rather than crashes.

| Capability                 | Always available? | Provides                             |
| -------------------------- | ----------------- | ------------------------------------ |
| `timingConversion`         | Yes               | Seconds ↔ beats ↔ ticks              |
| `midiUtils`                | Yes               | MIDI note helpers                    |
| `audioCalculatorsRegister` | Yes               | Custom audio calculator registration |
| `timelineRead`             | Conditional       | Timeline/note queries                |
| `audioFeaturesRead`        | Conditional       | Audio feature sampling               |
| `audioRawRead`             | Conditional       | Sample-accurate audio                |

**Access pattern:** declare the capability and use its callback-scoped facet.

```typescript
render(_props, _state, time, context) {
    const notes = context.timeline!.selectNotes({
        trackIds: ['track-id'],
        startSeconds: time.seconds,
        endSeconds: time.seconds + 1,
    });
    return notes.ok ? [] : [];
}
```

### Drift Prevention

`sdk-manifest.json` records every public module and runtime export. The SDK contract tests compare
that manifest with the package source and injected runtime, preventing missing capability adapters.

The SDK package is the canonical owner of public DTOs and portable helpers, not a clone of
the application. App compatibility barrels re-export SDK-owned helpers so both built-ins and
plugins execute the same implementation. Conversely, render objects, capability services,
and the class-renderer migration facade are host-owned and injected by `plugin-loader.ts`.
`sdk-boundary-drift.test.ts` verifies these ownership rules behaviorally.

See also: [plugin quickstart](plugin-api/plugin-quickstart.md),
[capabilities](plugin-api/plugin-capabilities.md), and `core/scene/plugins/AGENTS.md`.

## State & Selector Guidelines

- Prefer hooks/selectors exported from `@state/*` barrels to keep components agnostic of store wiring.
- Derived data (seconds, view models, macro assignments) must come from selectors rather than ad-hoc computation inside components.
- Lint rules and tests guard against bypassing `dispatchSceneCommand` when mutating scene state.

## Build Tooling

| Command                | Purpose                           |
| ---------------------- | --------------------------------- |
| `npm run dev`          | Vite dev server                   |
| `npm run build`        | Production build → `./dist/`      |
| `npm run test`         | Vitest suite                      |
| `npm run compile`      | TypeScript check (`tsc --noEmit`) |
| `npm run build-plugin` | Build an external plugin          |

Application path aliases are defined in `tsconfig.json`. External plugins use only
`@mvmnt-app/plugin-sdk`; the loader resolves its declared runtime modules.

## Error & Logging Strategy

- Non-fatal warnings use `debug-log.ts` gating (dev builds only) to reduce production noise.
- Throw for invariant violations; surface recoverable issues via UI state.

## Testing Approach

- Unit tests cover timing conversions, store reducers/actions, selector memoization, and runtime adapter helpers.
- Integration tests validate command gateway parity, persistence import/export, and runtime hydration.
- Drift tests (`api-drift.test.ts`) assert that every declared plugin capability is exported from the SDK and accessible at runtime.
