# MVMNT

> Create polished MIDI-driven motion graphics without leaving your browser.

MVMNT (pronounced _movement_) is a React-powered MIDI visualization studio for producing social-media-ready videos from standard MIDI files. The project embraces a store-first architecture, deterministic rendering pipeline, and in-browser tooling so artists can experiment, iterate, and export with confidence.

## Table of Contents

-   [Quick Start](#quick-start)
-   [Local Backend (Supabase)](#local-backend-supabase)
-   [Making Plugins](#making-plugins)
-   [Development Workflow](#development-workflow)
-   [Scene Files](#scene-files)
-   [Extending MVMNT](#extending-mvmnt)
    -   [Custom Scene Elements](#custom-scene-elements)
    -   [Custom Piano Roll Animations](#custom-piano-roll-animations)
-   [Debug Utilities](#debug-utilities)
-   [License](#license)

## Quick Start

```bash
git clone https://github.com/Maokus/MVMNT.git
cd MVMNT
npm install
npm run dev
```

The development server runs on Vite with hot module replacement. If optional Rollup native dependencies fail to compile on your platform, rerun `npm install` so npm can choose a compatible fallback build.

## Local Backend (Supabase)

The community features (uploads, ratings, downloads) require a Supabase backend. For local development you run a full Supabase stack in Docker.

### Prerequisites

-   [Docker Desktop](https://www.docker.com/products/docker-desktop/)
-   [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

    ```bash
    # macOS
    brew install supabase/tap/supabase
    # or via npm
    npm install -g supabase
    ```

### Setup

**1. Start the local Supabase stack**

```bash
supabase start
```

First run pulls Docker images and may take a few minutes. Once running, note the output:

```
Project URL:  http://127.0.0.1:54321
Publishable:  sb_publishable_...
Studio:       http://127.0.0.1:54323
```

You can retrieve these values at any time with `supabase status`.

**2. Create your local env file**

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and paste in the values from the previous step:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<Publishable key from supabase status>
```

Vite automatically gives `.env.local` higher priority than `.env`, so this overrides the production URL with no other changes needed.

**3. Apply migrations and seed data**

```bash
supabase db reset
```

This applies all migrations in `supabase/migrations/` and runs `supabase/seed.sql`, which creates the required storage buckets (`community-files`, `community-thumbnails`).

**4. Run the dev server**

```bash
npm run dev
```

### Useful local URLs

| Service | URL |
|---|---|
| App | http://localhost:5173 |
| Supabase Studio | http://127.0.0.1:54323 |
| Email testing (Mailpit) | http://127.0.0.1:54324 |
| Direct Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Studio lets you browse tables, manage auth users, and run queries against the local database. Mailpit captures all auth emails (magic links, confirmations) so you can complete auth flows without a real mail server.

### Schema changes

New migrations go in `supabase/migrations/`. Create one with:

```bash
supabase migration new <descriptive_name>
```

Edit the generated file, then apply it:

```bash
supabase db reset
```

### Stopping

```bash
supabase stop        # stops containers, data is preserved
supabase db reset    # wipe and replay from migrations + seed
```

---

## Making Plugins

MVMNT's scene elements are fully pluggable. You can write, build, and distribute your own elements — things like custom MIDI visualisers, audio-reactive shapes, or generative art — using the same API that the built-in elements use.

Plugins are TypeScript classes that extend `SceneElement`. They declare their configurable properties and implement a `_buildRenderObjects()` method that draws on the canvas each frame. The `@mvmnt/plugin-sdk` module provides everything you need: the base class, render primitives, and access to the timeline, audio features, and timing data via a stable host API.

**To get started:** Read the [Plugin Development Quickstart](docs/plugin-quickstart.md).

For a full reference see [Creating Custom Elements](docs/creating-custom-elements.md) and the [Plugin API v1 Reference](docs/plugin-api-v1.md).

## Development Workflow

Before opening a pull request, verify your changes with the full test suite:

```bash
npm run test
npm run build
npm run compile
```

If `npm run test` fails because of missing optional binaries, rerun `npm install` and execute the tests again.

## Extending MVMNT

### Custom Scene Elements

Custom elements are the primary extension point for MVMNT. Write a TypeScript class, describe its properties, implement a render method, and MVMNT will integrate it into the scene editor and rendering pipeline alongside the built-in elements.

The public API lives in `@mvmnt/plugin-sdk`. Elements are distributed as `.mvmnt-plugin` bundles (ZIP archives), which users import through the Settings panel.

| Document | Purpose |
|---|---|
| [Plugin Development Quickstart](docs/plugin-quickstart.md) | Start here — build and test a working element in under 15 minutes |
| [Creating Custom Elements](docs/creating-custom-elements.md) | Full guide: properties, render objects, audio/MIDI bindings, packaging |
| [Plugin API v1 Reference](docs/plugin-api-v1.md) | Complete `@mvmnt/plugin-sdk` API surface |
| [Runtime Plugin Loading](docs/runtime-plugin-loading.md) | How `.mvmnt-plugin` bundles are loaded and managed |

### Custom Piano Roll Animations

Use the `/animation-test` route to design animations for the time-unit piano roll. 

To add a new animation:

1. Create a new file in `src/core/scene/elements/midi-displays/note-animations`.
2. Copy the contents of `template.ts` into the file.
3. Rename the class and customize the implementation.
4. Uncomment `registerAnimation` at the bottom and update the metadata.

Once registered, the animation appears in both `/animation-test` and the main application.

## Debug Utilities

-   `window.mvmntTools.timeline.setMasterTempoMap([{ time: 0, bpm: 100 }, { time: 3, bpm: 200 }])` adds a tempo map to the time unit piano roll via the store-driven timeline adapter.
-   `localStorage.setItem("VIS_DEBUG", 1)` enables verbose visualization debug logging.
-   `localStorage.removeItem("mvmnt_onboarded_v1")` re-enables the onboarding modal.
-   Dispatch manual scene updates from the console:

    ```ts
    window.mvmntTools.scene.dispatch(
        {
            type: 'updateElementConfig',
            elementId: 'background',
            patch: { offsetX: 120 },
        },
        { source: 'console tweak' }
    );

    // Example macro patch
    // patch: { offsetX: { type: 'macro', macroId: 'beat-shift' } }
    ```

## License

MVMNT is released under the GNU Affero General Public License v3.0 (AGPL-3.0). If you modify this software and make it available to users, you must also provide those users access to the complete corresponding source code of your modified version under the same license. See the [`LICENSE`](LICENSE) file for details.
