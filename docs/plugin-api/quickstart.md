# Plugin SDK 2 quickstart

This guide creates an external scene element plugin, previews it with hot reload, and packages it
for import. Use Node.js 18 or newer. An MVMNT source checkout is not required.

## Create a plugin

Run the generator from the directory where you keep projects:

```bash
npm create mvmnt-plugin@latest
cd pulse
npm install
npm run check
```

Choose a template from the interactive menu and use a reverse-domain plugin ID that you control.
For a non-interactive setup, pass `--name com.example.pulse --template minimal`. The generated project
contains `plugin.json`, one or more TypeScript element entries, assets, build configuration, and the
public SDK dependency.

Running the generator again from the plugin (or one of its nested directories) detects `plugin.json`
and offers to add another scene element instead of creating a separate plugin.

## Edit the element

Generated elements use `definePluginElement()` and schema builders:

```ts
import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const pulse = definePluginElement({
    type: 'pulse',
    metadata: { name: 'Pulse' },
    schema: {
        tabs: [tab.properties([group('shape', 'Shape', [prop.colorAlpha('color', 'Color', '#FF66CCFF')])])],
    },
    render({ props }) {
        return [new Rectangle(-50, -50, 100, 100, { fillColor: props.color })];
    },
});
```

Keep the definition `type` equal to its element entry in `plugin.json`. Import only the root SDK or
documented subpaths; application aliases such as `@core/*` and `@state/*` do not exist in external
plugins.

Run the contract and load-smoke checks after editing:

```bash
npm run check
```

## Understand the rendering model

The generated element is random-access: its output is a function of current props, requested time,
and host reads. Calculate ordinary motion from `time.seconds`; do not increment a frame counter or
position during rendering.

Use [instance resources](instance-state.md) for handles and reusable objects. Use
[deterministic simulation](simulation.md) only when a value genuinely depends on the previous step,
as in the `midi-spring` template. The [Plugin SDK guide](README.md) has a quick decision table.

## Preview with hot reload

Start MVMNT in development mode. From the plugin project, run:

```bash
npm run dev
```

In MVMNT, open **Scene Settings → Developer** and scan for a Development Plugin Server. Saving source,
manifest, or asset files rebuilds and reloads the plugin. See the
[development workflow](development-workflow.md) for ports and failure behavior.

## Package and import

```bash
npm run build
```

The distributable `.mvmnt-plugin` archive is written under `dist/`. Import it through MVMNT's plugin
settings.

## Continue learning

- [Plugin SDK guide](README.md) — mental model, project structure, and learning path.
- [Authoring guide](authoring.md) — schemas, capabilities, lifecycle, and properties.
- [Instance resources](instance-state.md) — retained runtime resources and deterministic caching.
- [Deterministic simulation](simulation.md) — fixed-step springs, particles, and MIDI impulses.
- [Rendering and assets](rendering-and-assets.md) — render objects and packaged visuals.
- [Audio](audio.md) — analyzed features, raw PCM, and custom calculators.
- [API reference](reference.md) — package subpaths and manifest contract.
