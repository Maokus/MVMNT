# Plugin SDK 2 quickstart

This guide creates an external MVMNT plugin, previews it with hot reload, and packages it for
import. You need Node.js 18 or newer, npm, and a local MVMNT checkout.

## Create a plugin

Run the generator from the directory where you keep your projects:

```sh
npm create mvmnt-plugin@latest -- --name com.example.pulse --template minimal
cd pulse
npm install
npm run typecheck
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
- `capabilities`: host APIs the element uses.
- `render`: returns the render objects displayed for the current frame.

Keep the element's `type` equal to its entry in `plugin.json`. Capability lists in the source and
manifest must also match exactly. Run this after editing:

```sh
npm run typecheck
```

SDK 2 plugins use `definePluginElement()` and imports from `@mvmnt-app/plugin-sdk`. Do not import
MVMNT application aliases such as `@core/*` or `@state/*`.

## Preview with hot reload

Run these commands from the MVMNT checkout:

```sh
# Terminal 1
npm run dev

# Terminal 2
npm run dev-plugin -- /absolute/path/to/pulse
```

Open MVMNT in the browser. The plugin loads automatically and its element appears in the scene
element picker. Saving a source or asset file rebuilds and reloads the plugin. If the browser was
opened before the plugin watcher started, refresh it once.

Restart `dev-plugin` after changing `plugin.json`. See the
[development workflow](dev-plugin-workflow.md) for ports, reload behavior, and troubleshooting.

## Add another element

Run the generator again from the plugin directory:

```sh
cd /absolute/path/to/pulse
npm create mvmnt-plugin@latest -- add rings --template minimal
npm run typecheck
```

This creates `src/rings.ts` and adds it to `plugin.json`. Restart `dev-plugin` so it reads the new
manifest entry.

## Package and import

From the MVMNT checkout, build the distributable archive:

```sh
npm run build-plugin -- /absolute/path/to/pulse
```

The bundle is written to `dist/com.example.pulse-0.1.0.mvmnt-plugin`. In MVMNT, open
**Settings → Plugins → Import** and select that file.

## Where to go next

- [Capabilities](plugin-capabilities.md): required and optional host APIs.
- [Lifecycle](plugin-lifecycle.md): setup, state, cleanup, and abort signals.
- [SDK API inventory](plugin-sdk-api-inventory.md): exports and supported import paths.
- [Plugin manifest schema](plugin-manifest.schema.json): all `plugin.json` fields.
- [SDK 1 to SDK 2 migration](plugin-v1-to-v2.md): update an existing legacy plugin.
- [Compilable examples](../../src/pluginexamples/README.md): larger MIDI, image, and animation
  plugins.

Place packaged files under `assets/` and access them through `context.assets`.
