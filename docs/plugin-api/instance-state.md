# Scene element instance state

Scene elements can retain an **instance state** value for runtime resources and reusable work. This
value is distinct from authored scene state and from temporal simulation state.

## Lifecycle

`create(props, context)` runs once after one scene element instance is initialized. Its return value
is retained by the host and passed as `instanceState` to every `render()` call for that instance and
to its final `dispose()` call.

```ts
export const image = definePluginElement({
    // type, metadata, and schema omitted
    create(_props, context) {
        return {
            asset: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200),
            controller: new AbortController(),
        };
    },
    render(props, instanceState, time) {
        const asset = instanceState.asset.update(props.imageSource);
        instanceState.media
            .setResource(asset.resource, asset.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height);
        return [instanceState.media];
    },
    dispose(instanceState) {
        instanceState.controller.abort();
    },
});
```

Each scene element receives a different value. Property edits do not recreate it. Plugin reload,
instance replacement, or removal ends its lifetime. The value is runtime-only: it is not included
in scene files, snapshots, undo history, or export inputs.

`create()` may be asynchronous. `dispose()` is synchronous; stop pending asynchronous work when
`context.signal` aborts. Handles and registrations created through the context are scoped and
cleaned by the host, so manually dispose only resources owned directly by the plugin.

The `props` passed to `create()` are the initial effective values, not a durable property snapshot.
Always use the current `props` passed to `render()` when producing a frame.

## Appropriate uses

Instance state is appropriate for:

- scoped asset handles and plugin-owned resources;
- reusable render objects and buffers;
- memoized deterministic calculations whose keys include every input affecting the result;
- caches where hits, misses, and eviction change cost but never output.

Instance state does not need to be serializable. It may contain handles, render objects, typed
arrays, and other runtime values. A render callback may update those objects when it fully describes
the requested frame before returning them.

## Random-access rendering

`render()` can be called repeatedly, skipped, or evaluated at times in any order. Its output must be
determined by the current `props`, requested `time`, and callback-scoped snapshots. Instance state
must not turn rendering into an implicit sequence.

Do not evolve authored motion from earlier render calls:

```ts
render(props, instanceState) {
    instanceState.position += props.velocity; // Incorrect: depends on render history.
    return drawAt(instanceState.position);
}
```

Do not use frame counters, wall-clock time, or uncontrolled randomness as temporal state. For
cumulative behavior that remains random-access, use `context.properties.valueAt()`, `integrate()`,
or `average()`, or query the required timeline/audio history:

```ts
render(_props, _instanceState, time, context) {
    const distance = context.properties.integrate('velocity', {
        startSeconds: 0,
        endSeconds: time.seconds,
    });
    return distance.ok ? drawAt(distance.value) : [];
}
```

## State terminology

- **Authored state** is the persisted scene graph, properties, bindings, automation, and timeline
  data owned by MVMNT.
- **Instance state** is the ephemeral value described here. It supports implementation resources
  and deterministic caches but has no authored temporal meaning.
- **Simulation state** is temporal data where the next value depends on the previous value. The
  current SDK does not provide simulation state; it requires a future host-managed clock, reset,
  seeking, and checkpoint contract.

Built-in and external plugin elements use the same definition runtime and follow this contract.
