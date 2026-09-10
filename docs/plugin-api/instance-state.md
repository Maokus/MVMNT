# Instance resources and random-access rendering

Start with `render({ props, time, context })`. Most elements need no retained values. For equivalent
current inputs and available source data, requesting the same time must produce equivalent output,
regardless of render history. Calls may repeat, skip frames, or arrive in any order.

If you are deciding where an old retained value belongs, start with the
[element mental model](README.md#the-element-mental-model). This page covers the resource branch:
handles, reusable render objects, scratch buffers, and bounded deterministic caches.

Resources have no authored or temporal meaning. They need not be serializable and are absent from
scene files, undo history, and export inputs. Module variables and definition-level registrations
are shared across instances; do not store per-instance motion there.

## Derive motion from the requested time

Use current effective props, `time.seconds`, and current host reads. For constant speed, position
is `props.speed * time.seconds`. For automated speed, integrate the effective property:

```ts
import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const travel = definePluginElement({
    type: 'travel',
    metadata: { name: 'Travel' },
    schema: {
        tabs: [tab.properties([group('motion', 'Motion', [prop.number('speed', 'Speed', 20)])])],
    },
    render({ time, context }) {
        const distance = context.properties.integrate('speed', {
            startSeconds: 0,
            endSeconds: time.seconds,
        });
        return distance.ok ? [new Rectangle(distance.value, 0, 20, 20)] : [];
    },
});
```

Use `valueAt()` to sample an earlier property value, `average()` for smoothing over a time range,
and timeline/audio queries for historical windows. Never use `position += speed`, a frame counter,
`Date.now()`, or `Math.random()` to drive authored motion.

For repeatable variation, derive a value from a persisted seed and stable event index. This pure
helper can be used for particle offsets or note colors without retaining a random generator:

```ts
function randomAt(seed: number, index: number): number {
    let value = (seed | 0) ^ Math.imul(index | 0, 0x9e3779b9);
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}
```

Choose the index from stable event identity or an absolute time grid, never from the number of
render calls. This helper produces visual variation; it is not cryptographic randomness.

## Allocate resources only when needed

`createResources(context)` runs once per instance and may return a promise. Its allocation-only
context provides assets, calculator registration when granted, diagnostics, `signal`, and
`onCleanup()`. It has no props or timeline/audio/property sampling. Read those in `render()`.

```ts
import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';

export const image = definePluginElement({
    type: 'image',
    metadata: { name: 'Image' },
    schema: {
        tabs: [tab.properties([group('image', 'Image', [prop.imageAsset('source', 'Image')])])],
    },
    createResources(context) {
        return { image: context.assets.project(), media: new VisualMedia(0, 0, 200, 200) };
    },
    render({ props, time, resources }) {
        const snapshot = resources.image.update(props.source);
        resources.media.setResource(snapshot.resource, snapshot.status).setLocalTime(time.seconds);
        return [resources.media];
    },
});
```

Retain the handle, not its snapshot. Each frame reads its current readiness and resource. A loading
placeholder changing to a ready image is an input change, not temporal simulation. Compare frames
under equivalent readiness when checking determinism.

Resources survive property edits, playback changes, and seeks. They end on instance removal,
replacement, or plugin reload. Until asynchronous setup completes, the instance renders nothing.
If setup fails, the instance stays inert and reports `INITIALIZATION_FAILED`.

## Cleanup and asynchronous work

Host-created handles and registrations are automatically cleaned. For a plugin-owned allocation,
register cleanup immediately after acquisition, so later initialization failures cannot leak it:

```ts
createResources(context) {
    const controller = new AbortController();
    context.onCleanup(() => controller.abort());
    return { controller };
}
```

Use `context.signal` to cancel plugin-owned asynchronous work. `disposeResources(resources, context)`
is an optional synchronous hook for a successfully initialized value. Do not register the same
allocation in both that hook and `onCleanup()` unless its own cleanup is idempotent.

On removal the host aborts first, calls `disposeResources()`, then runs registered cleanup. Each
cleanup is attempted even if another throws. Initialization failure runs registered cleanup without
calling `disposeResources()` for a value that never existed. A value that resolves after removal is
disposed once. Registering `onCleanup()` after cancellation executes it immediately. Allocation
methods cannot create surviving resources after cancellation; `Result` methods return `ABORTED`,
while synchronous handle factories throw. Cleanup callbacks must not return promises.

## Reuse and cache correctly

Reusable render objects must fully describe the requested frame, including resetting optional
effects, visibility, children, and other fields changed by earlier frames. Reuse is an optimization,
not permission to retain visual history. Returned objects may be reused on the next callback;
tests must copy observable values or rasterize before requesting another frame.

A small cache can retain deterministic calculations of explicit inputs:

```ts
createResources() {
    return { last: null as null | { width: number; height: number; area: number } };
},
render({ props, resources }) {
    if (resources.last?.width !== props.width || resources.last.height !== props.height) {
        resources.last = { width: props.width, height: props.height, area: props.width * props.height };
    }
    // Use resources.last.area exactly as you would props.width * props.height.
    return [];
}
```

This excerpt assumes numeric `width` and `height` schema properties. Prefer computing cheap values
directly; apply this pattern to measured expensive work. Clearing the cache must not change output.
Bound retained entries or bytes rather than keeping every visited time forever.

Cache keys must include every input affecting the result. `AudioFeatureMatrix.revision` identifies
current matrix content and can participate in generated-raster keys alongside dimensions, colors,
and other rendering inputs. A track ID, asset ID, or object identity is not a general content
revision. When a host read provides no reliable revision, re-query it each frame and cache only
subsequent work whose dependencies you can represent completely. Do not retain an unavailable
result indefinitely. No general timeline revision protocol is exposed by the SDK.

## Verify random access

Compare a fresh instance rendered directly at time `t` with an instance rendered through forward,
backward, repeated, and shuffled times before `t`. Repeat after property edits, source replacements
under the same ID, and cache eviction. Use equivalent ready input data and capture output before
the next callback. Package load-smoke checks do not prove determinism for arbitrary plugin code.

Built-ins follow the same contract. The volume meter derives peak hold from audio history on an
absolute grid up to 60 Hz, capped at 600 historical reads. Candidates clip to the meter ceiling,
hold for `peakHoldSec`, then fall at 12 dB/s. Current frame settings govern the sampled window;
they are not accumulated from previously rendered frames.
