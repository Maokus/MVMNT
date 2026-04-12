import React from 'react';
import type { CommunityItem } from './communityApi';
import CommunityCard from './CommunityCard';

interface CommunityGridProps {
  items: CommunityItem[];
  loading: boolean;
  onItemClick: (item: CommunityItem) => void;
}

const CommunityGrid: React.FC<CommunityGridProps> = ({ items, loading, onItemClick }) => {
  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3 text-neutral-500">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-indigo-400" />
          <p className="text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-neutral-500 text-sm">No items yet. Be the first to upload!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <CommunityCard key={item.id} item={item} onClick={() => onItemClick(item)} />
      ))}
    </div>
  );
};

export default CommunityGrid;
