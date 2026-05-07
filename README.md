# MVMNT

MVMNT (pronounced _movement_) is a free and open source music visualization tool designed to create beautiful, modern, MIDI and audio-reactive graphics.

For creatives, it is a highly customisable and fully featured application that draws ui patterns from popular creative softwares (Blender, After Effects, Ableton) to create an intuitive working experience.

For developers, it is a framework which handles a ton of dirty work like getting user input and rendering so that you can focus on just making and sharing beautiful custom visualisations.

## Table of Contents

- [MVMNT](#mvmnt)
    - [Table of Contents](#table-of-contents)
    - [Quick Start](#quick-start)
    - [Local Backend (Supabase)](#local-backend-supabase)
        - [Prerequisites](#prerequisites)
        - [Setup](#setup)
        - [Schema changes](#schema-changes)
        - [Stopping](#stopping)
    - [Making Plugins](#making-plugins)
    - [Development Workflow](#development-workflow)
    - [License](#license)

## Quick Start

```bash
git clone https://github.com/Maokus/MVMNT.git
cd MVMNT
npm install
npm run dev
```

## Local Backend (Supabase)

The community features (uploads, ratings, downloads) require a Supabase backend. For local development you run a full Supabase stack in Docker.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

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

Plugins are TypeScript classes that extend `SceneElement`. They (1) declare their configurable properties and (2) implement a `_buildRenderObjects()` method that draws on the canvas each frame.

The `@mvmnt/plugin-sdk` module provides everything you need: the base class, render primitives, and access to the timeline, audio features, and timing data via a stable host API.

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

## License

MVMNT is released under the GNU Affero General Public License v3.0 (AGPL-3.0). If you modify this software and make it available to users, you must also provide those users access to the complete corresponding source code of your modified version under the same license. See the [`LICENSE`](LICENSE) file for details.
