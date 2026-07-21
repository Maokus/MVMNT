# Electron Desktop Architecture

MVMNT ships as a sandboxed Electron application for macOS and Windows. Development and packaging
use Node.js 22. The React application
remains the renderer; Electron owns application lifecycle, approved document paths, native menus,
external navigation, downloads, packaging, and updates.

## Development

Install platform-compatible dependencies and start Vite with Electron:

```bash
npm install
npm run dev
```

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
main process presents native dialogs and performs atomic writes. First Save selects a path, later
saves reuse it, and Save As always selects a new path.

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
