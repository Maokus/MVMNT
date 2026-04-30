# Community System Analysis

_Last updated: April 2026 — security fixes applied_

## Overview

The MVMNT community system is a file-sharing platform for templates (`.mvt`) and plugins (`.mvmnt-plugin`). Users can upload, discover, download, rate, and tag visualiser assets. The backend is fully Supabase-hosted (Postgres + Storage + Auth).

---

## How the System Works

### Architecture at a Glance

```
User → CommunityPage
         ├─ CommunityAuthBar     (sign in / sign up)
         ├─ CommunityGrid        (paginated cards)
         │    └─ CommunityCard
         ├─ CommunityDetailModal (view, download, rate, own actions)
         ├─ CommunityUploadModal (upload + metadata extraction)
         ├─ CommunityEditModal   (edit / replace file)
         └─ CommunityTagInput    (shared tag UI)

communityApi.ts ─── Supabase client ─── Postgres + Storage
```

### Data Model

**`profiles`** — one row per auth user, holds the public username.

**`community_items`** — the primary entity. Stores both templates and plugins in one table discriminated by `type`. Metadata columns:

- `plugin_uid`, `version`, `plugin_api_version` — plugin-specific
- `template_schema_version`, `min_app_version` — template-specific
- `downloads_count`, `average_rating`, `ratings_count` — denormalised aggregates

**`community_downloads`** — append-only log of every download event; `user_id` is nullable to allow anonymous tracking.

**`community_ratings`** — one row per (item, user) pair enforced by UNIQUE constraint. Rating range 1–5.

**`community_tags`** + **`community_item_tags`** — many-to-many tag system. Tags are shared global entities; max 5 per item enforced by DB trigger. Tag creation is restricted to trusted/admin users via RLS.

**`community_tag_aliases`** — admin-managed alternate spellings that map to a canonical tag (e.g. `Jazz → jazz`).

**`profiles`** — one row per auth user, holds the public username and `role` (`regular` | `trusted` | `admin`).

### Core Flows

**Upload:**

1. User selects file; the modal extracts metadata from the ZIP (`manifest.json` for plugins, `envelope.json` for templates).
2. Pre-check: plugin UID uniqueness queried before upload for early UX feedback.
3. Files land in `community-thumbnails` and `community-files` Storage buckets at path `{userId}/{itemId}/…`.
4. DB row inserted → tags assigned via junction table.

**Browse & Filter:**

- `fetchItems()` runs a single Postgres query with `ORDER BY`, `LIMIT`/`OFFSET`.
- Tag filter uses a self-join pattern requiring items to match **all** selected tags.
- After the main query, usernames and tags are batch-fetched in parallel to avoid N+1.

**Download:**

1. `community_downloads` row inserted (anonymous or authenticated).
2. `increment_download_count` RPC atomically increments the denormalised counter.
3. Public Storage URL returned and opened by the browser.

**Rating:**

1. `community_ratings` upserted.
2. `refresh_item_rating` RPC recalculates `average_rating` and `ratings_count` from scratch.

**Version Compatibility:**
The detail modal compares three fields against constants compiled into the app:

- `template_schema_version` vs `CURRENT_SCHEMA_VERSION`
- `plugin_api_version` vs `PLUGIN_API_VERSION`
- `min_app_version` vs `package.json` version (using a custom `semverGt`)

### Security Model

| Table                 | Public read | Auth write             | Owner-scoped write    |
| --------------------- | ----------- | ---------------------- | --------------------- |
| community_items       | ✓           | ✓                      | ✓                     |
| community_ratings     | ✓           | ✓                      | ✓                     |
| community_downloads   | —           | insert only            | —                     |
| community_tags        | ✓ (visible) | trusted/admin (create) | admin (update/delete) |
| community_item_tags   | ✓           | subquery-owner check   | ✓                     |
| community_tag_aliases | ✓           | admin only             | —                     |
| profiles              | ✓           | —                      | ✓                     |

**User roles** are stored in `profiles.role` (values: `regular`, `trusted`, `admin`):

- **Regular** — can browse and apply existing tags; cannot create new ones.
- **Trusted** — can create new tags through autocomplete; creation is validated client-side (uniqueness + format) and enforced server-side via RLS. Sees a warning if similar tags already exist.
- **Admin** — all trusted capabilities plus: rename tags, merge tags (via `admin_merge_tags` RPC), hide/deprecate tags, and manage tag aliases via the Tag Management panel on the community page.

Storage buckets are path-scoped: policies enforce that authenticated users can only write/delete under their own `{userId}/` prefix.

---

## Identified Issues

### Security / Correctness

**1. `get_email_by_username` leaks email addresses** ~~Any client can call this RPC with any username and receive the email address tied to it.~~

**Resolved.** The `sign-in-with-username` Supabase Edge Function (`supabase/functions/sign-in-with-username/index.ts`) now handles username-based sign-in entirely server-side. It uses the service-role key to resolve the username → email internally, calls `signInWithPassword`, and returns only the session token — the email is never returned to the browser. `EXECUTE` on `get_email_by_username` has been revoked from `anon` and `authenticated` roles via migration `20260430130000_security_fixes.sql`.

**2. Duplicate INSERT policies on `community-files`** ~~Two Storage INSERT policies exist: `Users can upload to community files` and `community_files_auth_insert`. Both grant authenticated users write access with user-scoped paths.~~

**Resolved.** `community_files_auth_insert` (exact duplicate) has been dropped. Additionally, `Authenticated users can upload files` — a broader policy with no path scoping that could allow cross-user file writes — has also been removed. The single remaining policy, `Users can upload to community files`, correctly enforces `storage.foldername(name)[1] = auth.uid()`. The same fix was applied to `community-thumbnails`: the broad `Authenticated users can upload thumbnails` policy was replaced with a new path-scoped `Users can upload to community thumbnails` policy. See migration `20260430130000_security_fixes.sql`.

**3. `community_item_tags` INSERT policy is labelled PUBLIC** ~~The RLS policy for tag assignment uses a PUBLIC role with an ownership subquery.~~

**Resolved.** Both the INSERT (`Item owner can add tags`) and DELETE (`Item owner can remove tags`) policies on `community_item_tags` now use `TO authenticated` instead of `TO public`. See migration `20260430130000_security_fixes.sql`.

**4. Downloads SELECT policy returns FALSE**
The policy `downloads readable by owner only if needed` has `USING (false)`. This means nobody — not even admins or item owners — can query the downloads log via the client. The aggregate counter is accessible via `community_items`, but raw download data is permanently inaccessible. This is likely intentional for privacy, but it means the data is being written and never read, which is wasteful.

**5. No rate limiting on download count inflation**
Anonymous download records can be inserted freely. A script could call `downloadItem()` in a loop to inflate `downloads_count` for any item. There is no deduplication, cooldown, or IP-based throttling.

**6. Race condition on plugin UID pre-check**
`findPluginUidConflict()` is called before uploading, but it's not atomic with the insert. Two concurrent uploads of the same plugin UID will both pass the pre-check and then race to insert; the DB UNIQUE constraint will correctly reject the second, but the first uploader's file will already be in Storage. The orphaned Storage file is never cleaned up.

### Data Integrity

**7. Rating aggregate computed via RPC, not a trigger**
`refresh_item_rating` is called manually from the client after every upsert. If the client call fails (network error, crash), `average_rating` and `ratings_count` in `community_items` become stale and never self-correct. A `AFTER INSERT OR UPDATE OR DELETE ON community_ratings` trigger would be more reliable.

**8. Download counter not self-healing**
`downloads_count` is incremented via RPC. If `increment_download_count` fails after the download row is inserted, the counter drifts from the actual row count in `community_downloads`. Again, a trigger or a view would be more reliable.

**9. Hard delete removes all history**
Deleting an item deletes its download log and ratings via CASCADE. There is no tombstone or soft-delete, so there's no way to recover analytics or undo a deletion.

**10. Files not cleaned up on failed upload**
If `uploadItem()` succeeds on the Storage side but fails on the DB insert, the thumbnail and file remain in Storage indefinitely with no reference. The reverse is also true (though less likely with Supabase's transactional model).

### User Experience / Product

**11. No full-text search**
Items can only be filtered by type and tags. There is no title or description search, making discovery harder as the catalogue grows.

**12. Tag creation is fully open** ~~Any authenticated user can create any tag. There is no moderation or curation, which will lead to tag pollution, duplicates, and inconsistencies (e.g. `jazz`, `jazz-music`, `Jazz`).~~

**Resolved.** A three-tier role system is now in place (`regular`, `trusted`, `admin`) stored in `profiles.role`:

- Regular users can only use existing tags.
- Trusted users can create new tags through the autocomplete UI (enforced by RLS on `community_tags`); a client-side similarity check warns them when similar tags already exist.
- Admins can rename, merge, hide/deprecate, and manage aliases via the Tag Management panel. The `admin_merge_tags(source, target)` Postgres function atomically reassigns all item associations and deletes the source tag.

Tag aliases (`community_tag_aliases`) let admins define alternate spellings (`Jazz → jazz`) without requiring item owners to change their data.

**13. No content moderation**
There is no flagging, reporting, or admin review mechanism. Any authenticated user can upload any file.

**14. No notification of plugin updates**
When a plugin author pushes a new version (new item or updated file), installed users receive no notification and discover the update only by chance when re-opening the community page.

**15. Custom `semverGt` implementation**
The version comparison function is hand-rolled. It may not handle pre-release suffixes (`1.0.0-beta`), build metadata, or non-integer patch versions correctly.

**16. File path stored as a raw string**
The `thumbnail_path` and `file_path` columns contain full Storage paths. If the bucket name or path structure ever changes, all existing rows require a data migration.

---

## Future-Proofing Recommendations

### Database Schema

**Add soft-delete to `community_items`:**

```sql
ALTER TABLE community_items ADD COLUMN deleted_at TIMESTAMPTZ;
```

Filter all public queries with `WHERE deleted_at IS NULL`. This preserves download history and makes moderation reversible.

**Use trigger-based aggregates instead of RPC-based:**

```sql
CREATE OR REPLACE FUNCTION trg_refresh_item_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE community_items SET
    average_rating = (SELECT COALESCE(AVG(rating), 0) FROM community_ratings WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)),
    ratings_count  = (SELECT COUNT(*) FROM community_ratings WHERE item_id = COALESCE(NEW.item_id, OLD.item_id))
  WHERE id = COALESCE(NEW.item_id, OLD.item_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER refresh_rating_on_change
AFTER INSERT OR UPDATE OR DELETE ON community_ratings
FOR EACH ROW EXECUTE FUNCTION trg_refresh_item_rating();
```

Do the same for `downloads_count`. This removes the client's responsibility to call the RPC and eliminates drift.

**Add a `schema_version` column to migrations themselves:**
As the community feature evolves, a `community_schema_version` table (one row, one integer) makes it easy to gate features on DB readiness without relying on migration file names.

**Separate plugin and template metadata into sub-tables:**
The current design stores all metadata columns on one table regardless of type. Plugin-only and template-only columns are NULL for the other type. As more type-specific fields are added, this will become unwieldy.

```sql
CREATE TABLE community_plugin_meta (
  item_id UUID PRIMARY KEY REFERENCES community_items(id) ON DELETE CASCADE,
  plugin_uid TEXT UNIQUE NOT NULL,
  plugin_api_version TEXT,
  version TEXT
);

CREATE TABLE community_template_meta (
  item_id UUID PRIMARY KEY REFERENCES community_items(id) ON DELETE CASCADE,
  template_schema_version INT,
  min_app_version TEXT
);
```

**Add a `featured` flag and `moderation_status`:**

```sql
ALTER TABLE community_items
  ADD COLUMN featured BOOLEAN DEFAULT FALSE,
  ADD COLUMN moderation_status TEXT DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected'));
```

This opens the door for curated collections and content moderation without a schema change later.

**Add a `views_count` counter:**
Downloads are a lagging signal of discovery. Tracking views separately gives a better picture of reach vs conversion.

### Security Hardening

**Move `get_email_by_username` server-side:**
~~Replace it with a Supabase Edge Function…~~

**Implemented.** `supabase/functions/sign-in-with-username/index.ts` handles this. `get_email_by_username` execute rights revoked from anon/authenticated.

**Add download deduplication:**
Add a partial unique index or a cooldown check to prevent a single anonymous session from inflating counts:

```sql
-- One anonymous download per item per day (rough dedup by created_at truncation)
-- Or: track client fingerprint / session ID in a separate column
```

**Fix the labelling issue on `community_item_tags` INSERT policy:**
~~Change the role from PUBLIC to AUTHENTICATED to match intent.~~

**Implemented.** See migration `20260430130000_security_fixes.sql`.

**Consolidate duplicate Storage policies:**
~~Remove the redundant `community_files_auth_insert` policy…~~

**Implemented.** `community_files_auth_insert` dropped; overly broad `Authenticated users can upload files` (no path scope) also dropped; thumbnail policy replaced with path-scoped equivalent. See migration `20260430130000_security_fixes.sql`.

### Application Layer

**Replace custom `semverGt` with a well-tested library:**
`compare-versions` (tiny, 0 dependencies) handles all SemVer edge cases correctly.

**Store only the relative path in the DB, not bucket-absolute paths:**
Store `{userId}/{itemId}/{filename}` and prepend the bucket URL at query time. This makes storage bucket migrations trivial.

**Add a cleanup job for orphaned Storage files:**
A scheduled Edge Function that lists files in Storage, compares against `community_items` paths, and deletes anything unreferenced. Run nightly.

**Abstract the tag system for future curation:**
~~Add a `community_tag_aliases` table so that `jazz` and `Jazz` can be resolved to a canonical tag at read time, without requiring users to change their entries.~~

**Implemented.** `community_tag_aliases` is live. Admins manage aliases through the Tag Management panel.

---

## Improvement Opportunities

| Area          | Idea                                                                                          | Complexity |
| ------------- | --------------------------------------------------------------------------------------------- | ---------- |
| Discovery     | Full-text search on title + description (use Postgres `tsvector`)                             | Medium     |
| Discovery     | Curated "featured" section on the community page                                              | Low        |
| Social        | Comments / reviews per item                                                                   | Medium     |
| Social        | Follow authors, see their uploads in a feed                                                   | High       |
| Moderation    | Flag/report button → admin review queue                                                       | Medium     |
| Notifications | In-app badge when an installed plugin has an update                                           | High       |
| Analytics     | Per-item download chart visible to item owner                                                 | Medium     |
| Performance   | Materialised view for `fetchItems()` (pre-joined with username + tags)                        | Medium     |
| Performance   | Redis / Supabase Realtime cache for hot items                                                 | High       |
| DX            | Zod schema shared between `communityApi.ts` and DB types (generated via `supabase gen types`) | Low        |
| DX            | E2E test for the upload → download flow using Playwright                                      | Medium     |
