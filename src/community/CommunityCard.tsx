import React from 'react';
import { FaDownload, FaStar } from 'react-icons/fa6';
import type { CommunityItem } from './communityApi';
import { getThumbnailUrl } from './communityApi';

interface CommunityCardProps {
  item: CommunityItem;
  onClick: () => void;
}

const CommunityCard: React.FC<CommunityCardProps> = ({ item, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-lg border border-neutral-800 bg-neutral-900/60 text-left transition hover:border-neutral-600 hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 overflow-hidden"
    >
      <div className="relative aspect-video w-full bg-neutral-950 overflow-hidden">
        <img
          src={getThumbnailUrl(item.thumbnail_path)}
          alt={item.title}
          className="h-full w-full object-cover transition group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-300">
          {item.type}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="text-sm font-medium text-white truncate">{item.title}</p>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <FaDownload className="text-[10px]" />
            {item.downloads_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <FaStar className="text-[10px] text-yellow-500" />
            {item.average_rating > 0 ? Number(item.average_rating).toFixed(1) : '-'}
          </span>
        </div>
      </div>
    </button>
  );
};

export default CommunityCard;
