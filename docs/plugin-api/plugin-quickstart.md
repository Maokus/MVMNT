# Plugin SDK 2 quickstart

This guide creates an external MVMNT plugin, previews it with hot reload, and packages it for
import. You need Node.js 18 or newer, npm, and MVMNT running locally. Plugin development does not
require an application source checkout.

## Create a plugin

Run the generator from the directory where you keep your projects:

```sh
npm create mvmnt-plugin@latest -- --name com.example.pulse --template minimal
cd pulse
npm install
npm run check
```

The final part of the plugin ID becomes both the directory and first element type. The generated
project contains everything needed to start:

```text
pulse/
├── assets/
├── src/pulse.ts
├── package.json
├── plugin.json
└── tsconfig.json
```

Use a reverse-domain plugin ID that you control. Run the generator with `--help` to see the other
starter templates and options for display names, descriptions, and output directories.

## Edit the element

Open `src/pulse.ts`. The generated element already renders and type-checks, so you can change it
incrementally. Its main parts are:

- `metadata`: the name, description, and picker category.
- `schema`: editable properties shown by MVMNT. It also determines the TypeScript type of `props`.
- `plugin.json` capabilities: host APIs the element uses. They are declared once, in the manifest.
- `render`: returns the render objects displayed for the current frame.

Keep the element's `type` equal to its entry in `plugin.json`. Run this after editing:

```sh
npm run check
```

SDK 2 plugins use `definePluginElement()` and imports from `@mvmnt-app/plugin-sdk`. Do not import
MVMNT application aliases such as `@core/*` or `@state/*`.

## Sample properties at other times

`props` contains property values for the current render time. Instance callbacks can also sample their own
declared properties at arbitrary timeline times without reading automation data directly:

```ts
render(props, _state, time, context) {
    const previous = context.properties.valueAt('speed', time.seconds - 0.25);
    const distance = context.properties.integrate('speed', {
        startSeconds: 0,
        endSeconds: time.seconds,
    });
    const meanSpeed = context.properties.average('speed', {
        startSeconds: Math.max(0, time.seconds - 1),
        endSeconds: time.seconds,
    });

    if (!previous.ok || !distance.ok || !meanSpeed.ok) return [];
    // Use previous.value, distance.value, and meanSpeed.value here.
    return [];
}
```

`valueAt()` supports every declared property. `integrate()` and `average()` are restricted to numeric properties
by TypeScript and validate values again at runtime. Integration returns signed value-seconds and accepts optional
`absoluteTolerance`, `relativeTolerance`, and `maxEvaluations` controls as its third argument.

## Cache expensive generated visuals without element state

Keep `render()` deterministic: derive output from `props`, `time`, and callback-scoped host
snapshots. For dense audio displays, request a packed window with
`context.audio.sampleFeatureMatrix()`, then pass its opaque `revision` plus presentation settings
as the `contentKey` for `context.assets.generatedRaster()`. The pixel builder runs only on a cache
miss; the returned snapshot can be passed to `VisualMedia.setResource()`.

Do not retain render objects, canvas contexts, or host snapshots between renders. Resource
lifetimes, eviction, scratch surfaces, and memory budgets are owned by MVMNT, so cache state can
change render cost but never the pixels associated with a content key.

## Preview with hot reload

Start MVMNT in development mode, then run the watcher from the generated plugin project:

```sh
cd /absolute/path/to/pulse
npm run dev
```

In MVMNT, open **Scene Settings → Debug** and select **Scan** under Development Plugin Server.
The element appears in the picker, and saving source, manifest, or asset files rebuilds it.

Restart `npm run dev` only after changing the plugin ID. See the
[development workflow](dev-plugin-workflow.md) for ports, reload behavior, and troubleshooting.

## Add another element

Run the generator again from the plugin directory:

```sh
cd /absolute/path/to/pulse
npm create mvmnt-plugin@latest -- add rings --template minimal
npm run check
```

This creates `src/rings.ts` and adds its capabilities to `plugin.json`. The watcher reloads it.

## Package and import

From the plugin project, build the distributable archive:

```sh
npm run build
```

The bundle is written to `dist/com.example.pulse-0.1.0.mvmnt-plugin`. In MVMNT, open
**Settings → Plugins → Import** and select that file.

## Where to go next

- [Capabilities](plugin-capabilities.md): required and optional host APIs.
- [Lifecycle](plugin-lifecycle.md): setup, state, cleanup, and abort signals.
- [SDK API inventory](plugin-sdk-api-inventory.md): exports and supported import paths.
- [Plugin manifest schema](plugin-manifest.schema.json): all `plugin.json` fields.
- [SDK 1 to SDK 2 migration](plugin-v1-to-v2.md): update an existing legacy plugin,
  including the `range` to numeric-slider-layout schema migration.
  plugins.

Place packaged files under `assets/` and access them through `context.assets`.

## Troubleshooting

| Error or symptom                         | What to do                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Generator refuses a type or file         | Use a lowercase kebab-case element type and choose a new file name.                              |
| `npm run check` reports a private import | Import only the root SDK or a documented SDK subpath; app aliases such as `@core/*` are private. |
| Manifest capability error                | Declare valid `required` and `optional` arrays once, on the element in `plugin.json`.            |
| No development plugin appears            | Confirm the plugin-side `npm run dev` is running, then select **Scan** in MVMNT.                 |
| Build succeeds but load fails            | Check that the exported definition type exactly matches its `plugin.json` element type.          |
