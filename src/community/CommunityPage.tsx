import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaXmark } from 'react-icons/fa6';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import CommunityAuthBar from './CommunityAuthBar';
import CommunityGrid from './CommunityGrid';
import CommunityDetailModal from './CommunityDetailModal';
import CommunityUploadModal from './CommunityUploadModal';
import CommunityEditModal from './CommunityEditModal';
import { fetchItems, fetchAllTags, type CommunityItem, type CommunityTag, type SortBy, type FilterType } from './communityApi';

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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<CommunityTag[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // Get initial session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  // Load available tags
  useEffect(() => {
    fetchAllTags().then(setAllTags).catch(() => { });
  }, []);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const data = await fetchItems(sortBy, filterType, pageNum, selectedTags.length > 0 ? selectedTags : undefined);
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
  }, [sortBy, filterType, selectedTags]);

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
    setPage(0);
    loadItems(0, false);
    fetchAllTags().then(setAllTags).catch(() => { });
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
            <div className="flex gap-2">
              <Link to="/" className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-medium text-neutral-300">
                Back to Home
              </Link>
              <Link to="/workspace" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white">
                Back to Workspace
              </Link>
            </div>
            <CommunityAuthBar user={user} onAuthChange={setUser} />
          </div>
        </div>

        {/* Experimental notice */}
        <div className="mb-6 rounded-lg border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">
          <span className="font-semibold">Experimental feature.</span>{' '}
          The community hub runs on very limited server resources, which may cause long loading times and patchy availability.
          If you'd like to see the backend resources upgraded, consider{' '}
          <Link to="/contribute" className="underline hover:text-yellow-100">contributing</Link>.{' '}
          <span className="font-semibold text-red-300">Backend updates may cause data loss and file corruption — always keep backups of your projects.</span>
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

        {/* Tag Filter */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded bg-indigo-900/50 border border-indigo-700/50 px-2 py-1 text-xs text-indigo-300"
            >
              {tag}
              <button
                onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                className="text-indigo-400 hover:text-white"
                aria-label={`Remove tag filter ${tag}`}
              >
                <FaXmark className="text-[8px]" />
              </button>
            </span>
          ))}
          <div className="relative">
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => {
                setTagSearch(e.target.value.toLowerCase());
                setShowTagDropdown(true);
              }}
              onFocus={() => setShowTagDropdown(true)}
              onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
              placeholder="Filter by tag..."
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-36"
            />
            {showTagDropdown && (
              <div className="absolute z-10 mt-1 w-48 rounded border border-neutral-700 bg-neutral-900 shadow-lg max-h-48 overflow-y-auto">
                {allTags
                  .filter((t) => t.name.includes(tagSearch) && !selectedTags.includes(t.name))
                  .slice(0, 10)
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedTags((prev) => [...prev, tag.name]);
                        setTagSearch('');
                        setShowTagDropdown(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-neutral-300 hover:bg-indigo-600 hover:text-white"
                    >
                      {tag.name}
                    </button>
                  ))}
                {allTags.filter((t) => t.name.includes(tagSearch) && !selectedTags.includes(t.name)).length === 0 && (
                  <div className="px-3 py-2 text-xs text-neutral-500">No tags found</div>
                )}
              </div>
            )}
          </div>
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              Clear all
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
