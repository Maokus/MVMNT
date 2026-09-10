# Explicit plugin simulation

Status: implemented. See the [simulation authoring guide](../docs/plugin-api/simulation.md).
Export rejects concurrent authored edits instead of maintaining a second editable scene graph.
This document records the design goals for MIDI-driven particles and springs.

## Ownership and authoring boundary

Ordinary elements remain functions of current props, requested time, and current host reads.
Simulation is an explicit opt-in definition facet, not an interpretation of instance resources.
The host owns stepping, input snapshots, checkpoints, seeking, and cancellation. Plugins own the
deterministic transition rule and a checkpointable value of particle positions, velocities, and
other physical quantities. Handles, render objects, and buffers used only as scratch work remain
instance resources and cannot be included in simulation snapshots.

The proposed facet has three operations:

- `initialize({ props, seed })` returns initial simulation data at scene time zero.
- `step({ state, props, time, deltaSeconds, context })` returns the next simulation data value.
- The existing named render input gains a read-only simulation snapshot for opted-in elements.

`step` is synchronous and must not mutate its input state. It returns plain structured-cloneable
data, including typed arrays, but no functions, class instances, host handles, or shared memory.
The host clones state when recording or restoring checkpoints. Development validation checks
checkpointability and freezes plain input objects; typed arrays require copy-based mutation tests.
`render` never advances state. Display resources may be reused but must not mutate simulation data.

## Canonical time and inputs

Use scene time zero as the origin, independent of the playback range and export start. Negative
requests receive the initial state without stepping. Default step size is 1/120 second, declared
once in the simulation facet and required to be finite and positive. The host calculates time
from an integer step index, not accumulated floating-point additions or preview frame deltas.

Step `n` transitions from `n * dt` to `(n + 1) * dt`. Props are evaluated at the left boundary;
MIDI events use the half-open interval `[n * dt, (n + 1) * dt)` so boundaries cannot double-trigger.
Timeline and audio reads use the same immutable input generation. A persisted numeric schema
property named `seed` drives initialization; random values during stepping derive from seed,
integer step, and stable particle/event identity. Module-scope random generators are invalid.

For a requested time between steps, render the state at the preceding complete step. Supply both
requested render time and simulation step time explicitly. Interpolation is not part of the initial
contract; it can be added separately without changing canonical stepping.

The reference spring example receives a MIDI impulse once at an event boundary, integrates velocity
and position using fixed `dt`, and renders particles from the supplied state. Merely scrubbing must
not produce additional impulses or consume randomness.

## Seeking, checkpoints, and invalidation

To reach step `n`, restore the nearest valid checkpoint at or before `n`, then replay canonical
steps. A request with no checkpoint replays from initialization. Store a checkpoint every 120 steps,
retain at most 32 per instance and 32 MiB of checkpoint data, evict oldest-accessed checkpoints when
either limit is exceeded, and recreate the initial state when necessary. These are host defaults,
not observable simulation semantics. Eviction and skipped checkpoint creation affect cost only.

Start with conservative invalidation: any authored scene/timeline change, automation change,
source replacement, analysis-content change, or plugin reload creates a new input generation and
invalidates all simulation checkpoints. Playback movement, selection, and viewport UI state do not.
Viewport size may affect rendering but cannot be read by stepping. Seed and step-size changes also
invalidate initialization. Do not expose a general SDK revision protocol as part of resource work.

This requires an input-snapshot service spanning scene property evaluation, timeline content,
timing, and audio readiness. Existing live callback services and the export timing snapshot alone
do not establish that guarantee. Implement the snapshot service before enabling simulation.

## Availability, scheduling, and export

Unavailable required input makes a step pending, not a zero-valued physics sample. Do not commit
the step or cache a checkpoint. Retry against a complete input generation when data becomes ready.
Missing required assets or persistent analysis failures produce a structured diagnostic.

Preview replay runs in cooperative chunks of at most 240 steps, yielding to the host between
chunks. A newer seek request cancels the old replay; completed canonical checkpoints may remain
when their input generation is still valid. While pending, render no simulation frame and expose
a pending status to the workspace. Never label a partially advanced state as the requested frame.

Export uses an isolated simulation instance and immutable scene/timeline/audio input generation.
It awaits the exact requested state rather than encoding preview placeholders. It may reuse
checkpoints within that export, but not mutable preview state. Cancellation stops replay and releases
resources. Checkpoints are never stored in scene files initially: authored inputs reproduce them.

## Acceptance before runtime delivery

- Fresh replay, sequential playback, backward seeking, shuffled requests, and checkpoint eviction
  yield equal particle positions and velocities at the same canonical step.
- Different preview/export frame rates and different export start times yield equivalent sampled
  states; impulses at exact step boundaries occur once.
- Seed, automation, source-content, and timing edits invalidate stale checkpoints, including edits
  under unchanged track and asset IDs.
- Pending audio never commits a step; rapid seek cancellation never publishes an obsolete frame.
- Memory limits, throwing initialization/stepping, invalid checkpoint data, and plugin removal
  release resources and report actionable diagnostics.
- A render callback cannot mutate saved simulation checkpoints. Resource recreation changes no
  simulation results. Reproducibility is required within the supported runtime; bitwise equivalence
  across different JavaScript engines is not promised.
