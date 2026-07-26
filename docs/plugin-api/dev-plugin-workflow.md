# Developing plugins with hot reload

MVMNT's development loader runs the same manifest validation, SDK externalization, archive parsing,
capability checks, and element registration used for an imported `.mvmnt-plugin`. The difference is
transport: a local watcher keeps the latest development archive in memory and tells the browser
when to fetch it.

## Start the development loop

Run both commands from the MVMNT checkout:

```sh
# Terminal 1: the MVMNT application in Vite development mode
npm run dev

# Terminal 2: watcher/builder for one or more plugin directories
npm run dev-plugin -- /absolute/path/to/plugin

# Multiple plugins share the same localhost server and hot-reload together.
npm run dev-plugin -- /absolute/path/to/plugin-a /absolute/path/to/plugin-b
```

The plugin directory must contain a valid SDK 2 `plugin.json`. Element entries may be TypeScript or
JavaScript accepted by esbuild. SDK 1 source is rejected by the development builder.

The browser-side watcher exists only when `import.meta.env.DEV` is true. A production build or
`vite preview` will not connect to a development plugin server.

By default `dev-plugin` uses the first available port from `127.0.0.1:7741` through `:7750`.
The Vite development build automatically discovers servers in that range, so an occupied default
port does not interrupt the normal workflow. The command prints the selected URL.

To use a port outside that range, configure both processes before starting Vite:

```sh
# Terminal 1
VITE_DEV_PLUGIN_PORT=7750 npm run dev

# Terminal 2
npm run dev-plugin -- /absolute/path/to/plugin --port 7750
```

Changing `VITE_DEV_PLUGIN_PORT` requires restarting Vite. An explicit port is exact: if it is in
use, `dev-plugin` exits with instructions instead of selecting a different one. One server can
serve any number of plugin directories.

## What happens on startup

1. `dev-plugin.mjs` reads and validates `plugin.json` and checks every declared entry and import.
2. Each element is bundled as readable browser-targeted CommonJS. Public SDK imports remain
   external so MVMNT injects the runtime matching `apiVersion`.
3. The server copies `assets/`, creates a fast-compressed `.mvmnt-plugin` archive in a temporary
   directory, keeps its bytes in memory, and removes the temporary files.
4. It exposes three HTTP endpoints:

   - `/events` — Server-Sent Events announcing successful rebuilds.
   - `/status` — all served plugin IDs, revisions, readiness, and build errors.
   - `/<plugin-id>.mvmnt-plugin` — each latest archive with caching disabled.

5. In MVMNT's **Scene Settings → Debug** tab, select **Scan** under Development Plugin Server.
   MVMNT probes the configured port (or the default range) once, opens an `EventSource` only for
   responding servers, then fetches every current archive. Enable **Continue scanning** if the
   plugin server may start later; discovery cycles are summarised in one console message rather
   than logging a connection error for each closed port.
6. The normal runtime loader stores the archive, injects SDK 2 modules, registers element types as
   `<plugin-id>:<element-type>`, and refreshes matching scene instances.

Connected servers continue to receive hot-reload events. If a server goes away, scan again (or
enable **Continue scanning**) to discover it when it returns.

## What happens after a save

The watcher observes the plugin directory recursively, ignoring `.git`, `.build`, `dist`,
`node_modules`, hidden paths, and editor backup files. Changes are debounced for 150 ms. A successful
build replaces the in-memory archive and emits one `rebuild` event.

The browser then:

1. Fetches the new archive with `cache: no-store`.
2. Disposes definition and instance lifecycles, unregisters the old plugin, and revokes its bundled
   asset URLs.
3. Loads and validates the replacement even when its version number is unchanged.
4. Re-registers its element types and recreates matching runtime scene instances from the scene
   store's existing property bindings.

Scene element IDs and saved property values survive. Callback-owned state returned by `create()`
does not survive; `dispose()` runs and the new definition receives a fresh `create()`. Asset handles
are likewise recreated. This is deliberately a lifecycle-accurate reload, not JavaScript module
hot replacement.

## Files, manifests, and persistence

- Source and `assets/` changes trigger rebuilds. Assets are copied into every successful archive.
- Valid `plugin.json` edits are picked up automatically. Changing the plugin ID requires restarting
  `npm run dev-plugin`; entries, capabilities, assets, and versions hot-reload normally.
- Development archives are session-only. They are never written to the plugin binary store and are
  removed when the server sends a shutdown event or remains unreachable for five seconds.
- The development build is kept out of `dist/plugins/`. Use `npm run build-plugin -- <plugin-dir>` to create
  a distributable, minified archive with its versioned filename.

## Failure behavior and troubleshooting

Build errors are printed in the terminal and do not emit a rebuild event, so the currently running
plugin stays active. A runtime load failure happens after the previous definition has been unloaded;
fix the error and save again to restore it.

Common checks:

- No connection: confirm MVMNT is using `npm run dev`. Starting either process first is supported;
  the browser reconnects automatically.
- `EADDRINUSE`: without `--port`, the command tries ports `7741` through `7750`. With `--port`,
  select a free port and configure the same `VITE_DEV_PLUGIN_PORT` value for Vite.
- Manifest/import rejection: run `npm run build-plugin -- <plugin-dir>` for the same contract
  validation without starting the watcher.
- Changes do not rebuild: restart the watcher. On platforms without recursive `fs.watch`, the
  command reports that watching is unavailable.
- Element temporarily becomes “missing”: inspect the browser console for `DevPluginWatcher` or
  `PluginLoader` errors, then save after correcting the runtime failure.
- Installed-plugin collision: remove an imported plugin with the same ID before serving its dev copy.

For lifecycle details, see [Plugin element lifecycle](plugin-lifecycle.md). For packaging and the
first complete element, return to the [SDK 2 quickstart](plugin-quickstart.md).
