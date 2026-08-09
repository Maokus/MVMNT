MVMNT is a React/TypeScript web app for creating MIDI-driven motion-graphics visualisations. Built with Vite, Zustand for state, and Vitest for testing.

When setting up the environment, always run `npm install` (rather than `npm ci`) so npm can select binaries compatible with your platform.

When you are finished, run all of the following commands to verify that all proposed changes are working correctly:

```
npx prettier --write .
npm run test
npm run build
npm run compile
```

Before changing code, read the nearest `AGENTS.md`, identify the owning domain, and check its existing command,
selection, persistence, and shortcut paths. Add a focused regression test for user-visible bugs.

## Current Compatibility Status

Read [`docs/current-state.md`](docs/current-state.md) before changing scene formats, plugin contracts, or
compatibility code. MVMNT 0.16 and SDK 2 are pre-release: simplify their current designs freely, but preserve
tested scene migrations unless their maintenance cost is disproportionate.

If `npm run test` fails because an optional Rollup native dependency is missing, run `npm install` and rerun `npm run test` before continuing.

When asked to "implement phase x" of a plan, read through the requirements and goals of the phase clearly, and do not exit until the goals are met. If the implementation of the phase requires writing code, WRITE THE CODE. DO NOT simply mark the phase as complete.

## Directory Structure

- `/docs` – Documentation for implemented features. Start here for architecture overviews and API references.
- `/src` – Main application source:
    - `core/` – Runtime engine: scene element registry, rendering, timing, MIDI parsing, and the plugin host API.
    - `state/` – Zustand stores, selectors, command gateways, and undo infrastructure.
    - `workspace/` – All workspace UI components (panels, forms, modals, layout).
    - `persistence/` – Scene file export/import, migrations, validation.
    - `audio/` – Audio analysis, caching, and feature extraction.
    - `export/` – Video/image export pipeline.
    - `plugins/` – External/user-authored plugin directory (not the SDK itself).
    - `math/` – Math, geometry, and numeric helpers.
    - `utils/` – Shared utilities (logging, throttling, feature flags).
    - `templates/` – Pre-built `.mvt` scene template files.
- `/thoughts` – Exploratory planning documents. May be outdated; cross-check with `/docs`.

## Plugin / Scene Element System

Scene elements are the visual building blocks of a scene. First-party defaults live in `src/core/scene/elements/`. The public `@mvmnt/plugin-sdk` is a versioned workspace package in `packages/plugin-sdk`; plugin bundles externalize it and the loader injects the runtime selected by `apiVersion`.

Start with `docs/plugin-api/plugin-quickstart.md`. SDK 1 has been removed from the current plugin surface; use the
SDK 1 to SDK 2 migration guide only when updating legacy plugin source.
