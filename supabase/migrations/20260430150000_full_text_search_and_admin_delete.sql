-- Community system improvements
--
-- Addresses:
--   #11  No full-text search — add tsvector column + GIN index on title+description
--   #13  No content moderation — allow admin users to delete any item and its storage files

-- ─── Issue #11: Full-text search ──────────────────────────────────────────────

-- Generated stored column: auto-updates when title or description changes.
-- Title weighted 'A' (higher), description weighted 'B'.
ALTER TABLE public.community_items
  ADD COLUMN IF NOT EXISTS title_desc_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS community_items_tsv_idx
  ON public.community_items USING GIN (title_desc_tsv);

-- ─── Issue #13: Admin delete ───────────────────────────────────────────────────

-- Allow admins to delete any community item (not just their own).
CREATE POLICY "Admins can delete any item"
  ON public.community_items AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Allow admins to delete storage objects in community-thumbnails (any path).
CREATE POLICY "Admins can delete any thumbnail"
  ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Allow admins to delete storage objects in community-files (any path).
CREATE POLICY "Admins can delete any file"
  ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
