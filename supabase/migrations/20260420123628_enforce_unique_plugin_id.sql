-- Enforce globally unique plugin_uid across all community_items.
-- NULL values are intentionally permitted (templates have no plugin_uid),
-- and Postgres unique constraint semantics treat each NULL as distinct,
-- so multiple template rows with plugin_uid = NULL are still allowed.
ALTER TABLE community_items
  ADD CONSTRAINT community_items_plugin_uid_key UNIQUE (plugin_uid);
