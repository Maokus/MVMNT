-- Downloads are available without signing in. Anonymous records cannot claim a user ID.
CREATE POLICY "Anonymous users can create download records"
  ON public.community_downloads FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- Updating the aggregate must bypass the item's owner-only UPDATE policy.
-- Keep the privileged function outside the schemas exposed by the Data API.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE FUNCTION private.increment_community_download_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_items
  SET downloads_count = downloads_count + 1
  WHERE id = NEW.item_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.increment_community_download_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS increment_download_on_insert ON public.community_downloads;
CREATE TRIGGER increment_download_on_insert
  AFTER INSERT ON public.community_downloads
  FOR EACH ROW EXECUTE FUNCTION private.increment_community_download_count();

DROP FUNCTION public.trg_increment_download_count();

-- Recover recorded downloads missed by the old trigger without discarding older totals.
UPDATE public.community_items AS item
SET downloads_count = GREATEST(item.downloads_count, recorded.total)
FROM (
  SELECT item_id, COUNT(*)::integer AS total
  FROM public.community_downloads
  GROUP BY item_id
) AS recorded
WHERE item.id = recorded.item_id
  AND item.downloads_count < recorded.total;
