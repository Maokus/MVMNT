import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaDownload, FaStar, FaTrash, FaXmark, FaArrowRight, FaBolt, FaPen, FaArrowsRotate } from 'react-icons/fa6';
import type { User } from '@supabase/supabase-js';
import type { CommunityItem } from './communityApi';
import { getThumbnailUrl, downloadItem, rateItem, getUserRating, deleteItem, semverGt } from './communityApi';
import { loadPlugin, upgradePlugin, unloadPlugin } from '@core/scene/plugins';
import { writeStoredImportPayload } from '../utils/importPayloadStorage';
import { usePluginStore } from '../state/pluginStore';

interface CommunityDetailModalProps {
  item: CommunityItem;
  user: User | null;
  onClose: () => void;
  onItemChanged: () => void;
  onEdit?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const CommunityDetailModal: React.FC<CommunityDetailModalProps> = ({
  item, user, onClose, onItemChanged, onEdit,
}) => {
  const navigate = useNavigate();
  const plugins = usePluginStore((s) => s.plugins);

  const installedPlugin = item.plugin_uid ? plugins[item.plugin_uid] : null;
  const isInstalled = !!installedPlugin;
  const hasUpdate = isInstalled && item.version != null
    && semverGt(item.version, installedPlugin!.manifest.version);

  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstallWarning, setShowInstallWarning] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (user) {
      getUserRating(item.id, user.id).then(setUserRating).catch(() => { });
    }
  }, [item.id, user]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      const url = await downloadItem(item, user?.id ?? null);
      window.open(url, '_blank');
      onItemChanged();
    } catch (err: any) {
      setError(err.message ?? 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [item, user, onItemChanged]);

  const handleOpenInWorkspace = useCallback(async () => {
    setActioning(true);
    setError(null);
    try {
      const url = await downloadItem(item, user?.id ?? null);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      writeStoredImportPayload(buffer);
      onItemChanged();
      navigate('/workspace', { state: { importScene: true } });
    } catch (err: any) {
      setError(err.message ?? 'Failed to open in workspace');
    } finally {
      setActioning(false);
    }
  }, [item, user, onItemChanged, navigate]);

  const handleInstall = useCallback(async () => {
    setActioning(true);
    setError(null);
    try {
      const url = await downloadItem(item, user?.id ?? null);
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const result = await loadPlugin(buffer);
      if (!result.success) throw new Error(result.error ?? 'Installation failed');
      onItemChanged();
    } catch (err: any) {
      setError(err.message ?? 'Installation failed');
    } finally {
      setActioning(false);
    }
  }, [item, user, onItemChanged]);

  const handleUpdate = useCallback(async () => {
    setActioning(true);
    setError(null);
    try {
      const url = await downloadItem(item, user?.id ?? null);
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const result = await upgradePlugin(buffer);
      if (!result.success) throw new Error(result.error ?? 'Update failed');
      onItemChanged();
    } catch (err: any) {
      setError(err.message ?? 'Update failed');
    } finally {
      setActioning(false);
    }
  }, [item, user, onItemChanged]);

  const handleUninstall = useCallback(async () => {
    if (!item.plugin_uid) return;
    setActioning(true);
    setError(null);
    try {
      const result = await unloadPlugin(item.plugin_uid);
      if (!result.success) throw new Error(result.error ?? 'Uninstall failed');
      onItemChanged();
    } catch (err: any) {
      setError(err.message ?? 'Uninstall failed');
    } finally {
      setActioning(false);
    }
  }, [item.plugin_uid, onItemChanged]);

  const handleRate = useCallback(async (rating: number) => {
    if (!user) return;
    setRatingLoading(true);
    setError(null);
    try {
      await rateItem(item.id, user.id, rating);
      setUserRating(rating);
      onItemChanged();
    } catch (err: any) {
      setError(err.message ?? 'Rating failed');
    } finally {
      setRatingLoading(false);
    }
  }, [item.id, user, onItemChanged]);

  const handleDelete = useCallback(async () => {
    if (!user || !confirm('Delete this item? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteItem(item.id, user.id);
      onItemChanged();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Delete failed');
      setDeleting(false);
    }
  }, [item.id, user, onItemChanged, onClose]);

  const isOwner = user?.id === item.user_id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-[480px] max-w-[90vw] max-h-[85vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/95 p-0 text-sm text-neutral-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video w-full bg-neutral-950">
          <img
            src={getThumbnailUrl(item.thumbnail_path)}
            alt={item.title}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
          <button
            onClick={onClose}
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-neutral-300 hover:text-white hover:bg-black/80"
            aria-label="Close"
          >
            <FaXmark />
          </button>
          <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-300">
            {item.type}
          </span>
          {isInstalled && (
            <span className="absolute bottom-2 right-2 rounded bg-green-900/80 border border-green-600/50 px-2 py-0.5 text-[10px] font-semibold text-green-400">
              {hasUpdate ? 'Update available' : 'Installed'}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Title & meta */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">{item.title}</h2>
              {item.version && (
                <span className="shrink-0 rounded bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-[11px] font-mono text-neutral-400">
                  v{item.version}
                </span>
              )}
            </div>
            {item.uploader_username && (
              <p className="mt-0.5 text-xs text-neutral-500">by {item.uploader_username}</p>
            )}
            {item.description && <p className="mt-1 text-neutral-400 text-[13px]">{item.description}</p>}
            {item.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-neutral-400">
            <span className="inline-flex items-center gap-1">
              <FaDownload className="text-[10px]" /> {item.downloads_count} downloads
            </span>
            <span className="inline-flex items-center gap-1">
              <FaStar className="text-[10px] text-yellow-500" />
              {item.average_rating > 0 ? Number(item.average_rating).toFixed(1) : '-'} ({item.ratings_count})
            </span>
            <span>{formatBytes(item.file_size_bytes)}</span>
          </div>

          {/* Star rating */}
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">Your rating:</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    disabled={ratingLoading}
                    onClick={() => handleRate(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(null)}
                    className="p-0.5 text-base transition disabled:opacity-50"
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <FaStar
                      className={
                        (hoveredStar !== null ? star <= hoveredStar : star <= (userRating ?? 0))
                          ? 'text-yellow-400'
                          : 'text-neutral-600'
                      }
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            {isOwner && (
              <>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 rounded border border-transparent px-3 py-1.5 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  <FaTrash className="text-[10px]" /> {deleting ? 'Deleting...' : 'Delete'}
                </button>
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="inline-flex items-center gap-1.5 rounded border border-neutral-600 px-3 py-1.5 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/10"
                  >
                    <FaPen className="text-[10px]" /> Edit
                  </button>
                )}
              </>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-600 px-3 py-1.5 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <FaDownload className="text-[11px]" /> {downloading ? 'Preparing...' : 'Download'}
            </button>
            {item.type === 'template' && (
              <button
                onClick={handleOpenInWorkspace}
                disabled={actioning}
                className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                <FaArrowRight className="text-[11px]" /> {actioning ? 'Opening...' : 'Open in Workspace'}
              </button>
            )}
            {item.type === 'plugin' && !isInstalled && (
              <button
                onClick={() => setShowInstallWarning(true)}
                disabled={actioning}
                className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                <FaBolt className="text-[11px]" /> {actioning ? 'Installing...' : 'Install'}
              </button>
            )}
            {item.type === 'plugin' && isInstalled && hasUpdate && (
              <button
                onClick={handleUpdate}
                disabled={actioning}
                className="inline-flex items-center gap-1.5 rounded bg-amber-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-50"
              >
                <FaArrowsRotate className="text-[11px]" /> {actioning ? 'Updating...' : 'Update'}
              </button>
            )}
            {item.type === 'plugin' && isInstalled && (
              <button
                onClick={handleUninstall}
                disabled={actioning}
                className="inline-flex items-center gap-1.5 rounded border border-red-700/50 px-4 py-1.5 text-[13px] font-semibold text-red-400 shadow-sm transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {actioning ? 'Uninstalling...' : 'Uninstall'}
              </button>
            )}
          </div>
        </div>

        {showInstallWarning && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-neutral-900 p-8 text-center">
            <p className="text-base font-semibold text-white">Install this plugin?</p>
            <p className="mt-3 text-[13px] text-neutral-300 leading-relaxed">
              Installing <span className="font-semibold text-white">{item.title}</span> will allow{' '}
              {item.uploader_username
                ? <><span className="font-semibold text-white">{item.uploader_username}</span>'s code</>
                : 'the plugin author\'s code'
              }{' '}
              to run on your computer. Only install plugins from authors you trust.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowInstallWarning(false)}
                className="rounded border border-neutral-600 px-4 py-2 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowInstallWarning(false); handleInstall(); }}
                disabled={actioning}
                className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                <FaBolt className="text-[11px]" /> Install
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityDetailModal;
