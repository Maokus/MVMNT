import React, { useCallback, useEffect, useState } from 'react';
import { FaChevronDown, FaChevronUp, FaEye, FaEyeSlash, FaTrash } from 'react-icons/fa6';
import {
  type CommunityTag,
  type CommunityTagAlias,
  fetchAllTags,
  fetchTagAliases,
  renameTag,
  hideTag,
  mergeTag,
  addTagAlias,
  removeTagAlias,
} from './communityApi';

interface AdminTagPanelProps {
  onTagsChanged: () => void;
}

const TAG_REGEX = /^[a-z0-9][a-z0-9\-]{0,29}$/;

const AdminTagPanel: React.FC<AdminTagPanelProps> = ({ onTagsChanged }) => {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<CommunityTag[]>([]);
  const [aliases, setAliases] = useState<CommunityTagAlias[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasTargetId, setAliasTargetId] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tagsData, aliasesData] = await Promise.all([
        fetchAllTags({ includeHidden: true }),
        fetchTagAliases(),
      ]);
      setTags(tagsData);
      setAliases(aliasesData);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const handleRename = async (tagId: string) => {
    try {
      await renameTag(tagId, renameName);
      setRenameId(null);
      setRenameName('');
      await reload();
      onTagsChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Rename failed');
    }
  };

  const handleHide = async (tagId: string, hidden: boolean) => {
    try {
      await hideTag(tagId, hidden);
      await reload();
      onTagsChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Update failed');
    }
  };

  const handleMerge = async (targetId: string) => {
    if (!mergeSourceId) return;
    try {
      await mergeTag(mergeSourceId, targetId);
      setMergeSourceId(null);
      await reload();
      onTagsChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Merge failed');
    }
  };

  const handleAddAlias = async () => {
    try {
      await addTagAlias(aliasInput, aliasTargetId);
      setAliasInput('');
      setAliasTargetId('');
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Add alias failed');
    }
  };

  const handleRemoveAlias = async (aliasId: string) => {
    try {
      await removeTagAlias(aliasId);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Remove alias failed');
    }
  };

  const visibleTags = tags.filter((t) => search === '' || t.name.includes(search));

  return (
    <div className="mb-6 rounded-lg border border-neutral-700 bg-neutral-900/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-neutral-300 hover:text-white"
      >
        <span>
          Tag Management{' '}
          <span className="text-neutral-500 font-normal text-xs">({tags.length} tags)</span>
        </span>
        {open ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
      </button>

      {open && (
        <div className="border-t border-neutral-700 px-4 py-4 space-y-6">
          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</div>
          )}

          {/* Tags list */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value.toLowerCase())}
                placeholder="Search tags..."
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-48"
              />
              {loading && <span className="text-xs text-neutral-500">Loading…</span>}
            </div>

            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {visibleTags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-1.5 rounded px-2 py-1 hover:bg-neutral-800"
                >
                  {renameId === tag.id ? (
                    <>
                      <input
                        type="text"
                        value={renameName}
                        onChange={(e) =>
                          setRenameName(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && TAG_REGEX.test(renameName)) handleRename(tag.id);
                          if (e.key === 'Escape') setRenameId(null);
                        }}
                        className="rounded border border-indigo-500 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 w-40 focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => TAG_REGEX.test(renameName) && handleRename(tag.id)}
                        disabled={!TAG_REGEX.test(renameName)}
                        className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenameId(null)}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    </>
                  ) : mergeSourceId === tag.id ? (
                    <>
                      <span className="text-xs text-neutral-400 flex-1">
                        Merge <span className="font-mono text-neutral-200">"{tag.name}"</span> into:
                      </span>
                      <select
                        className="rounded border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 focus:outline-none"
                        defaultValue=""
                        onChange={(e) => e.target.value && handleMerge(e.target.value)}
                      >
                        <option value="">Pick target…</option>
                        {tags
                          .filter((t) => t.id !== tag.id && !t.is_hidden)
                          .map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setMergeSourceId(null)}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className={`flex-1 text-xs font-mono ${tag.is_hidden
                            ? 'line-through text-neutral-500'
                            : 'text-neutral-200'
                          }`}
                      >
                        {tag.name}
                        {tag.is_hidden && (
                          <span className="ml-1 text-[10px] text-neutral-600 no-underline not-italic">
                            (hidden)
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameId(tag.id);
                          setRenameName(tag.name);
                          setMergeSourceId(null);
                        }}
                        className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-700 hover:text-white"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMergeSourceId(tag.id);
                          setRenameId(null);
                        }}
                        className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-700 hover:text-white"
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        onClick={() => handleHide(tag.id, !tag.is_hidden)}
                        title={tag.is_hidden ? 'Show tag' : 'Hide tag'}
                        className="rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-white"
                      >
                        {tag.is_hidden ? (
                          <FaEye className="text-[11px]" />
                        ) : (
                          <FaEyeSlash className="text-[11px]" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {visibleTags.length === 0 && !loading && (
                <div className="text-xs text-neutral-500 px-2 py-2">No tags found</div>
              )}
            </div>
          </div>

          {/* Aliases */}
          <div>
            <h4 className="text-xs font-medium text-neutral-400 mb-2">
              Aliases{' '}
              <span className="font-normal text-neutral-600">
                — alternate spellings resolved to a canonical tag
              </span>
            </h4>

            <div className="space-y-0.5 mb-3">
              {aliases.map((alias) => {
                const canonical = tags.find((t) => t.id === alias.canonical_tag_id);
                return (
                  <div
                    key={alias.id}
                    className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-neutral-800"
                  >
                    <span className="font-mono text-neutral-300">{alias.alias_name}</span>
                    <span className="text-neutral-600">→</span>
                    <span className="font-mono text-neutral-300">
                      {canonical?.name ?? alias.canonical_tag_id}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(alias.id)}
                      title="Remove alias"
                      className="ml-auto text-neutral-600 hover:text-red-400"
                    >
                      <FaTrash className="text-[10px]" />
                    </button>
                  </div>
                );
              })}
              {aliases.length === 0 && (
                <div className="text-xs text-neutral-500 px-2">No aliases defined</div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={aliasInput}
                onChange={(e) =>
                  setAliasInput(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))
                }
                placeholder="alias-name"
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-32"
              />
              <span className="text-neutral-600 text-xs">→</span>
              <select
                value={aliasTargetId}
                onChange={(e) => setAliasTargetId(e.target.value)}
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select canonical tag…</option>
                {tags
                  .filter((t) => !t.is_hidden)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
              <button
                type="button"
                onClick={handleAddAlias}
                disabled={!TAG_REGEX.test(aliasInput) || !aliasTargetId}
                className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Add Alias
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTagPanel;
