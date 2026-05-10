# Local Backend (Supabase)

The community features (uploads, ratings, downloads) require a Supabase backend. For local development you run a full Supabase stack in Docker.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

    ```bash
    # macOS
    brew install supabase/tap/supabase
    # or via npm
    npm install -g supabase
    ```

## Setup

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

## Schema changes

New migrations go in `supabase/migrations/`. Create one with:

```bash
supabase migration new <descriptive_name>
```

Edit the generated file, then apply it:

```bash
supabase db reset
```

## Stopping

```bash
supabase stop        # stops containers, data is preserved
supabase db reset    # wipe and replay from migrations + seed
```
