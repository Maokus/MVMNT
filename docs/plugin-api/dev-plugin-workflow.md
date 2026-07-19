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

# Terminal 2: watcher/builder for one plugin directory
npm run dev-plugin -- /absolute/path/to/plugin
```

The plugin directory must contain a valid SDK 2 `plugin.json`. Element entries may be TypeScript or
JavaScript accepted by esbuild. SDK 1 source is rejected by the development builder.

The browser-side watcher exists only when `import.meta.env.DEV` is true. A production build or
`vite preview` will not connect to a development plugin server.

By default both sides use `127.0.0.1:7741`. To use another port, configure both processes before
starting Vite:

```sh
# Terminal 1
VITE_DEV_PLUGIN_PORT=7750 npm run dev

# Terminal 2
npm run dev-plugin -- /absolute/path/to/plugin --port 7750
```

Changing `VITE_DEV_PLUGIN_PORT` requires restarting Vite. One browser watcher connects to one port,
so the built-in workflow develops one plugin server at a time.

## What happens on startup

1. `dev-plugin.mjs` reads and validates `plugin.json` and checks every declared entry and import.
2. Each element is bundled as readable browser-targeted CommonJS. Public SDK imports remain
   external so MVMNT injects the runtime matching `apiVersion`.
3. The server copies `assets/`, creates a fast-compressed `.mvmnt-plugin` archive in a temporary
   directory, keeps its bytes in memory, and removes the temporary files.
4. It exposes three HTTP endpoints:

   - `/events` — Server-Sent Events announcing successful rebuilds.
   - `/status` — the current plugin ID and whether an initial bundle is ready.
   - `/<plugin-id>.mvmnt-plugin` — the latest archive with caching disabled.

5. When MVMNT's `EventSource` connects, the app reads `/status` and fetches the current archive.
   This handles the case where the initial build finished before the browser connected.
6. The normal runtime loader stores the archive, injects SDK 2 modules, registers element types as
   `<plugin-id>:<element-type>`, and refreshes matching scene instances.

If the browser attempted its first connection before the development server existed, refresh MVMNT
after the server reports `Watching for changes…`.

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
- `plugin.json` is validated when the server starts. Restart `npm run dev-plugin` after changing the
  manifest, including its ID, entries, capabilities, or version.
- Development archives pass through the regular loader and are written to the plugin binary store.
  The latest successful build can therefore appear as an installed plugin after a refresh. Remove
  it from Settings → Plugins when development is finished if you do not want it retained.
- The development build is kept out of `dist/`. Use `npm run build-plugin -- <plugin-dir>` to create
  a distributable, minified archive with its versioned filename.

## Failure behavior and troubleshooting

Build errors are printed in the terminal and do not emit a rebuild event, so the currently running
plugin stays active. A runtime load failure happens after the previous definition has been unloaded;
fix the error and save again to restore it.

Common checks:

- No connection: confirm MVMNT is using `npm run dev`, both sides use the same port, and refresh once
  after the watcher says it is ready.
- `EADDRINUSE`: stop the existing server or configure the same alternate port on Vite and
  `dev-plugin`.
- Manifest/import rejection: run `npm run build-plugin -- <plugin-dir>` for the same contract
  validation without starting the watcher.
- Changes do not rebuild: restart the watcher. On platforms without recursive `fs.watch`, the
  command reports that watching is unavailable.
- Element temporarily becomes “missing”: inspect the browser console for `DevPluginWatcher` or
  `PluginLoader` errors, then save after correcting the runtime failure.
- Stale manifest values: restart the watcher; manifest data is not reread during a running session.

For lifecycle details, see [Plugin element lifecycle](plugin-lifecycle.md). For packaging and the
first complete element, return to the [SDK 2 quickstart](plugin-quickstart.md).
