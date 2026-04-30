-- Security fixes for the community system
--
-- Addresses:
--   #1  get_email_by_username leaks emails — revoke public access (now handled by Edge Function)
--   #2  Duplicate Storage INSERT policy on community-files — drop redundant one
--   #2b Overly broad Storage INSERT policies with no path scoping — replace with scoped policies
--   #3  community_item_tags INSERT/DELETE policies labelled PUBLIC — change to AUTHENTICATED

-- 1. Revoke email-enumeration RPC from all client-facing roles.
--    The sign-in-with-username Edge Function resolves usernames server-side instead.
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM authenticated;

-- 2. Remove duplicate path-scoped INSERT policy on community-files.
DROP POLICY IF EXISTS "community_files_auth_insert" ON storage.objects;

-- 3. Remove overly broad INSERT policies that have no path scoping.
--    The path-scoped "Users can upload to community files" policy already grants the correct access.
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;

-- 4. Replace the broad thumbnail upload policy with a path-scoped equivalent.
DROP POLICY IF EXISTS "Authenticated users can upload thumbnails" ON storage.objects;

CREATE POLICY "Users can upload to community thumbnails"
  ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-thumbnails'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 5. Fix community_item_tags INSERT policy: PUBLIC → AUTHENTICATED.
DROP POLICY IF EXISTS "Item owner can add tags" ON public.community_item_tags;

CREATE POLICY "Item owner can add tags"
  ON public.community_item_tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_items
      WHERE community_items.id  = community_item_tags.item_id
        AND community_items.user_id = auth.uid()
    )
  );

-- 6. Fix community_item_tags DELETE policy: PUBLIC → AUTHENTICATED.
DROP POLICY IF EXISTS "Item owner can remove tags" ON public.community_item_tags;

CREATE POLICY "Item owner can remove tags"
  ON public.community_item_tags AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_items
      WHERE community_items.id  = community_item_tags.item_id
        AND community_items.user_id = auth.uid()
    )
  );
