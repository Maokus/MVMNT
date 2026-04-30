import React, { useCallback, useState, useRef } from 'react';
import { FaXmark, FaFloppyDisk } from 'react-icons/fa6';
import type { User } from '@supabase/supabase-js';
import type { CommunityItem } from './communityApi';
import { updateItem, parsePluginManifest, getThumbnailUrl, setItemTags, findPluginUidConflict } from './communityApi';
import CommunityTagInput from './CommunityTagInput';

interface CommunityEditModalProps {
  item: CommunityItem;
  user: User;
  canCreateTags?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const CommunityEditModal: React.FC<CommunityEditModalProps> = ({ item, user, canCreateTags = false, onClose, onSaved }) => {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [version, setVersion] = useState(item.version ?? '');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [detectedUid, setDetectedUid] = useState<string | null>(item.plugin_uid);
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(item.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pluginUidConflict, setPluginUidConflict] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleThumbnailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onload = () => setThumbnailPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setMainFile(file);
    setDetectedUid(item.plugin_uid);
    setDetectedVersion(null);
    setPluginUidConflict(false);

    if (file && item.type === 'plugin') {
      const parsed = await parsePluginManifest(file);
      if (parsed) {
        setDetectedUid(parsed.id);
        setDetectedVersion(parsed.version);
        setVersion(parsed.version);
        // Only warn about conflict if the new UID differs from the current one.
        if (parsed.id !== item.plugin_uid) {
          const conflictId = await findPluginUidConflict(parsed.id, item.id);
          setPluginUidConflict(conflictId !== null);
        }
      }
    }
  }, [item.plugin_uid, item.type, item.id]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateItem(item.id, user.id, {
        title,
        description,
        thumbnailFile: thumbnailFile ?? undefined,
        mainFile: mainFile ?? undefined,
        pluginUid: detectedUid ?? undefined,
        version: item.type === 'plugin' && version.trim() ? version.trim() : undefined,
      });
      await setItemTags(item.id, tags);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [item.id, item.type, user.id, title, description, version, thumbnailFile, mainFile, detectedUid, tags, onSaved, onClose]);

  const inputClass = "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-[440px] max-w-[90vw] max-h-[85vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/95 p-5 text-sm text-neutral-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Edit item</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-neutral-400 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <FaXmark />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
            className={inputClass}
          />

          {/* Description */}
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            className={inputClass + ' resize-none'}
          />

          {/* Version (plugins only) */}
          {item.type === 'plugin' && (
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Version</label>
              <input
                type="text"
                placeholder="e.g. 1.2.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className={inputClass}
              />
              {detectedVersion && (
                <p className="mt-1 text-xs text-neutral-500">Detected from manifest: {detectedVersion}</p>
              )}
            </div>
          )}

          {/* Thumbnail */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Thumbnail (leave blank to keep current)</label>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/*"
              onChange={handleThumbnailChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => thumbInputRef.current?.click()}
              className="rounded border border-dashed border-neutral-600 bg-neutral-800/50 px-3 py-2 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 w-full text-left"
            >
              {thumbnailFile ? thumbnailFile.name : 'Replace thumbnail...'}
            </button>
            {thumbnailPreview ? (
              <img src={thumbnailPreview} alt="New thumbnail" className="mt-2 max-h-32 rounded border border-neutral-700 object-contain" />
            ) : (
              <img src={getThumbnailUrl(item.thumbnail_path)} alt="Current thumbnail" className="mt-2 max-h-32 rounded border border-neutral-700 object-contain opacity-50" />
            )}
          </div>

          {/* File */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1">
              {item.type === 'plugin' ? 'Plugin file (leave blank to keep current)' : 'Template file (leave blank to keep current)'}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={item.type === 'plugin' ? '.mvmnt-plugin' : '.mvt'}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded border border-dashed border-neutral-600 bg-neutral-800/50 px-3 py-2 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 w-full text-left"
            >
              {mainFile
                ? `${mainFile.name} (${(mainFile.size / 1024 / 1024).toFixed(1)} MB)`
                : 'Replace file...'}
            </button>
            {item.type === 'plugin' && detectedUid && (
              <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-neutral-300">{detectedUid}</span>
              </div>
            )}
            {pluginUidConflict && detectedUid && (
              <p className="mt-1 text-xs text-red-400">
                A plugin with ID <span className="font-mono">{detectedUid}</span> already exists in the community. Plugin IDs must be globally unique.
              </p>
            )}
          </div>

          {/* Tags */}
          <CommunityTagInput tags={tags} onChange={setTags} canCreateTags={canCreateTags} />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-transparent px-3 py-1.5 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || pluginUidConflict}
              className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              <FaFloppyDisk className="text-[11px]" /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CommunityEditModal;
