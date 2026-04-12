import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa6';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import CommunityAuthBar from './CommunityAuthBar';
import CommunityGrid from './CommunityGrid';
import CommunityDetailModal from './CommunityDetailModal';
import CommunityUploadModal from './CommunityUploadModal';
import CommunityEditModal from './CommunityEditModal';
import { fetchItems, type CommunityItem, type SortBy, type FilterType } from './communityApi';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'most_downloaded', label: 'Most Downloaded' },
];

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'template', label: 'Templates' },
  { value: 'plugin', label: 'Plugins' },
];

const CommunityPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<CommunityItem | null>(null);
  const [editItem, setEditItem] = useState<CommunityItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Get initial session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const data = await fetchItems(sortBy, filterType, pageNum);
      if (append) {
        setItems((prev) => [...prev, ...data]);
      } else {
        setItems(data);
      }
      setHasMore(data.length === 24);
    } catch (err) {
      console.error('Failed to load community items:', err);
    } finally {
      setLoading(false);
    }
  }, [sortBy, filterType]);

  // Reload when sort/filter changes
  useEffect(() => {
    setPage(0);
    loadItems(0, false);
  }, [loadItems]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadItems(nextPage, true);
  };

  const handleItemChanged = useCallback(() => {
    // Refresh the list
    setPage(0);
    loadItems(0, false);
  }, [loadItems]);

  const selectClass = "rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 focus:border-indigo-500 focus:outline-none cursor-pointer";

  return (
    <div className="min-h-screen bg-neutral-800 text-neutral-200 px-6 py-10">
      <main className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white">Community</h1>
            <p className="mt-2 text-neutral-400 text-sm">Browse and share templates & plugins</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Link to="/" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">
              Back to Home
            </Link>
            <CommunityAuthBar user={user} onAuthChange={setUser} />
          </div>
        </div>

        {/* Experimental notice */}
        <div className="mb-6 rounded-lg border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">
          <span className="font-semibold">Experimental feature.</span>{' '}
          The community hub runs on very limited server resources, which may cause long loading times and patchy availability.
          If you'd like to see the backend resources upgraded, consider{' '}
          <Link to="/contribute" className="underline hover:text-yellow-100">contributing</Link>.
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={selectClass}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div className="flex rounded border border-neutral-700 overflow-hidden">
            {FILTER_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setFilterType(o.value)}
                className={`px-3 py-1.5 text-xs font-medium transition ${filterType === o.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                  }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {user && (
            <button
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <FaPlus className="text-[10px]" /> Upload
            </button>
          )}
        </div>

        {/* Grid */}
        <CommunityGrid items={items} loading={loading} onItemClick={setSelectedItem} />

        {/* Load More */}
        {hasMore && items.length > 0 && !loading && (
          <div className="flex justify-center mt-8">
            <button
              onClick={handleLoadMore}
              className="rounded border border-neutral-700 bg-neutral-900 px-5 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              Load More
            </button>
          </div>
        )}

        {/* Detail Modal */}
        {selectedItem && (
          <CommunityDetailModal
            item={selectedItem}
            user={user}
            onClose={() => setSelectedItem(null)}
            onItemChanged={handleItemChanged}
            onEdit={user?.id === selectedItem.user_id ? () => setEditItem(selectedItem) : undefined}
          />
        )}

        {/* Edit Modal */}
        {editItem && user && (
          <CommunityEditModal
            item={editItem}
            user={user}
            onClose={() => setEditItem(null)}
            onSaved={() => {
              setEditItem(null);
              setSelectedItem(null);
              handleItemChanged();
            }}
          />
        )}

        {/* Upload Modal */}
        {isUploadOpen && user && (
          <CommunityUploadModal
            user={user}
            onClose={() => setIsUploadOpen(false)}
            onUploaded={handleItemChanged}
          />
        )}
      </main>
    </div>
  );
};

export default CommunityPage;
