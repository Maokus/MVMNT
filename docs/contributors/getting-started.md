# Contributor getting started

MVMNT is an Electron application with a React/TypeScript renderer. It uses Vite, Zustand, Vitest,
and workspace packages for the public plugin SDK and plugin tooling.

## Setup

Use Node.js 22.12 or newer in the Node 22 release line. Install dependencies with `npm install`, not
`npm ci`, so npm selects native binaries for the current platform.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and Electron together. Renderer-only development is available through
`npm run dev:renderer` when Electron integration is not required.

## Common commands

| Command                        | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `npm run dev`                  | Start the desktop development application.     |
| `npm run test`                 | Run the Vitest suite.                          |
| `npm run build`                | Build the renderer, main process, and preload. |
| `npm run compile`              | Type-check application and Electron sources.   |
| `npm run test:timeline`        | Run focused timeline state tests.              |
| `npm run test:persistence`     | Run persistence tests.                         |
| `npm run test:plugin-contract` | Verify SDK, loader, and registry parity.       |
| `npm run docs:check`           | Validate local Markdown links and anchors.     |

Before handing off a change, run the complete root verification sequence documented in
[`AGENTS.md`](../../AGENTS.md).

## Repository domains

- `src/core/` owns rendering, timing, MIDI parsing, scene elements, resources, and the plugin host.
- `src/state/` owns Zustand stores, selectors, command gateways, selection, and undo integration.
- `src/workspace/` owns the visual editor interface.
- `src/persistence/` owns `.mvt` import, export, packaging, validation, and migrations.
- `src/audio/`, `src/fonts/`, and `src/export/` own their respective runtime services.
- `electron/` owns the main process, preload, desktop security boundary, and native integration.
- `packages/plugin-sdk/` and `packages/plugin-tools/` own the public SDK and plugin CLI contracts.

Read the nearest `AGENTS.md` before changing a domain. Check its command, selection, persistence,
and shortcut paths before adding another path for the same behavior.

## Change workflow

1. Find the owning domain and its existing public entry point.
2. Reproduce user-visible defects with a focused regression test.
3. Route persistent mutations through the appropriate command gateway.
4. Update the canonical documentation page when behavior or a public contract changes.
5. Run focused tests while iterating, then the complete verification suite.
