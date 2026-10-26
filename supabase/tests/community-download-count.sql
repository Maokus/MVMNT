-- Run with psql -v ON_ERROR_STOP=1 against a migrated local backend.
BEGIN;
INSERT INTO auth.users (id, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000001', '{"username":"download-test-author"}'),
  ('a0000000-0000-0000-0000-000000000002', '{"username":"download-test-reader"}');
INSERT INTO public.community_items (id, user_id, type, title, thumbnail_path, file_path, file_size_bytes)
VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'plugin', 'Download regression test', 'test/thumb', 'test/plugin', 1);

SET LOCAL ROLE anon;
INSERT INTO public.community_downloads (item_id, user_id)
VALUES ('b0000000-0000-0000-0000-000000000001', NULL);
DO $$ BEGIN
  IF (SELECT downloads_count FROM public.community_items WHERE id = 'b0000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Anonymous download did not increment the count';
  END IF;
  BEGIN
    INSERT INTO public.community_downloads (item_id, user_id)
    VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Anonymous downloader could impersonate a user';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
INSERT INTO public.community_downloads (item_id, user_id)
VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
INSERT INTO public.community_downloads (item_id, user_id)
VALUES ('b0000000-0000-0000-0000-000000000001', NULL);
DO $$ BEGIN
  IF (SELECT downloads_count FROM public.community_items WHERE id = 'b0000000-0000-0000-0000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'Non-owner downloads did not each increment the count';
  END IF;
  BEGIN
    INSERT INTO public.community_downloads (item_id, user_id)
    VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Authenticated downloader could impersonate another user';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.community_downloads WHERE item_id = 'b0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Non-owner can read download records';
  END IF;
END $$;
UPDATE public.community_items SET downloads_count = 999
WHERE id = 'b0000000-0000-0000-0000-000000000001';
RESET ROLE;
DO $$ BEGIN
  IF (SELECT downloads_count FROM public.community_items WHERE id = 'b0000000-0000-0000-0000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'Non-owner can directly change download counts';
  END IF;
  IF has_function_privilege('anon', 'private.increment_community_download_count()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.increment_community_download_count()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Privileged trigger function is directly executable by clients';
  END IF;
END $$;
ROLLBACK;
