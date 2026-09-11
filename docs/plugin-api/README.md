# Plugin SDK guide

MVMNT plugins add one or more scene element types. Each element has an inspector schema and a
render callback; optional capabilities let it read the timeline or audio, and optional definition
facets support resources or deterministic simulation.

## Start here

1. Follow the [quickstart](quickstart.md) to generate, preview, and package a plugin.
2. Take the [API capabilities tour](api-capabilities.md) to try timeline, audio, timing, animation,
   and property APIs.
3. Read [authoring](authoring.md) when adding properties, capabilities, or lifecycle callbacks.
4. Choose a focused guide for [rendering and assets](rendering-and-assets.md),
   [audio](audio.md), [instance resources](instance-state.md), or
   [deterministic simulation](simulation.md).
5. Use the [API reference](reference.md) for exact package paths and contract details.

If you have SDK 1 source, begin with [migrating to SDK 2](migration-v1-to-v2.md).

## The element mental model

Start with a random-access render function. Given equivalent props, requested time, and host data,
it should describe the same frame regardless of which frames were requested before it.

| Need                                                                      | Use                                |
| ------------------------------------------------------------------------- | ---------------------------------- |
| A user-editable value, asset reference, or seed                           | A schema property                  |
| Motion that can be calculated from the requested time                     | `render({ props, time, context })` |
| An asset handle, reusable render object, scratch buffer, or bounded cache | `createResources()`                |
| A spring, particle trajectory, or other previous-step recurrence          | `simulation`                       |

Resources can change the cost of rendering, but not its meaning. Simulation is the only place where
authored temporal state advances, and the host controls its clock, replay, and checkpoints.
This distinction is independent of the host application's Zustand stores: plugins never read or
mutate application state directly. They receive immutable, time-specific SDK snapshots instead.

## A plugin project at a glance

Generated projects contain:

- `plugin.json` — plugin identity, element entries, SDK range, and capability declarations.
- `src/*.ts` — element definitions created with `definePluginElement()`.
- `assets/` — optional files packaged with the plugin.
- `dist/` — the packaged `.mvmnt-plugin` archive after `npm run build`.

Use only `@mvmnt-app/plugin-sdk` and its documented subpaths from plugin source. MVMNT application
imports such as `@core/*` and `@state/*` are private and unavailable to external plugins.

## Everyday commands

```bash
npm install       # Install the generated project.
npm run dev       # Rebuild and serve it to a development build of MVMNT.
npm run check     # Validate the manifest, types, bundle, and load behavior.
npm run build     # Create the distributable archive under dist/.
```

SDK 2.2 is published on npm and follows the [compatibility policy](compatibility.md). Generated
projects use compatible SDK 2 ranges for the authoring SDK and command-line tools.
