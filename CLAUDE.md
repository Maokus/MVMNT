# MVMNT — Claude Code Instructions

## Supabase / Database Workflow

**Always target the local Supabase instance by default.** Do not apply migrations directly to the remote/production database via MCP tools unless explicitly asked.

When making database schema changes:
1. Write the migration SQL to a new file in `supabase/migrations/` using the naming convention `<timestamp>_<description>.sql` (e.g. `20260421120000_add_column.sql`).
2. Show the migration SQL to the user.
3. Do NOT call `apply_migration` or `execute_sql` against the remote project (`nqublmnynkahnlreojrz`) unless the user explicitly says to push to remote/production.

The user will manually apply migrations locally via `supabase db reset` or `supabase migration up`, and push to remote when ready with `supabase db push`.
