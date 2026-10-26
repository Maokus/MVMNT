# Local community backend

Community uploads, ratings, and downloads use Supabase. Local development runs the stack in Docker.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

## Setup

Start the services and inspect their local credentials:

```bash
supabase start
supabase status
```

Create the local Vite environment file:

```bash
cp .env.local.example .env.local
```

Set the values reported by `supabase status`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<local publishable key>
```

Apply all migrations and seed data, then start MVMNT:

```bash
supabase db reset
npm run dev
```

## Schema changes

Create migrations under `supabase/migrations/` and verify them from a clean local database:

```bash
supabase migration new <descriptive_name>
supabase db reset
```

Verify download counting and access policies against the migrated local database:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/community-download-count.sql
```

The test runs in a transaction and rolls back its fixtures. It checks signed-out and
signed-in downloads, prevents user impersonation, and checks that downloaders cannot
read other authors' download records or directly change their totals.

Deploy pending migrations with the normal backend release before releasing client
changes that depend on them. The download-count repair restores totals from existing
download records while preserving higher historical totals. Downloads that failed to
create a record cannot be recovered.

Stop the local containers without deleting their data:

```bash
supabase stop
```
