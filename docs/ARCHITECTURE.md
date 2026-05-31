# Architecture Overview

## Key Domain Boundaries

- **audio/** – Audio engine, feature extraction, waveform analysis, offline mixing.
- **automation/** – Keyframe automation system: data model, curve evaluator, evaluator cache, React hooks, and clipboard. See [docs/automation/overview.md](automation/overview.md).
- **community/** – Community API integration and sharing UI.
- **core/** – Runtime engine: scene model, rendering pipeline, timing, MIDI parsing, resource management, and the plugin SDK. See subsystems below.
- **export/** – Video/image exporters and audio mixdown.
- **math/** – Generic math, geometry, and numeric helpers.
- **persistence/** – Import/export, document gateway, local save service, and scene packaging.
- **plugins/** – Bundled/active plugin directory.
- **pluginexamples/** – Reference plugin implementations (`fnf`, `midipack1`, `patternspack1`).
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
- Scaffolded via `npm run create-element`.

### Visual Asset Registry (`core/resources/`)

- `VisualResourceHandle` manages one visual asset reference and auto-destroys on dispose.
- `BundledSprite` / `BundledSparrowHandle` – sprite and Sparrow atlas helpers with identical public APIs (`.get()`, `.build()`, `.destroy()`).
- `resolveProjectAssetDescriptor` converts registry UUIDs to `VisualSourceDescriptor`s for loading.
- Use `this.visualHandle()`, `this.bundledSprite()`, `this.bundledSparrow()`, or `this.bundledImage()` on `SceneElement` — these are auto-tracked for disposal. See [docs/visual-asset-registry.md](visual-asset-registry.md).

## Plugin System (`core/scene/plugins/`)

Plugins are the primary extensibility mechanism. The public API surface is `@mvmnt/plugin-sdk` (resolved via `tsconfig.json` path alias to `core/scene/plugins/plugin-sdk.ts` and `core/scene/plugins/sdk/*`).

**Current API version:** 1.1.0 (`api-version.ts`)

### SDK Domains

| Sub-path               | Contents                                               |
| ---------------------- | ------------------------------------------------------ |
| `sdk/animation.ts`     | Easing, interpolation, FloatCurve                      |
| `sdk/render.ts`        | Canvas render object constructors                      |
| `sdk/scene.ts`         | SceneElement base, property descriptors                |
| `sdk/api.ts`           | Capability definitions, host API accessor              |
| `sdk/timeline.ts`      | Timeline read API, note selection                      |
| `sdk/audio.ts`         | Audio feature sampling, custom calculator registration |
| `sdk/timing.ts`        | Seconds/beats/ticks helpers                            |
| `sdk/safety.ts`        | Render safety wrappers, capability checks              |
| `sdk/utils.ts`         | MIDI helpers, color utilities                          |
| `sdk/visual-assets.ts` | Visual asset registry API                              |

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

**Access pattern:**

```typescript
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
if (api && status === 'ok') {
    const notes = api.timeline.selectNotesInWindow({ trackIds: [...], startSec, endSec });
}
```

### Drift Prevention

`plugin-sdk.ts` uses a `satisfies` check mapping every `PLUGIN_CAPABILITIES` key to its exported proxy. Adding a capability without exporting it from the SDK is a compile-time error. `__tests__/api-drift.test.ts` covers all capabilities with runtime assertions.

See also: [docs/plugin-api-v1.md](plugin-api-v1.md), [docs/plugin-quickstart.md](plugin-quickstart.md), `core/scene/plugins/AGENTS.md`.

## State & Selector Guidelines

- Prefer hooks/selectors exported from `@state/*` barrels to keep components agnostic of store wiring.
- Derived data (seconds, view models, macro assignments) must come from selectors rather than ad-hoc computation inside components.
- Lint rules and tests guard against bypassing `dispatchSceneCommand` when mutating scene state.

## Build Tooling

| Command                  | Purpose                           |
| ------------------------ | --------------------------------- |
| `npm run dev`            | Vite dev server                   |
| `npm run build`          | Production build → `./build/`     |
| `npm run test`           | Vitest suite                      |
| `npm run compile`        | TypeScript check (`tsc --noEmit`) |
| `npm run create-element` | Scaffold a new scene element      |
| `npm run create-example` | Scaffold a plugin example         |
| `npm run build-plugin`   | Build an external plugin          |

Path aliases are defined in `tsconfig.json` (`@core/*`, `@state/*`, `@audio/*`, `@workspace/*`, `@mvmnt/plugin-sdk`, etc.) and resolved at runtime via `PLUGIN_RUNTIME_MODULES`.

## Error & Logging Strategy

- Non-fatal warnings use `debug-log.ts` gating (dev builds only) to reduce production noise.
- Throw for invariant violations; surface recoverable issues via UI state.

## Testing Approach

- Unit tests cover timing conversions, store reducers/actions, selector memoization, and runtime adapter helpers.
- Integration tests validate command gateway parity, persistence import/export, and runtime hydration.
- Drift tests (`api-drift.test.ts`) assert that every declared plugin capability is exported from the SDK and accessible at runtime.
