-- Aggregate trigger fixes and security hardening
--
-- Addresses:
--   #4  Downloads SELECT policy USING (false) — replace with item-owner access
--   #5  increment_download_count callable by anon/authenticated directly — revoke (now handled by trigger)
--   #7  Rating aggregate maintained by client RPC call — replace with DB trigger
--   #8  Download count maintained by client RPC call — replace with DB trigger

-- ── Issue #4: Replace the dead SELECT policy on community_downloads ──────────
-- Old policy was USING (false), making download records permanently unreadable.
-- New policy exposes them to the item owner only (enables future analytics).

DROP POLICY IF EXISTS "downloads readable by owner only if needed" ON public.community_downloads;

CREATE POLICY "Item owner can read their download records"
  ON public.community_downloads AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_items
      WHERE community_items.id       = community_downloads.item_id
        AND community_items.user_id  = auth.uid()
    )
  );

-- ── Issues #7 & #8: Replace RPC-driven aggregates with DB triggers ────────────

-- Trigger function: recalculate average_rating + ratings_count for one item.
CREATE OR REPLACE FUNCTION public.trg_refresh_item_rating()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.community_items
  SET
    average_rating = (
      SELECT COALESCE(AVG(rating), 0)
      FROM public.community_ratings
      WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
    ),
    ratings_count = (
      SELECT COUNT(*)
      FROM public.community_ratings
      WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
    )
  WHERE id = COALESCE(NEW.item_id, OLD.item_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER refresh_rating_on_change
  AFTER INSERT OR UPDATE OR DELETE ON public.community_ratings
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_item_rating();

-- Trigger function: atomically increment downloads_count when a record is inserted.
CREATE OR REPLACE FUNCTION public.trg_increment_download_count()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.community_items
  SET downloads_count = downloads_count + 1
  WHERE id = NEW.item_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER increment_download_on_insert
  AFTER INSERT ON public.community_downloads
  FOR EACH ROW EXECUTE FUNCTION public.trg_increment_download_count();

-- ── Issue #5: Revoke direct RPC access now that triggers own the aggregates ───
-- Clients can no longer call these functions directly to artificially inflate counts.
-- The functions are kept in place (service_role can still call them if needed).

REVOKE EXECUTE ON FUNCTION public.increment_download_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_download_count(uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_item_rating(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_item_rating(uuid) FROM authenticated;
