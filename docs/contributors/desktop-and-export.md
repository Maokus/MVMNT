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

### Renderer export architecture

The renderer-side export domain is organized by responsibility under `src/export`:

- `contracts` defines export requests, resolved plans, environments, output sessions, and results.
- `planning` validates a request and resolves its range, frame count, codecs, bitrate, filename, and estimate once.
- `jobs` owns the persistent job store, single-job coordinator, cancellation, and background bootstrap contract.
- `pipeline` owns deterministic frame rendering and the PNG/video/audio encoding stages.
- `outputs` adapts the format-neutral output session to the capability-based Electron bridge.
- `codecs`, `timing`, `diagnostics`, and `presets` contain their corresponding focused support code.

Foreground UI actions, the hidden background renderer, and command-line automation submit the same export request to
the coordinator. React context only exposes the small submit/cancel/reveal facade; it does not own encoder or sink
logic. Export modules must not depend on React context or workspace UI, and exporter constructors must not be placed
on `window`.

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
