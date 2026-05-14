-- Tag permission system: user roles, tag visibility, aliases, and admin operations

-- 1. Add role column to profiles
ALTER TABLE public.profiles
  ADD COLUMN role TEXT NOT NULL DEFAULT 'regular'
  CHECK (role IN ('regular', 'trusted', 'admin'));

-- 2. Add is_hidden flag to community_tags
ALTER TABLE public.community_tags
  ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT false;

-- 3. Tag aliases table (admin-managed; maps alternate spellings to a canonical tag)
CREATE TABLE public.community_tag_aliases (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  alias_name      TEXT        NOT NULL,
  canonical_tag_id UUID       NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT community_tag_aliases_pkey            PRIMARY KEY (id),
  CONSTRAINT community_tag_aliases_alias_name_key  UNIQUE      (alias_name),
  CONSTRAINT community_tag_aliases_canonical_fkey  FOREIGN KEY (canonical_tag_id)
    REFERENCES public.community_tags(id) ON DELETE CASCADE,
  CONSTRAINT community_tag_aliases_name_check
    CHECK (alias_name ~ '^[a-z0-9][a-z0-9\-]{0,29}$')
);

ALTER TABLE public.community_tag_aliases ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_community_tag_aliases_canonical
  ON public.community_tag_aliases USING btree (canonical_tag_id);

-- 4. Helper: returns the calling user's role (stable, SECURITY DEFINER so it can read profiles)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'regular'
  );
$$;

-- 5. Replace the open tag-creation policy with a role-gated one
DROP POLICY IF EXISTS "Authenticated users can create tags" ON public.community_tags;

CREATE POLICY "Trusted and admin users can create tags"
  ON public.community_tags AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    auth.role() = 'authenticated'
    AND public.auth_user_role() IN ('trusted', 'admin')
  );

-- Admins can rename / hide tags
CREATE POLICY "Admins can update tags"
  ON public.community_tags AS PERMISSIVE FOR UPDATE TO public
  USING  (auth.role() = 'authenticated' AND public.auth_user_role() = 'admin')
  WITH CHECK (auth.role() = 'authenticated' AND public.auth_user_role() = 'admin');

-- Admins can delete tags (also used internally by admin_merge_tags)
CREATE POLICY "Admins can delete tags"
  ON public.community_tags AS PERMISSIVE FOR DELETE TO public
  USING (auth.role() = 'authenticated' AND public.auth_user_role() = 'admin');

-- 6. Tag aliases RLS
CREATE POLICY "Tag aliases are publicly readable"
  ON public.community_tag_aliases AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage tag aliases"
  ON public.community_tag_aliases AS PERMISSIVE FOR ALL TO public
  USING  (auth.role() = 'authenticated' AND public.auth_user_role() = 'admin')
  WITH CHECK (auth.role() = 'authenticated' AND public.auth_user_role() = 'admin');

-- 7. Grant table privileges for community_tag_aliases
GRANT SELECT                        ON TABLE public.community_tag_aliases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_tag_aliases TO authenticated;
GRANT ALL                           ON TABLE public.community_tag_aliases TO service_role;

-- 8. Atomic tag merge (SECURITY DEFINER; enforces admin check internally)
CREATE OR REPLACE FUNCTION public.admin_merge_tags(
  source_tag_id UUID,
  target_tag_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF public.auth_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: admin role required';
  END IF;

  IF source_tag_id = target_tag_id THEN
    RAISE EXCEPTION 'Source and target tags must be different';
  END IF;

  -- Move item associations that don't already have the target tag
  INSERT INTO community_item_tags (item_id, tag_id)
  SELECT item_id, target_tag_id
  FROM   community_item_tags
  WHERE  tag_id = source_tag_id
    AND  NOT EXISTS (
           SELECT 1 FROM community_item_tags cit2
           WHERE  cit2.item_id = community_item_tags.item_id
             AND  cit2.tag_id  = target_tag_id
         )
  ON CONFLICT DO NOTHING;

  -- Drop all remaining source-tag associations
  DELETE FROM community_item_tags WHERE tag_id = source_tag_id;

  -- Delete the source tag (also cascades any aliases pointing at it)
  DELETE FROM community_tags WHERE id = source_tag_id;
END;
$$;
