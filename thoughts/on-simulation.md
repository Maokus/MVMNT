The SDK already has a per-instance `State` generic: `create()` runs once, its result is retained, `render()` receives that state repeatedly, and `dispose()` receives it when the element goes away. The host implementation genuinely keeps that object alive across renders.

However, I would **not treat that existing state as simulation state**.

At the moment MVMNT's evaluation model is fundamentally random-access:

```text
scene + properties + time
          ↓
       render()
          ↓
    render objects
```

`SceneRuntimeAdapter.resolveFrame()` accepts an arbitrary `targetTime`, caches only the currently resolved time/revision combination, and ultimately asks each element to build its output directly for that time. `resolveSceneFrame()` similarly just calls `element.buildRenderObjects(config, time)` for whatever time was requested.

This is also stated explicitly in the architecture documentation: plugin render callbacks are expected to derive output deterministically from properties, time, and callback-scoped snapshots.

So if a plugin did this today:

```ts
render(props, state, time) {
    state.position += state.velocity;
}
```

you immediately get undefined temporal semantics. Rendering 5 seconds, then 10 seconds, then 5 seconds again produces a different result. An invalidation that happens to cause the same frame to be evaluated again could advance the simulation twice. Scrubbing backwards cannot rewind it. Changing a property currently updates the long-lived element instead of necessarily reconstructing it, so any hidden simulation state would also need explicit invalidation.

That is the architectural danger you're sensing.

## Blender is a useful model

The closer Blender analogy is its **Simulation Zone**, bounded by Simulation Input and Simulation Output nodes. Inside that region, the output of one step becomes the state for the next. Inputs entering through the simulation input establish initial state, while other external inputs can be re-evaluated on each step. Blender also caches simulation states during playback and can bake them so that later rendering does not require sequential evaluation. ([Blender Documentation][1])

That explicit boundary is the important idea—not necessarily Blender's exact node implementation.

I would give MVMNT three distinct levels of temporal behaviour:

- **Pure time-based rendering** should remain the default: `output = f(props, time)`. This gives perfect scrubbing, reproducibility, parallelism, and export.
- **Historical queries without state** should handle cases that can still be expressed as functions of time. MVMNT already has excellent infrastructure for this: `properties.valueAt()`, `integrate()`, and `average()` can examine animated properties at arbitrary times, while audio plugins can request windows through `sampleFeatureRange()` and `sampleFeatureMatrix()`.
- **True simulation** should be an explicit opt-in for cases where `S(t + dt)` genuinely depends on `S(t)` and cannot reasonably be reconstructed analytically.

That middle category is particularly valuable. For example, an element whose position is driven by an animated velocity property does **not** need simulation state:

```ts
const distance = context.properties.integrate('velocity', { startSeconds: 0, endSeconds: time.seconds });
```

That retains MVMNT's random-access property while producing state-like cumulative behaviour.

A spring system, particle collision simulation, feedback system, boids simulation, fluid-like effect, etc. is where the third category becomes necessary.

## What I would add to the SDK

Conceptually, something along these lines:

```ts
definePluginElement({
    type: 'particle-system',

    create(props, context) {
        // Non-temporal instance resources.
        return {
            sprite: context.assets.bundledImage('particle.png'),
        };
    },

    simulation: {
        version: 1,
        stepSeconds: 1 / 120,

        initialState(props, context) {
            return {
                particles: [],
            };
        },

        step(state, step, context) {
            // The ONLY place temporal state may evolve.
            updateParticles(state.particles, step.dt);
        },
    },

    render(props, runtimeState, simulationState, time, context) {
        // Read-only view of simulationState.
        return drawParticles(simulationState.particles);
    },
});
```

The exact syntax is secondary. I would preserve the conceptual separation between **runtime instance state** and **simulation state**.

The existing `create()` state is useful for things like asset handles, reusable buffers, memoization and other implementation resources. Simulation state represents _authored temporal behaviour_. The host therefore needs to understand and control the latter.

You could even expose a separate `defineSimulationElement()` helper if you want the distinction to be extremely obvious, although internally I would probably make it the same element definition with an optional `simulation` descriptor.

## The host needs to own the simulation clock

This is the most important architectural rule.

A plugin should define:

```text
Sₙ₊₁ = step(Sₙ, inputsₙ, Δt)
```

but MVMNT should decide **when `step()` is invoked**.

Use a fixed timestep rather than render-frame deltas. For example, 120 simulation steps per second regardless of whether preview is running at 60 Hz or export is 30 Hz. Otherwise changing export FPS changes the actual visualisation.

Simulation time should be derived from an integer step index:

```text
time = simulationStart + stepIndex × stepDuration
```

rather than accumulating measured `requestAnimationFrame` deltas.

Likewise, randomness should be seeded. A simulation could have an authored `seed`, with MVMNT providing a deterministic random source. Wall-clock time and uncontrolled `Math.random()` should not be part of simulation semantics.

Then:

```text
(scene snapshot, plugin version, seed, simulation start, step index)
                         ↓
               deterministic state
```

That gets you reproducibility back.

## Scrubbing becomes the main cost

Suppose the user jumps directly to `42.7s`.

For a stateless element, MVMNT simply renders `42.7s`.

For a simulation element, the mathematically correct answer may require:

```text
initial state
  ↓
0.000
0.008
0.017
...
42.700
```

Running 5,000 steps whenever someone scrubs would be unpleasant.

So the simulation subsystem should own **checkpoints**:

```text
0s      1s      2s      3s      4s
S₀ ──── S₁ ──── S₂ ──── S₃ ──── S₄
                   ↑
                  cache
```

Seeking to `3.42s` restores the nearest previous checkpoint and steps forward from there.

This is essentially the same reason Blender caches simulation states during playback and lets simulations be baked for reliable non-sequential rendering. ([Blender Documentation][1])

For MVMNT v1, I wouldn't even implement user-visible baking. An in-memory checkpoint cache might be enough. Baking can come later for very expensive simulations.

## Simulation state should probably be serializable

I would strongly consider requiring simulation state to be structured-cloneable data:

```ts
number
boolean
arrays
plain objects
TypedArrays
```

but **not** things such as:

```text
CanvasRenderingContext2D
HTMLImageElement
resource handles
Promises
callbacks
```

Those belong in the existing instance/runtime state.

This gives the host the ability to checkpoint, clone, hash, cache, potentially move simulation execution to a worker, and eventually bake it.

It also creates a very clean conceptual boundary:

```text
Instance state
    implementation detail
    resource handles
    caches
    not semantically meaningful

Simulation state
    temporal data
    deterministic
    checkpointable
    host-controlled
```

## Editing becomes more complicated

This is probably the largest real tradeoff.

Suppose a particle emitter's `gravity` property has this automation:

```text
0s -------- 10s -------- 20s
             ↑
        property edited
```

Every simulation state after 10 seconds is now invalid.

Eventually MVMNT could do sophisticated invalidation:

```text
keep cache < 10s
invalidate cache >= 10s
```

But I would **not start there**. Initially, any relevant change to the element, its timeline inputs, automation, audio source, simulation code/version, or seed can simply clear that element's simulation cache.

Correct but occasionally wasteful is a much better first implementation.

## This also fits MVMNT's export architecture well

Your current architecture says that exports receive an immutable scene snapshot and that the export pipeline is intended to perform deterministic frame rendering. That is exactly where host-managed simulation helps.

An export renderer could take that immutable snapshot, initialize each simulation, step deterministically through the required interval, and render frames from the resulting simulation states.

If someone exports only `30s–40s`, MVMNT can either reconstruct `0s→30s`, restore a checkpoint/bake, or eventually allow an explicitly authored simulation-start point.

The important thing is that exporting `30.0s` must not mean "whatever state happened to exist after the user's most recent preview session."

Likewise, I would keep simulation caches **out of normal persistent scene state**. Your architecture already separates canonical authored scene state from editor/runtime state and caches. A simulation cache is derived data, much more like an audio-analysis cache than like a scene property.

## The tradeoff

What you gain is substantial. Stateful systems become straightforward and performant. Particles no longer need to reconstruct their whole history every render; spring dynamics become natural; feedback effects, accumulation, growth systems, motion with collisions, cellular automata and many other visualisations become possible.

What you lose is the beautiful property MVMNT currently has where **any frame can simply be evaluated independently**.

That loss propagates into seeking, cache invalidation, export, memory use, testing, plugin API complexity and possibly worker architecture. It also creates a new class of plugin bugs if stateful code can escape the controlled simulation boundary.

That is why I think your Blender intuition is exactly the right one: **don't make MVMNT generally stateful. Add a small, explicitly stateful subsystem inside an otherwise deterministic renderer.**

### What I would implement

I would preserve this invariant:

> `definePluginElement().render()` remains conceptually pure and safe to invoke at any time, in any order.

Then introduce an opt-in host-managed **Simulation** facility whose state can only be mutated by a `step()` callback. Give it a fixed timestep, explicit initialization, deterministic seed, host-owned checkpoints/reset/seek semantics, and a serializable state model. Keep the existing `create()` state for resources and non-semantic caches.

That gives you almost all of the expressive benefit of adding state **without sacrificing MVMNT's deterministic architecture globally**.

And in particular, I think `properties.integrate()` and the existing historical audio/timeline APIs mean you'll discover that quite a few apparent "stateful" visualisations can stay in the deterministic tier—the simulation system only needs to handle the genuinely recursive cases.

[1]: https://docs.blender.org/manual/uk/latest/modeling/geometry_nodes/simulation/simulation_zone.html?utm_source=chatgpt.com 'Simulation Zone - Blender 4.5 LTS Manual'
