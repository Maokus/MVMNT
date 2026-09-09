# Plugin development workflow

`mvmnt-plugin dev` uses the same manifest validation, SDK externalization, archive parsing,
capability checks, and element registration as imported plugins. A local server keeps the latest
archive in memory and announces successful rebuilds.

## Start the watcher

```bash
cd /absolute/path/to/plugin
npm run dev
```

One process can serve several plugin projects:

```bash
npx mvmnt-plugin dev /absolute/path/to/plugin-a /absolute/path/to/plugin-b
```

The first available address from `127.0.0.1:7741` through `:7750` is selected. To require a
specific port, pass `--port`; the command exits if that port is unavailable.

```bash
npx mvmnt-plugin dev --port 7750
```

Development discovery exists only in a Vite development build. Open **Scene Settings → Developer** and
scan for a Development Plugin Server. Continue scanning when MVMNT should discover a server that
starts later.

## Build and reload behavior

The watcher validates `plugin.json`, bundles entries as browser-targeted CommonJS, externalizes SDK
imports, copies `assets/`, and creates an in-memory archive. Source, manifest, and asset changes are
debounced and rebuilt.

After a successful rebuild MVMNT:

1. Fetches the new archive without browser caching.
2. Disposes old instance and definition lifecycles and revokes asset URLs.
3. Validates and loads the replacement even when its version is unchanged.
4. Recreates matching runtime instances from the existing scene properties.

Scene IDs and property values survive. Instance resources returned by `createResources()` does not; the
replacement gets a fresh value. This is a lifecycle-accurate reload rather than JavaScript module
replacement.

Development archives are session-only and are removed when their server shuts down or remains
unreachable. Use `npm run build` for a distributable archive.

## Troubleshooting

- Run `npm run check` for manifest, type, bundle, and load-smoke failures.
- Confirm MVMNT itself is running in development mode.
- Without `--port`, let the watcher try the complete default range.
- Restart the watcher after changing the plugin ID.
- Remove an installed plugin with the same ID before serving a development copy.
- A build failure leaves the previous plugin active; a runtime load failure may leave it unloaded
  until the next successful save.
