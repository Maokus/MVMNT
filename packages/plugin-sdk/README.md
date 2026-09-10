# @mvmnt-app/plugin-sdk

The public SDK 2 contract for MVMNT scene element plugins. Host capabilities are supplied through
the callback context created by `definePluginElement()`. Runtime classes such as render
objects are injected by MVMNT; using them outside the host produces an explicit error.

This package is the public contract, not a copy of the application. It owns serializable
definitions and portable helpers. Rendering, timeline/audio services, asset resolution,
and migration adapters are implemented by the host and injected at plugin load time.

Install it with `npm install @mvmnt-app/plugin-sdk`.

New authors should start with the MVMNT
[Plugin SDK guide](../../docs/plugin-api/README.md) and
[quickstart](../../docs/plugin-api/quickstart.md).

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

Start with `render({ props, time, context })`. Add resources for allocations or reusable work, and
simulation only for genuinely recursive motion. The focused guides define the complete
[resource](../../docs/plugin-api/instance-state.md) and
[simulation](../../docs/plugin-api/simulation.md) contracts.
