# Plugin authoring

## Definitions and schemas

SDK 2 elements are callback definitions created with `definePluginElement()`. A definition provides
a stable type, metadata, a serializable property schema, lifecycle callbacks, and a render callback.
Use `prop`, `group`, and `tab` builders so property keys remain literal in inferred `props` types.

Start with `render({ props, time, context })`. The [Plugin SDK guide](README.md) explains when to add
instance resources or simulation; their detailed contracts live in their focused guides.

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
- `createResources(context)` runs once per scene instance, may be asynchronous, and returns its
  instance resources.
- `simulation.initialize({ props, seed })` creates checkpointable temporal data at scene time zero.
- `simulation.step({ state, props, time, deltaSeconds, context })` advances one host-owned fixed step.
- `render({ props, resources, time, context })` produces the current render objects.
- `disposeResources(resources, context)` synchronously cleans up one initialized instance.
- `unload(context)` runs when the definition is disabled, replaced, or removed.

Simulation elements also receive `simulation` in the render input. It contains read-only `state`,
`stepIndex`, and `timeSeconds`; rendering must not advance it. `simulation.step()` receives a
restricted sampling context and must synchronously return plain checkpointable data. A numeric
schema property named `seed` is required. See [deterministic simulation](simulation.md).

Setup and disposal receive `ResourceContext`, an allocation-only context without property,
timeline, or audio sampling. `render()` receives `RenderInput<Props, Resources, State>` with current
props, time, `ElementContext<Props>`, inferred resources (`undefined` when setup is omitted), and
the inferred simulation snapshot (`undefined` when simulation is omitted).

Definition and instance contexts have their own `AbortSignal`. Host-created handles and
registrations are tracked automatically. Stop plugin-owned asynchronous work when the signal
aborts. The [instance resource guide](instance-state.md) covers cleanup order, partial initialization,
late promises, and cache rules. The [simulation guide](simulation.md) covers state validation,
fixed-step time, seeking, and export.

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

Simulation reads are stricter: unavailable required input pauses replay, and a terminal failure
prevents the step from committing. Declare analyzed requirements with `audioFeatureDemands(props)`.
