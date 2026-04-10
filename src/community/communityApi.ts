import { supabase } from '../lib/supabase';

export interface CommunityItem {
  id: string;
  user_id: string;
  type: 'template' | 'plugin';
  title: string;
  description: string | null;
  thumbnail_path: string;
  file_path: string;
  file_size_bytes: number;
  downloads_count: number;
  average_rating: number;
  ratings_count: number;
  created_at: string;
}

export type SortBy = 'newest' | 'top_rated' | 'most_downloaded';
export type FilterType = 'all' | 'template' | 'plugin';

const PAGE_SIZE = 24;

const SORT_MAP: Record<SortBy, { column: string; ascending: boolean }[]> = {
  newest: [{ column: 'created_at', ascending: false }],
  top_rated: [
    { column: 'average_rating', ascending: false },
    { column: 'ratings_count', ascending: false },
  ],
  most_downloaded: [{ column: 'downloads_count', ascending: false }],
};

export async function fetchItems(sortBy: SortBy, filterType: FilterType, page: number) {
  let query = supabase
    .from('community_items')
    .select('*');

  if (filterType !== 'all') {
    query = query.eq('type', filterType);
  }

  for (const { column, ascending } of SORT_MAP[sortBy]) {
    query = query.order(column, { ascending });
  }

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CommunityItem[];
}

function sanitizeFileName(name: string): string {
  // Keep extension intact, only sanitize the base name
  const lastDotIndex = name.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // No extension
    return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
  }
  const baseName = name.substring(0, lastDotIndex);
  const ext = name.substring(lastDotIndex);
  return baseName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '') + ext;
}

export async function uploadItem(
  userId: string,
  type: 'template' | 'plugin',
  title: string,
  description: string,
  thumbnailFile: File,
  mainFile: File,
) {
  const itemId = crypto.randomUUID();
  const thumbPath = `${userId}/${itemId}/thumb-${sanitizeFileName(thumbnailFile.name)}`;
  const filePath = `${userId}/${itemId}/${sanitizeFileName(mainFile.name)}`;

  const { error: thumbErr } = await supabase.storage
    .from('community-thumbnails')
    .upload(thumbPath, thumbnailFile, { upsert: false });
  if (thumbErr) throw thumbErr;

  const { error: fileErr } = await supabase.storage
    .from('community-files')
    .upload(filePath, mainFile, { upsert: false });
  if (fileErr) throw fileErr;

  const { error: insertErr } = await supabase.from('community_items').insert({
    id: itemId,
    user_id: userId,
    type,
    title,
    description: description || null,
    thumbnail_path: thumbPath,
    file_path: filePath,
    file_size_bytes: mainFile.size,
  });
  if (insertErr) throw insertErr;

  return itemId;
}

export async function downloadItem(item: CommunityItem, userId: string | null) {
  await supabase.from('community_downloads').insert({
    item_id: item.id,
    user_id: userId,
  });

  await supabase.rpc('increment_download_count', { item_id_input: item.id });

  const { data } = supabase.storage.from('community-files').getPublicUrl(item.file_path);
  return data.publicUrl;
}

export async function rateItem(itemId: string, userId: string, rating: number) {
  const { error: upsertErr } = await supabase
    .from('community_ratings')
    .upsert(
      { item_id: itemId, user_id: userId, rating },
      { onConflict: 'item_id,user_id' },
    );
  if (upsertErr) throw upsertErr;

  const { error: rpcErr } = await supabase.rpc('refresh_item_rating', { item_id_input: itemId });
  if (rpcErr) throw rpcErr;
}

export async function getUserRating(itemId: string, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('community_ratings')
    .select('rating')
    .eq('item_id', itemId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.rating ?? null;
}

export async function deleteItem(itemId: string, userId: string) {
  // Remove storage files first
  const { data: item } = await supabase
    .from('community_items')
    .select('thumbnail_path, file_path')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (item) {
    await supabase.storage.from('community-thumbnails').remove([item.thumbnail_path]);
    await supabase.storage.from('community-files').remove([item.file_path]);
  }

  const { error } = await supabase
    .from('community_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
}

export function getThumbnailUrl(path: string): string {
  const { data } = supabase.storage.from('community-thumbnails').getPublicUrl(path);
  return data.publicUrl;
}
