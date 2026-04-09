MVMNT is a React/TypeScript web app for creating MIDI-driven motion-graphics visualisations. Built with Vite, Zustand for state, and Vitest for testing.

When setting up the environment, always run `npm install` (rather than `npm ci`) so npm can select binaries compatible with your platform.

When you are finished, run all of the following commands to verify that all proposed changes are working correctly:

```
npm run test
npm run build
npm run compile
```

If `npm run test` fails because an optional Rollup native dependency is missing, run `npm install` and rerun `npm run test` before continuing.

When asked to "implement phase x" of a plan, read through the requirements and goals of the phase clearly, and do not exit until the goals are met. If the implementation of the phase requires writing code, WRITE THE CODE. DO NOT simply mark the phase as complete.

## Directory Structure

-   `/docs` – Documentation for implemented features. Start here for architecture overviews and API references.
-   `/src` – Main application source:
    -   `core/` – Runtime engine: scene element registry, rendering, timing, MIDI parsing, and the plugin host API.
    -   `state/` – Zustand stores, selectors, command gateways, and undo infrastructure.
    -   `workspace/` – All workspace UI components (panels, forms, modals, layout).
    -   `persistence/` – Scene file export/import, migrations, validation.
    -   `audio/` – Audio analysis, caching, and feature extraction.
    -   `export/` – Video/image export pipeline.
    -   `plugins/` – External/user-authored plugin directory (not the SDK itself).
    -   `math/` – Math, geometry, and numeric helpers.
    -   `utils/` – Shared utilities (logging, throttling, feature flags).
    -   `templates/` – Pre-built `.mvt` scene template files.
-   `/thoughts` – Exploratory planning documents. May be outdated; cross-check with `/docs`.

## Plugin / Scene Element System

Scene elements are the visual building blocks of a scene. First-party defaults live in `src/core/scene/elements/`. Elements import from `@mvmnt/plugin-sdk` — a TypeScript path alias (not an npm package) that resolves to `src/core/scene/plugins/plugin-sdk.ts` at compile time and is injected at runtime.

See `docs/plugin-api-v1.md` for the full API reference and `docs/creating-custom-elements.md` to author new elements.
