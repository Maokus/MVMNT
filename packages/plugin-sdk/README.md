# @mvmnt-app/plugin-sdk

The public SDK for MVMNT 2.x scene-element plugins. Host capabilities are supplied through
the callback context created by `definePluginElement()`. Runtime classes such as render
objects are injected by MVMNT; using them outside the host produces an explicit error.

This package is the public contract, not a copy of the application. It owns serializable
definitions and portable helpers. Rendering, timeline/audio services, asset resolution,
and migration adapters are implemented by the host and injected at plugin load time.

Install it with `npm install @mvmnt-app/plugin-sdk`.

Use methods on the granted callback facets for host operations. Advanced DTO types live in domain
subpaths; the root contains common definition, schema, result, animation, safety, and utility helpers:

```ts
import { definePluginElement } from '@mvmnt-app/plugin-sdk';

export const element = definePluginElement({
    // metadata and schema omitted; capabilities are declared in plugin.json
    render({ time, context }) {
        const notes = context.timeline!.selectNotes({
            startSeconds: time.seconds,
            endSeconds: time.seconds + 1,
        });
        return notes.ok ? [] : [];
    },
});
```

The `audio`, `timeline`, `timing`, `render`, and `visual-assets` subpaths expose advanced types and
rendering helpers without duplicating callback methods as named adapters.

Render callbacks also receive `context.properties`. Use `valueAt()` to resolve one of the element's own
properties at any timeline time, or `integrate()` and `average()` for bounded numeric area calculations. These
methods operate on effective property values and do not expose automation channels or keyframes.

Start with `render({ props, time, context })`. Add `createResources(context)` only for handles,
reusable objects, and deterministic caches. Its return value becomes `resources` in the named
render input; optional synchronous `disposeResources(resources, context)` releases plugin-owned
allocations. Setup has an allocation-only `ResourceContext`, without props or temporal reads.
Use `context.onCleanup()` for partial-initialization cleanup. Resources must not make output depend
on render history. See the host documentation's instance resources guide for the full contract.

For springs, particles, and other recursive motion, opt into `simulation`. Its synchronous
`initialize()` and fixed-step `step()` callbacks return checkpointable plain data; `render()` receives
the resulting read-only snapshot as `simulation`. A persisted numeric `seed` property is required.
The host owns replay, seeking, checkpoints, input snapshots, and export preparation. Do not place
temporal values in resources or mutate simulation input state.
