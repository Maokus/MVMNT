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
    initialize({ props, seed, random }) {
        return {
            position: random.float('particle-0-x') * 100,
            velocity: seed % 7,
        };
    },
    step({ state, props, time, deltaSeconds, context }) {
        const jitter = context.random.float('particle-0-jitter') - 0.5;
        const velocity = state.velocity - state.position * deltaSeconds + jitter;
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

Determinism matters because preview, backward seeking, export, and exports at different frame rates
may request canonical steps in different orders. The same authored inputs, seed, and target time must
produce the same state in all of them.

Use `random.float(key)` for a value in `[0, 1)` or `random.uint32(key)` for an unsigned
32-bit integer. Initialization receives `random` directly; a step receives `context.random`.
Initialization uses canonical step zero. Step randomness is derived independently from the persisted
seed, current `time.stepIndex`, and key, so it does not depend on how many random calls were made or
their order. Use stable semantic keys such as `particle-${index}-x`; do not use array iteration order
unless that order is itself authored and stable.

The accessor reports `algorithm: 'mvmnt-random-v1'`. Outputs from that algorithm identifier are a
compatibility promise across MVMNT versions that support it. A future incompatible algorithm must use
a new identifier rather than silently changing `mvmnt-random-v1` output. The rest of a simulation can
still use floating-point operations whose bitwise results are not guaranteed across JavaScript engines.

External plugins are rejected at load time when the host finds direct `Math.random()`, `Date.now()`,
or `performance.now()` access in `initialize` or `step`, including static computed forms and access
through `globalThis`, `window`, or `self`. Those APIs remain available outside canonical simulation
callbacks. This validation prevents common mistakes; it is not a security sandbox. Aliasing an ambient
API outside a callback, reflective access, or dynamically generated code may evade it and remains a
plugin contract violation.

Module and global state is also outside canonical simulation state. Do not read or write mutable values
captured by `initialize` or `step`, including counters, caches, or PRNG streams. The current host cannot
reset or reliably detect closure state because plugin modules execute with `new Function(...)` in the
application realm. Only returned simulation state, callback inputs, and deterministic host APIs may
influence a transition. Enforcing this against hostile or deliberately indirect code would require a
separately resettable realm or Worker.

## Time and host reads

Step `n` reads props at `n * stepSeconds` and produces state for `(n + 1) * stepSeconds`.
`time` contains `seconds` and integer `stepIndex`; `deltaSeconds` is always the fixed step.
`context` provides deterministic random access plus property, timeline, audio, timing, and MIDI reads,
subject to manifest grants.
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
plugin ignores a failed read, the host does not commit that step. A blocked runner waits for an input
revision rather than retrying on each playback frame. Additive readiness updates resume the blocked
step and retain checkpoints; replacing or removing captured data starts a new replay generation.
Unchanged captured audio is shared across readiness revisions. Readiness changes retry replay;
missing sources and analysis failures are terminal diagnostics. An optional input should be
explicitly disabled through authored props rather than queried and silently ignored.

The host replays from initialization or a checkpoint every 120 steps, keeping at most 32
checkpoints and 32 MiB per runner. Oversized checkpoints are skipped. Eviction affects speed,
not output. Checkpoints never enter scene files or undo history.

All elements in one preview request share a 4 ms inline work budget, with at most four transitions
per element. Background replay rotates between elements and yields after at most 240 transitions
or roughly 8 ms in total. Initialization counts as a transition. These budgets cannot interrupt an
individual plugin callback. Playback and audio continue while
the element catches up. After an element has rendered an exact frame, continuous playback uses its
newest fully completed canonical state instead of alternating with a preparation placeholder. This
state may briefly lag the requested render time; `simulation.timeSeconds` identifies its canonical
time. The preview keeps the last complete element frame during gaps between completed chunks and
during input-readiness changes. Sustained preparation and input waits are reported in the preview
status after 500 ms without replacing already rendered element artwork. Progress updates and new
seek targets do not restart that notice delay.

Paused seeks and authored edits keep the last complete frame until the requested exact frame is
ready. The delayed status notice explains when previous artwork is being retained. Elements without
a completed frame allow 150 ms for preparation before showing a placeholder explaining whether
they are initializing, replaying, or waiting for decoding or analysis. Failures show an error
placeholder immediately. Ready artwork replaces a placeholder immediately, with no minimum display
duration. New seek targets supersede previous targets without publishing a half-executed simulation
step, and short synchronous advances do not publish an intermediate preparation state.

The scene-wide preview status summarizes the highest-priority reason when one or more simulations are
unavailable. These readiness messages are owned by the host. Plugins should continue returning useful
`Result` errors from required input reads; they do not render or persist the host placeholder themselves.

PNG and video export await each exact frame using a separate simulation session. Cancellation
releases that session. Export input data is copied; readiness may refresh a pending generation.
Readiness placeholders and last-complete preview frames are never encoded into exports.
Editing authored inputs during an export is rejected with a restart diagnostic, rather than
encoding a mixture of authored scenes. Do not edit the scene while exporting.

## Verify your plugin

Compare fresh replay, forward playback, backward seeks, shuffled requests, and repeated frames
at the same time. Repeat with different preview/export frame rates and nonzero export starts.
Test seed and automation edits, missing/pending audio, and resource recreation. Output should
depend on authored inputs and canonical time, never on the request order or resource history.
