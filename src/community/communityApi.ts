import { unzipSync } from 'fflate';
import { supabase } from '../lib/supabase';

export interface CommunityTag {
  id: string;
  name: string;
}

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
  updated_at: string;
  plugin_uid: string | null;
  version: string | null;
  uploader_username: string | null;
  tags: string[];
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

export async function fetchItems(sortBy: SortBy, filterType: FilterType, page: number, filterTags?: string[]) {
  // If filtering by tags, first get matching item IDs
  let tagFilterIds: string[] | null = null;
  if (filterTags && filterTags.length > 0) {
    const { data: tagRows, error: tagErr } = await supabase
      .from('community_item_tags')
      .select('item_id, community_tags!inner(name)')
      .in('community_tags.name', filterTags);
    if (tagErr) throw tagErr;

    // Items must match ALL selected tags
    const itemTagCounts: Record<string, number> = {};
    for (const row of tagRows ?? []) {
      itemTagCounts[row.item_id] = (itemTagCounts[row.item_id] ?? 0) + 1;
    }
    tagFilterIds = Object.entries(itemTagCounts)
      .filter(([, count]) => count >= filterTags.length)
      .map(([id]) => id);

    if (tagFilterIds.length === 0) return [];
  }

  let query = supabase
    .from('community_items')
    .select('*');

  if (filterType !== 'all') {
    query = query.eq('type', filterType);
  }

  if (tagFilterIds) {
    query = query.in('id', tagFilterIds);
  }

  for (const { column, ascending } of SORT_MAP[sortBy]) {
    query = query.order(column, { ascending });
  }

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error } = await query;
  if (error) throw error;

  const items = (data ?? []) as Omit<CommunityItem, 'uploader_username' | 'tags'>[];
  const itemIds = items.map((i) => i.id);

  // Batch fetch usernames and tags in parallel
  const userIds = [...new Set(items.map((i) => i.user_id))];

  const [usernameMap, tagsMap] = await Promise.all([
    (async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);
      return Object.fromEntries((profiles ?? []).map((p) => [p.id, p.username]));
    })(),
    fetchItemTagsBatch(itemIds),
  ]);

  return items.map((item) => ({
    ...item,
    uploader_username: usernameMap[item.user_id] ?? null,
    tags: tagsMap[item.id] ?? [],
  })) as CommunityItem[];
}

function sanitizeFileName(name: string): string {
  const lastDotIndex = name.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
  }
  const baseName = name.substring(0, lastDotIndex);
  const ext = name.substring(lastDotIndex);
  return baseName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '') + ext;
}

/** Parse a .mvmnt-plugin ZIP and extract manifest id + version. Returns null on failure. */
export async function parsePluginManifest(file: File): Promise<{ id: string; version: string } | null> {
  try {
    const buffer = await file.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));
    const manifestBytes = unzipped['manifest.json'];
    if (!manifestBytes) return null;
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
    if (typeof manifest.id === 'string' && typeof manifest.version === 'string') {
      return { id: manifest.id, version: manifest.version };
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns the existing item's ID if the plugin_uid is already taken, otherwise null. */
export async function findPluginUidConflict(pluginUid: string, excludeItemId?: string): Promise<string | null> {
  let query = supabase
    .from('community_items')
    .select('id')
    .eq('plugin_uid', pluginUid);
  if (excludeItemId) {
    query = query.neq('id', excludeItemId);
  }
  const { data } = await query.maybeSingle();
  return data?.id ?? null;
}

function throwFriendlyPluginUidError(pluginUid: string): never {
  throw new Error(`A plugin with ID "${pluginUid}" already exists in the community. Plugin IDs must be globally unique.`);
}

function translateInsertError(err: any, pluginUid?: string): never {
  if (err?.code === '23505' && pluginUid) throwFriendlyPluginUidError(pluginUid);
  throw err;
}

export async function uploadItem(
  userId: string,
  type: 'template' | 'plugin',
  title: string,
  description: string,
  thumbnailFile: File,
  mainFile: File,
  pluginUid?: string,
  pluginVersion?: string,
) {
  // Enforce global uniqueness of plugin IDs across all users (pre-check for fast UX feedback).
  // The DB UNIQUE constraint is the authoritative enforcer for concurrent uploads.
  if (pluginUid) {
    const conflictId = await findPluginUidConflict(pluginUid);
    if (conflictId) throwFriendlyPluginUidError(pluginUid);
  }

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
    plugin_uid: pluginUid ?? null,
    version: pluginVersion ?? null,
  });
  if (insertErr) translateInsertError(insertErr, pluginUid);

  return itemId;
}

export interface UpdateItemPayload {
  title?: string;
  description?: string;
  thumbnailFile?: File;
  mainFile?: File;
  pluginUid?: string;
  version?: string;
}

export async function updateItem(itemId: string, userId: string, payload: UpdateItemPayload) {
  // Fetch current paths for potential replacement
  const { data: current, error: fetchErr } = await supabase
    .from('community_items')
    .select('thumbnail_path, file_path, plugin_uid')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();
  if (fetchErr) throw fetchErr;

  // Pre-check plugin_uid uniqueness before touching storage, to avoid orphaned uploads.
  if (payload.pluginUid && payload.pluginUid !== current.plugin_uid) {
    const conflictId = await findPluginUidConflict(payload.pluginUid, itemId);
    if (conflictId) throwFriendlyPluginUidError(payload.pluginUid);
  }

  const updates: Record<string, unknown> = {};

  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description || null;
  if (payload.pluginUid !== undefined) updates.plugin_uid = payload.pluginUid;
  if (payload.version !== undefined) updates.version = payload.version;

  if (payload.thumbnailFile) {
    // Remove old thumbnail and upload new one
    await supabase.storage.from('community-thumbnails').remove([current.thumbnail_path]);
    const newThumbPath = current.thumbnail_path.substring(0, current.thumbnail_path.lastIndexOf('/') + 1)
      + 'thumb-' + sanitizeFileName(payload.thumbnailFile.name);
    const { error: thumbErr } = await supabase.storage
      .from('community-thumbnails')
      .upload(newThumbPath, payload.thumbnailFile, { upsert: true });
    if (thumbErr) throw thumbErr;
    updates.thumbnail_path = newThumbPath;
  }

  if (payload.mainFile) {
    // Remove old file and upload new one
    await supabase.storage.from('community-files').remove([current.file_path]);
    const newFilePath = current.file_path.substring(0, current.file_path.lastIndexOf('/') + 1)
      + sanitizeFileName(payload.mainFile.name);
    const { error: fileErr } = await supabase.storage
      .from('community-files')
      .upload(newFilePath, payload.mainFile, { upsert: true });
    if (fileErr) throw fileErr;
    updates.file_path = newFilePath;
    updates.file_size_bytes = payload.mainFile.size;
  }

  const { error: updateErr } = await supabase
    .from('community_items')
    .update(updates)
    .eq('id', itemId)
    .eq('user_id', userId);
  if (updateErr) translateInsertError(updateErr, payload.pluginUid);
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

/** Compare two semver strings. Returns true if a > b. */
export function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^[^0-9]*/, '').split('.').map(Number);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return (aPatch ?? 0) > (bPatch ?? 0);
}

// ─── Tags ──────────────────────────────────────────────

/** Fetch all existing tags (for autocomplete). */
export async function fetchAllTags(): Promise<CommunityTag[]> {
  const { data, error } = await supabase
    .from('community_tags')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return (data ?? []) as CommunityTag[];
}

/** Batch-fetch tags for a list of item IDs. Returns map of itemId → tag names. */
async function fetchItemTagsBatch(itemIds: string[]): Promise<Record<string, string[]>> {
  if (itemIds.length === 0) return {};
  const { data, error } = await supabase
    .from('community_item_tags')
    .select('item_id, community_tags(name)')
    .in('item_id', itemIds);
  if (error) throw error;

  const result: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const tag = row.community_tags as unknown as { name: string } | null;
    if (tag) {
      (result[row.item_id] ??= []).push(tag.name);
    }
  }
  return result;
}

/** Get or create a tag by name. Returns the tag ID. */
async function getOrCreateTag(name: string): Promise<string> {
  const normalized = name.toLowerCase().trim();
  // Try to find existing
  const { data: existing } = await supabase
    .from('community_tags')
    .select('id')
    .eq('name', normalized)
    .maybeSingle();
  if (existing) return existing.id;

  // Create new
  const { data: created, error } = await supabase
    .from('community_tags')
    .insert({ name: normalized })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

/** Set tags for an item (replaces all existing tags). */
export async function setItemTags(itemId: string, tagNames: string[]) {
  // Remove all existing tags for this item
  await supabase.from('community_item_tags').delete().eq('item_id', itemId);

  if (tagNames.length === 0) return;

  // Get or create each tag, then insert junction rows
  const tagIds = await Promise.all(tagNames.map(getOrCreateTag));
  const rows = tagIds.map((tagId) => ({ item_id: itemId, tag_id: tagId }));
  const { error } = await supabase.from('community_item_tags').insert(rows);
  if (error) throw error;
}
