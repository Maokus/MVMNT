# Plugin authoring

## Definitions and schemas

SDK 2 elements are callback definitions created with `definePluginElement()`. A definition provides
a stable type, metadata, a serializable property schema, lifecycle callbacks, and a render callback.
Use `prop`, `group`, and `tab` builders so property keys remain literal in inferred `props` types.

Start with `render({ props, time, context })`. It must describe the requested frame independently
of earlier callbacks. Add `createResources()` only for allocations or reusable work; it is not
needed for time-based motion, MIDI reactions, or audio windows.

Property groups may include serializable layout nodes for sliders, compound controls, sections, or
actions. Keep the ordinary property row alongside a slider or compound control when users still
need precise entry, macros, and keyframes. Layouts affect only the inspector; they do not create
compound scene values.

## Capabilities

Declare capabilities once on each element entry in `plugin.json`:

```json
{
    "type": "pulse",
    "entry": "src/pulse.ts",
    "capabilities": {
        "required": ["timeline.read"],
        "optional": ["timing.conversion"]
    }
}
```

Required capabilities are necessary for meaningful output. Missing required services prevent that
element from loading and produce a diagnostic. Optional capability facets may be absent and must be
checked before use.

| Capability                   | Context access                                     |
| ---------------------------- | -------------------------------------------------- |
| `timeline.read`              | Timeline and note snapshots.                       |
| `audio.features.read`        | Cached analyzed-feature sampling and requirements. |
| `audio.raw.read`             | Raw PCM windows and RMS reads.                     |
| `timing.conversion`          | Seconds, beats, and ticks conversion.              |
| `midi.utils`                 | MIDI note helpers.                                 |
| `audio.calculators.register` | Scoped custom calculator registration.             |

Network and storage are not plugin capabilities. Plugins execute as CommonJS in the sandboxed
renderer and receive no generic filesystem or IPC access.

## Lifecycle

- `load(context)` runs once for a loaded definition.
- `createResources(context)` runs once per scene instance, may be asynchronous, and returns its instance resources.
- `render({ props, resources, time, context })` produces the current render objects.
- `disposeResources(resources, context)` synchronously cleans up one initialized instance.
- `unload(context)` runs when the definition is disabled, replaced, or removed.

Setup and disposal receive `ResourceContext`, an allocation-only context without property,
timeline, or audio sampling. `render()` receives `RenderInput<Props, Resources>` with current props,
time, `ElementContext<Props>`, and inferred resources (`undefined` when setup is omitted).

Definition and instance contexts have their own `AbortSignal`. Calculator registrations, feature
requirements, generated assets, and asset handles created through a context are tracked and cleaned
automatically. Stop plugin-owned asynchronous work when the signal aborts. Register synchronous
`context.onCleanup()` callbacks immediately after acquiring plugin-owned resources to cover partial
initialization failures. All cleanup is attempted even when an individual disposer throws.

Until asynchronous initialization finishes, the host renders no objects. Initialization failures
leave the instance inert and emit a structured diagnostic.

Instance resources are ephemeral runtime working data, not persisted or temporal state. See
[scene element instance resources](instance-state.md) for its lifecycle, appropriate uses, and the
random-access rendering requirement.

## Effective properties

`props` contains values for the current render time. Render callbacks can sample their own
declared properties at other finite times:

```ts
const previous = context.properties.valueAt('speed', time.seconds - 0.25);
const distance = context.properties.integrate('speed', {
    startSeconds: 0,
    endSeconds: time.seconds,
});
```

`valueAt()` supports every declared property. `integrate()` and `average()` accept numeric
properties and return value-seconds without exposing automation channels, bindings, or keyframes.

## Failure handling

Host reads return `Result` values. Treat an unavailable timeline window, pending feature cache, or
missing asset as an expected state and render an empty or placeholder result. Throw only when
definition or instance initialization cannot continue.
