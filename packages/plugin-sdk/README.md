# @mvmnt-app/plugin-sdk

The public SDK for MVMNT 2.x scene-element plugins. Host capabilities are supplied through
the callback context created by `definePluginElement()`. Runtime classes such as render
objects are injected by MVMNT; using them outside the host produces an explicit error.

This package is the public contract, not a copy of the application. It owns serializable
definitions and portable helpers. Rendering, timeline/audio services, asset resolution,
and migration adapters are implemented by the host and injected at plugin load time.

Install it with `npm install @mvmnt-app/plugin-sdk`.

Every host operation is available either as a method on its granted callback facet or as a named
adapter from the root/domain modules:

```ts
import { definePluginElement, selectTimelineNotes } from '@mvmnt-app/plugin-sdk';

export const element = definePluginElement({
    // metadata, schema, and capability declarations omitted
    render(_props, _state, time, context) {
        const notes = selectTimelineNotes(context.timeline!, {
            startSeconds: time.seconds,
            endSeconds: time.seconds + 1,
        });
        return notes.ok ? [] : [];
    },
});
```

Passing the callback facet keeps host capability checks and lifecycle ownership intact. The
`audio`, `timeline`, `timing`, and `visual-assets` subpaths expose the same adapters.

Element-instance callbacks also receive `context.properties`. Use `valueAt()` to resolve one of the element's own
properties at any timeline time, or `integrate()` and `average()` for bounded numeric area calculations. These
methods operate on effective property values and do not expose automation channels or keyframes.
