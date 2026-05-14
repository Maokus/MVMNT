import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import type { CommunityTag } from './communityApi';
import { fetchAllTags } from './communityApi';

interface CommunityTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  /** Trusted and admin users may create new tags; regular users can only use existing ones. */
  canCreateTags?: boolean;
}

const TAG_REGEX = /^[a-z0-9][a-z0-9\-]{0,29}$/;

function findSimilarTags(name: string, allTags: CommunityTag[]): string[] {
  if (name.length < 3) return [];
  const results: string[] = [];
  for (const tag of allTags) {
    if (tag.name === name) continue;
    if (tag.name.includes(name) || name.includes(tag.name)) {
      results.push(tag.name);
      continue;
    }
    let common = 0;
    const minLen = Math.min(tag.name.length, name.length);
    for (let i = 0; i < minLen; i++) {
      if (tag.name[i] === name[i]) common++;
      else break;
    }
    if (common >= 4) results.push(tag.name);
  }
  return results.slice(0, 3);
}

const CommunityTagInput: React.FC<CommunityTagInputProps> = ({
  tags,
  onChange,
  max = 5,
  canCreateTags = false,
}) => {
  const [input, setInput] = useState('');
  const [allTags, setAllTags] = useState<CommunityTag[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllTags().then(setAllTags).catch(() => { });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const normalized = input.toLowerCase().trim();
  const suggestions = allTags
    .filter((t) => t.name.includes(normalized) && !tags.includes(t.name))
    .slice(0, 8);

  const canCreateNew = canCreateTags
    && normalized.length > 0
    && TAG_REGEX.test(normalized)
    && !allTags.some((t) => t.name === normalized)
    && !tags.includes(normalized);

  const similarTags = canCreateNew ? findSimilarTags(normalized, allTags) : [];

  const options = [
    ...suggestions.map((t) => ({ type: 'existing' as const, name: t.name })),
    ...(canCreateNew ? [{ type: 'create' as const, name: normalized }] : []),
  ];

  const addTag = useCallback((name: string) => {
    if (tags.length >= max || tags.includes(name)) return;
    onChange([...tags, name]);
    setInput('');
    setShowDropdown(false);
    setHighlightIdx(0);
  }, [tags, max, onChange]);

  const removeTag = useCallback((name: string) => {
    onChange(tags.filter((t) => t !== name));
  }, [tags, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
      return;
    }
    if (!showDropdown || options.length === 0) {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlightIdx]) addTag(options[highlightIdx].name);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }, [input, tags, showDropdown, options, highlightIdx, addTag, removeTag]);

  const atMax = tags.length >= max;

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs text-neutral-400 mb-1">Tags (up to {max})</label>
      <div className="flex flex-wrap gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 focus-within:border-indigo-500">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-neutral-400 hover:text-white"
              aria-label={`Remove tag ${tag}`}
            >
              <FaXmark className="text-[8px]" />
            </button>
          </span>
        ))}
        {!atMax && (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''));
              setShowDropdown(true);
              setHighlightIdx(0);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? 'Add tags...' : ''}
            className="flex-1 min-w-[80px] bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
          />
        )}
      </div>

      {!canCreateTags && !atMax && (
        <p className="mt-1 text-[11px] text-neutral-500">Only existing tags can be used.</p>
      )}

      {showDropdown && normalized.length > 0 && options.length > 0 && !atMax && (
        <div className="absolute z-10 mt-1 w-full rounded border border-neutral-700 bg-neutral-900 shadow-lg max-h-48 overflow-y-auto">
          {canCreateNew && similarTags.length > 0 && (
            <div className="px-3 py-1.5 text-xs text-yellow-400/80 bg-yellow-900/20 border-b border-neutral-700">
              Similar tags exist: {similarTags.join(', ')}
            </div>
          )}
          {options.map((opt, i) => (
            <button
              key={opt.name + opt.type}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(opt.name)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full px-3 py-1.5 text-left text-xs ${i === highlightIdx ? 'bg-indigo-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                }`}
            >
              {opt.type === 'create' ? (
                <span>Create "<span className="font-medium">{opt.name}</span>"</span>
              ) : (
                opt.name
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommunityTagInput;
