# Deterministic simulation

Prefer random-access `render({ props, time, context })` and historical property queries.
Use `simulation` only when motion genuinely needs a previous physical state: spring velocity,
particle trajectories, or a recurrence that cannot conveniently be evaluated directly.
Resources are allocation caches, not motion history. See [instance resources](instance-state.md).

Create a working example with:

```sh
npm create mvmnt-plugin@latest -- --name my-spring --template midi-spring
```

## Authoring contract

Declare a numeric schema property named `seed`. It is persisted like other authored properties;
initialization samples it at scene time zero. The optional definition facet is:

```ts
simulation: {
    stepSeconds: 1 / 120, // Optional; fixed for the definition, finite and positive.
    initialize({ props, seed }) {
        return { position: 0, velocity: seed % 7 };
    },
    step({ state, props, time, deltaSeconds, context }) {
        const velocity = state.velocity - state.position * deltaSeconds;
        return { position: state.position + velocity * deltaSeconds, velocity };
    },
},
render({ simulation }) {
    return [new Rectangle(0, simulation.state.position, 20, 20)];
},
```

`initialize` and `step` are synchronous. State type is inferred from `initialize`.
Return plain data: finite numbers, strings, booleans, arrays, plain objects, and typed arrays.
Do not return cycles, functions, class instances, handles, render objects, or shared memory.
Never mutate input state. Plain objects are frozen in development; typed arrays are isolated
by defensive copies. A render snapshot cannot alter saved checkpoints.

For particles, return data such as `{ positions: new Float32Array(count * 2),
velocities: new Float32Array(count * 2) }`. In each step, copy both arrays, update their entries,
and return the new arrays. Allocate reusable rectangles or GPU resources in `createResources`,
then update them from `simulation.state` during rendering. Bound particle counts: each transition
and render snapshot copies state, and one slow callback cannot be preempted by the host.

Do not read wall clocks, module-level randomness, mutable globals, or external asynchronous data
in a transition. Derive randomness from the persisted seed, step index, and stable event identity.
Reproducibility is within the supported runtime, not a bitwise cross-engine guarantee.

## Time and host reads

Step `n` reads props at `n * stepSeconds` and produces state for `(n + 1) * stepSeconds`.
`time` contains `seconds` and integer `stepIndex`; `deltaSeconds` is always the fixed step.
`context` provides property, timeline, audio, timing, and MIDI reads, subject to manifest grants.
It exposes no assets, allocation methods, viewport, or resource handles.

`context.noteOns(trackIds?)` requires `timeline.read` and returns a `Result` of note onsets in
the half-open step interval. Boundary events occur once, including time-zero notes in step zero.
Use this helper for impulses, not overlapping-note queries that repeatedly fire long notes.

`render` receives the requested `time.seconds` and a separate snapshot containing `state`,
`stepIndex`, and `timeSeconds`. Between steps, the snapshot is the preceding completed step;
negative requests use initial state. There is no interpolation. Stateless definitions receive
`simulation: undefined`. Rendering never advances state.

## Inputs, readiness, and seeking

The host captures properties, macros, automation, timeline content, tempo, and audio data for
each replay generation. Authored changes invalidate checkpoints, including source replacement
under the same ID. Transport and selection changes do not invalidate motion. Transient inspector
property edits also recreate the affected instance's simulation inputs.

Declare analyzed audio requirements with `audioFeatureDemands(props)`, including historical
property selections. Unavailable required audio makes the step pending, not silent. Even if a
plugin ignores a failed read, the host does not commit that step. Readiness changes retry replay;
missing sources and analysis failures are terminal diagnostics. An optional input should be
explicitly disabled through authored props rather than queried and silently ignored.

The host replays from initialization or a checkpoint every 120 steps, keeping at most 32
checkpoints and 32 MiB per runner. Oversized checkpoints are skipped. Eviction affects speed,
not output. Checkpoints never enter scene files or undo history.

Preview work yields after at most 240 steps or roughly 8 ms. Playback and audio continue while
the element catches up; the preview displays a preparation status and hides incomplete simulation
output. New seek targets supersede previous targets without publishing partial frames.

PNG and video export await each exact frame using a separate simulation session. Cancellation
releases that session. Export input data is copied; readiness may refresh a pending generation.
Editing authored inputs during an export is rejected with a restart diagnostic, rather than
encoding a mixture of authored scenes. Do not edit the scene while exporting.

## Verify your plugin

Compare fresh replay, forward playback, backward seeks, shuffled requests, and repeated frames
at the same time. Repeat with different preview/export frame rates and nonzero export starts.
Test seed and automation edits, missing/pending audio, and resource recreation. Output should
depend on authored inputs and canonical time, never on the request order or resource history.
