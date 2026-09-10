# Migrating plugins to deterministic state

Status: current migration note. The public contracts are documented in
[instance resources](../docs/plugin-api/instance-state.md) and
[deterministic simulation](../docs/plugin-api/simulation.md).

## Classify retained values first

For each field in an old class instance, closure, module variable, or `create()` state object, choose
exactly one destination:

- Authored choices, asset references, and seeds become schema properties.
- Values derivable from props and requested time move directly into `render()`.
- Historical sums use `context.properties.valueAt()`, `integrate()`, or `average()`, or bounded
  timeline/audio window reads.
- Handles, reusable render objects, scratch buffers, and bounded deterministic caches move to
  `createResources()` and are released by `disposeResources()` or `context.onCleanup()`.
- Positions, velocities, particle lifetimes, and other genuinely recursive values move into
  `simulation.initialize()` and `simulation.step()`.

Do not put a mutable frame counter or accumulated position in resources. Render calls can repeat,
skip, and move backward.

## Convert ordinary accumulated motion

Replace render-history updates such as `position += speed` with a direct expression from time:

```ts
render({ props, time }) {
    const position = props.start + props.speed * time.seconds;
    return [draw(position)];
}
```

If speed is automated, integrate it from an authored origin with
`context.properties.integrate('speed', { startSeconds: 0, endSeconds: time.seconds })`.

## Convert genuinely recursive motion

Add a numeric `seed` schema property, return plain finite data from initialization, and return a new
state from every step:

```ts
simulation: {
    initialize: ({ seed }) => ({ position: 0, velocity: seed % 5 }),
    step({ state, props, deltaSeconds, context }) {
        const notes = context.noteOns(props.trackId ? [props.trackId] : []);
        const impulse = notes.ok ? notes.value.length * props.impulse : 0;
        const velocity = state.velocity + impulse - props.drag * state.velocity * deltaSeconds;
        return { position: state.position + velocity * deltaSeconds, velocity };
    },
},
render({ simulation }) {
    return [draw(simulation.state.position)];
}
```

Copy typed arrays before updating them. State cannot contain render objects, handles, functions,
class instances, cycles, shared memory, or non-finite numbers. Keep those allocations in resources.
Declare timeline/audio capabilities normally, and declare analyzed inputs with
`audioFeatureDemands(props)` so pending data pauses the step instead of becoming silence.

## Verify the migration

Run the generated plugin's `npm run check`, then compare the same target time after fresh, forward,
backward, repeated, and shuffled requests. Also test a changed seed, changed automation, source
replacement, missing or pending audio, a nonzero export start, and at least two export frame rates.
The result at a time must not depend on preview history or resource recreation.
