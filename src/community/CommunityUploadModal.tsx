import React, { useCallback, useState, useRef } from 'react';
import { FaXmark, FaUpload } from 'react-icons/fa6';
import type { User } from '@supabase/supabase-js';
import { uploadItem } from './communityApi';

interface CommunityUploadModalProps {
  user: User;
  onClose: () => void;
  onUploaded: () => void;
}

const ACCEPTED_FILE_TYPES = '.mvt,.mvmnt-plugin';

const CommunityUploadModal: React.FC<CommunityUploadModalProps> = ({ user, onClose, onUploaded }) => {
  const [type, setType] = useState<'template' | 'plugin'>('template');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setMainFile(file);

    // Auto-detect type from file extension
    if (file) {
      if (file.name.endsWith('.mvmnt-plugin')) {
        setType('plugin');
      } else if (file.name.endsWith('.mvt')) {
        setType('template');
      }
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thumbnailFile || !mainFile) return;

    setError(null);
    setUploading(true);

    try {
      await uploadItem(user.id, type, title, description, thumbnailFile, mainFile);
      onUploaded();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [user.id, type, title, description, thumbnailFile, mainFile, onUploaded, onClose]);

  const inputClass = "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-[440px] max-w-[90vw] max-h-[85vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/95 p-5 text-sm text-neutral-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Upload to Community</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-neutral-400 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <FaXmark />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="flex gap-4">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="type"
                checked={type === 'template'}
                onChange={() => setType('template')}
                className="accent-indigo-500"
              />
              <span className="text-sm">Template</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="type"
                checked={type === 'plugin'}
                onChange={() => setType('plugin')}
                className="accent-indigo-500"
              />
              <span className="text-sm">Plugin</span>
            </label>
          </div>

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

          {/* Thumbnail */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Thumbnail image</label>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/*"
              onChange={handleThumbnailChange}
              required
              className="hidden"
            />
            <button
              type="button"
              onClick={() => thumbInputRef.current?.click()}
              className="rounded border border-dashed border-neutral-600 bg-neutral-800/50 px-3 py-2 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 w-full text-left"
            >
              {thumbnailFile ? thumbnailFile.name : 'Choose image...'}
            </button>
            {thumbnailPreview && (
              <img src={thumbnailPreview} alt="Preview" className="mt-2 max-h-32 rounded border border-neutral-700 object-contain" />
            )}
          </div>

          {/* File */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1">File (.mvt or .mvmnt-plugin)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileChange}
              required
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded border border-dashed border-neutral-600 bg-neutral-800/50 px-3 py-2 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-300 w-full text-left"
            >
              {mainFile ? `${mainFile.name} (${(mainFile.size / 1024 / 1024).toFixed(1)} MB)` : 'Choose file...'}
            </button>
          </div>

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
              disabled={uploading || !thumbnailFile || !mainFile || !title.trim()}
              className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              <FaUpload className="text-[11px]" /> {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CommunityUploadModal;
