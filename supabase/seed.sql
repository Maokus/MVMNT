-- Storage buckets required for the community feature
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('community-files', 'community-files', true),
  ('community-thumbnails', 'community-thumbnails', true)
ON CONFLICT (id) DO NOTHING;
