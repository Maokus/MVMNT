# Electron Desktop Architecture

MVMNT ships as a sandboxed Electron application for macOS and Windows. Development and packaging
use Node.js 22.12 or newer (Node 20 is unsupported). The React application
remains the renderer; Electron owns application lifecycle, approved document paths, native menus,
external navigation, downloads, packaging, and updates.

## Development

Install platform-compatible dependencies and start Vite with Electron:

```bash
npm install
npm run dev
```

The macOS DMG tooling is installed only on macOS; Windows developers can install and run the app
without it. Use the matching platform-specific packaging command when creating installers.

### Windows: recover from a Node or Electron install error

`EBADENGINE`, `ERR_REQUIRE_ESM` while Electron downloads, and "Electron failed to install
correctly" mean the dependencies were installed with an unsupported Node version. Install
[NVM for Windows](https://github.com/coreybutler/nvm-windows/releases), reopen the terminal, then
run the following from Git Bash:

```bash
nvm install 22.12.0
nvm use 22.12.0
node --version
rm -rf node_modules
npm install
npm run dev
```

Continue only when `node --version` reports Node 22.12 or later in the Node 22 release line. Keep
`package-lock.json`; do not run Electron's suggested manual installer.

Build the renderer, main process, and preload together:

```bash
npm run build
npm run test:electron
```

Create a local package or platform installer:

```bash
npm run package
npm run make:mac
npm run make:win
```

The macOS maker must run on macOS. The Windows maker must run on Windows.
Offline packaging can point `ELECTRON_ZIP_DIR` at a directory containing Electron's platform ZIP.

## Process Boundaries

- The renderer has no Node integration and runs with context isolation and Chromium sandboxing.
- The preload exposes only the typed `window.mvmntDesktop` API.
- The main process retains the current document path. Renderer and plugins never receive generic
  filesystem or IPC access.
- Production assets are served from the secure `mvmnt://app/` protocol. Development uses the Vite
  server at `127.0.0.1`.
- SDK 2 plugins continue to execute in the sandboxed renderer. Installation requires a trust warning.

## Document Lifecycle

`.mvt` remains the canonical document format. The renderer serializes and validates packages; the
main process presents native dialogs and performs atomic writes. A saved project's filename stem is
always its Scene Name: title edits rename the active file after confirmation, and first Save / Save
As choose a destination for `Scene Name.mvt`. New Blank Scene clears the active file association,
so its first Save cannot overwrite the project it was created from.

IndexedDB stores recovery snapshots and large asset caches. Dirty desktop documents create a
recovery snapshot after five seconds and every thirty seconds while dirty. On the next launch,
MVMNT offers to restore a dirty recovery snapshot.

macOS document metadata and Windows per-user file associations register `.mvt` and
`.mvmnt-plugin`. OS open requests join the normal dirty-document and import flow.

## Distribution

Tagged `v*` commits build a universal macOS DMG/ZIP and a Windows x64 Squirrel installer. Release
CI expects these secrets:

- `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `WINDOWS_CERTIFICATE_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`

Published packages use GitHub Releases and `update.electronjs.org`. Release artifacts must be
signed; macOS artifacts must also be notarized.

## Desktop export system

Desktop exports use job-scoped filesystem capabilities rather than renderer filesystem access. The
main process chooses the destination and retains its path; the renderer receives an opaque session
identifier and a backpressured Mediabunny stream target.

- MP4 and WebM container chunks are written to a temporary file as they are encoded. Successful
  finalization uses a recoverable swap, so an existing destination is not discarded until the new
  file is ready.
- PNG sequences are written one frame at a time into a temporary directory and verified against the
  expected frame count before the directory is finalized.
- Cancellation, write failure, application exit, and interrupted-launch recovery remove known
  temporary exports.
- Video headers and non-zero sizes are checked before completion. A utility process calculates the
  final SHA-256 checksum without blocking the renderer.
- Video exports receive a JSON sidecar manifest. PNG sequence directories contain `manifest.json`.
- Optional mixed WAV masters and per-track WAV stems are written into a sibling `_assets` directory.
  WAV artifacts support 16-, 24-, and 32-bit PCM, mono/stereo output, selectable sample rate, and
  optional peak normalization.

The renderer keeps a persistent export-job history with progress, cancellation, retry, logs,
performance metrics, interrupted-job reporting, and reveal-in-file-manager actions. Jobs run one at
a time to avoid uncontrolled GPU and memory contention. Editing is locked while the queue is active
so every job renders the scene state from which the queue was created.

The Render dialog supports built-in and user presets, custom output dimensions, filename templates,
batch preset exports, and comma-separated range batches. Browser builds retain Blob downloads and ZIP
sequences as a compatibility fallback.

## Portable automation and workspace tools

The packaged renderer can run in a hidden window while retaining the same Chromium GPU, font,
scene-import validation, export queue, encoder, destination finalization, and manifest code as an
interactive export. Build the app once, then invoke:

```bash
npm run render -- project.mvt --output output.mp4 --preset hd-landscape --range 2:12 --json
npm run render -- project.mvt --kind png --output ./frames --preset transparent-png
```

Supported overrides are `--kind video|png`, the four built-in preset IDs, `--range start:end`,
`--width`, `--height`, `--fps`, and `--json`. JSON mode emits newline-delimited progress and a final
structured result. Exit codes are 0 for success, 2 for command usage, 3 for invalid input, 4 for a
render/encode failure, and 5 for destination/finalization failure. Output paths are accepted only
from the main-process command line; renderer code still receives opaque export session IDs.

Dirty-project recovery keeps up to 12 deduplicated `.mvt` versions per document name for 30 days.
File → Recovery Versions shows document name, timestamp, and size and permits restore or deletion.
File → Storage & Caches shows the desktop data location and cleanup controls for recovery packages,
decoded audio, feature caches, interrupted temporary exports, and the platform update cache.

Desktop drag-and-drop validates file type and size in the main process before routing projects and
templates through scene import, plugins through the trust prompt, MIDI/audio through timeline import,
images through the asset registry, and fonts through font parsing, licensing acknowledgement, and
scene storage budgets.

Develop plugins with the plugin-side localhost `npm run dev` workflow. The desktop application follows
the same Vite development-plugin connection as the browser build; see the
[development workflow](plugin-api/dev-plugin-workflow.md).

External `mvmnt://automation/` links recognize only `show-recovery`, `show-storage`, and
`open-community` (with an optional constrained ID). The protocol cannot supply filesystem paths,
scripts, render commands, or plugin execution.

Phase 5 intentionally does not include persisted user preferences or multiple project windows.
