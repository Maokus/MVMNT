import React, { useEffect, useState, useCallback } from 'react';
import { FaDownload, FaStar, FaTrash, FaXmark } from 'react-icons/fa6';
import type { User } from '@supabase/supabase-js';
import type { CommunityItem } from './communityApi';
import { getThumbnailUrl, downloadItem, rateItem, getUserRating, deleteItem } from './communityApi';

interface CommunityDetailModalProps {
  item: CommunityItem;
  user: User | null;
  onClose: () => void;
  onItemChanged: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const CommunityDetailModal: React.FC<CommunityDetailModalProps> = ({ item, user, onClose, onItemChanged }) => {
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        </div>

        <div className="p-5 space-y-4">
          {/* Title & meta */}
          <div>
            <h2 className="text-lg font-semibold text-white">{item.title}</h2>
            {item.description && <p className="mt-1 text-neutral-400 text-[13px]">{item.description}</p>}
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
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded border border-transparent px-3 py-1.5 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <FaTrash className="text-[10px]" /> {deleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              <FaDownload className="text-[11px]" /> {downloading ? 'Preparing...' : 'Download'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityDetailModal;
