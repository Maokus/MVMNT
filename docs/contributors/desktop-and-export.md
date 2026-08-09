# Desktop and export

## Electron boundary

MVMNT runs its React application in a sandboxed, context-isolated renderer without Node integration.
The preload exposes only the typed `window.mvmntDesktop` bridge. The main process owns application
lifecycle, approved paths, dialogs, atomic file operations, menus, external navigation, packaging,
updates, and operating-system registration.

Production content is served through the `mvmnt://app/` protocol. Renderer and plugin code never
receive generic filesystem or IPC access.

## Document lifecycle

The renderer serializes and validates `.mvt` packages; the main process chooses destinations and
writes them atomically. The current document path remains in the main process. Recovery snapshots
and large caches use desktop storage, and dirty documents are offered for recovery after an
interrupted session.

Desktop drag-and-drop is classified and size-checked before projects, plugins, MIDI, audio, images,
or fonts are routed to their normal import flows.

## Export jobs

Desktop jobs run one at a time in a hidden throttling-disabled renderer. The editor packages an
immutable scene snapshot when queuing a job, so later edits cannot change the render. The hidden
renderer owns its canvas, visualizer, encoder, and audio mix; the main process retains the output
path behind an opaque job capability.

Video chunks and image frames are written to temporary targets and validated before a recoverable
finalization swap. Cancellation, failure, application exit, and interrupted-launch cleanup remove
known temporary output. Browser builds retain the foreground Blob/ZIP path.

## Command-line rendering

Build the desktop application before invoking the hidden renderer:

```bash
npm run render -- project.mvt --output output.mp4 --preset hd-landscape --range 2:12 --json
npm run render -- project.mvt --kind png --output ./frames --preset transparent-png
```

The main process validates paths and command options before starting a renderer. JSON mode emits
newline-delimited progress and a structured terminal result.

## Development and packaging

```bash
npm run build
npm run test:electron
npm run package
```

Use `npm run make:mac` on macOS and `npm run make:win` on Windows. Tagged `v*` releases build signed
desktop artifacts through `.github/workflows/desktop-release.yml`; macOS release artifacts also
require notarization.
