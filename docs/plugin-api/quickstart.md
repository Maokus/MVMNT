# Plugin SDK 2 quickstart

This guide creates an external scene-element plugin, previews it with hot reload, and packages it
for import. Use Node.js 18 or newer for plugin projects. An MVMNT source checkout is not required.

## Create a plugin

Run the generator from the directory where you keep projects:

```bash
npm create mvmnt-plugin@latest -- --name com.example.pulse --template minimal
cd pulse
npm install
npm run check
```

Use a reverse-domain plugin ID that you control. The generated project contains `plugin.json`, one
or more TypeScript element entries, assets, build configuration, and the public SDK dependency.

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

Keep ordinary elements random-access and stateless. For genuinely history-dependent motion,
use the optional [simulation facet](simulation.md), demonstrated by the `midi-spring` template.

Run the contract and load-smoke checks after editing:

```bash
npm run check
```

## Add motion without retaining state

Replace the render callback with a function of the requested time:

```ts
render({ props, time }) {
    const x = 100 * Math.sin(time.seconds * Math.PI);
    return [new Rectangle(x - 50, -50, 100, 100, { fillColor: props.color })];
}
```

Scrubbing, repeated frames, and export all use this same callback. Do not increment position or
count frames. For MIDI reactions, query notes around `time.seconds` through `context.timeline`;
for audio reactions, sample a window through `context.audio`. Declare the required capabilities
in `plugin.json`; see the [authoring guide](authoring.md) and [audio examples](audio.md).

Only introduce [instance resources](instance-state.md) when you need handles, reusable objects,
or deterministic caching. The load-smoke check validates loading, not render-history independence.

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

- [Authoring guide](authoring.md) — schemas, capabilities, lifecycle, and properties.
- [Instance resources](instance-state.md) — retained runtime resources and deterministic caching.
- [Deterministic simulation](simulation.md) — fixed-step springs, particles, and MIDI impulses.
- [Rendering and assets](rendering-and-assets.md) — render objects and packaged visuals.
- [Audio](audio.md) — analyzed features, raw PCM, and custom calculators.
- [API reference](reference.md) — package subpaths and manifest contract.
