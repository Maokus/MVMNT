import React, { useEffect, useState } from 'react';
import type { TemplateDefinition, TemplateMetadata } from './types';

interface TemplateBrowserModalProps {
    templates: TemplateDefinition[];
    onClose: () => void;
    onSelect: (template: TemplateDefinition) => void;
}

export const TemplateBrowserModal: React.FC<TemplateBrowserModalProps> = ({ templates, onClose, onSelect }) => {
    const [metadataMap, setMetadataMap] = useState<Record<string, TemplateMetadata>>({});

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    useEffect(() => {
        let cancelled = false;
        const loadAllMetadata = async () => {
            const results = await Promise.all(
                templates.map(async (template) => {
                    if (!template.loadMetadata) return undefined;
                    try {
                        const metadata = await template.loadMetadata();
                        if (!metadata) return undefined;
                        return [template.id, metadata] as const;
                    } catch {
                        return undefined;
                    }
                })
            );
            if (cancelled) return;
            setMetadataMap((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const entry of results) {
                    if (!entry) continue;
                    const [id, metadata] = entry;
                    const existing = prev[id];
                    if (
                        existing?.name === metadata.name &&
                        existing?.description === metadata.description &&
                        existing?.author === metadata.author
                    ) {
                        continue;
                    }
                    next[id] = metadata;
                    changed = true;
                }
                return changed ? next : prev;
            });
        };
        void loadAllMetadata();
        return () => {
            cancelled = true;
        };
    }, [templates]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
            role="dialog"
            aria-modal="true"
            aria-label="Browse templates"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                    <h2 className="text-sm font-semibold text-neutral-100">Choose a Template</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-neutral-600 px-2 py-1 text-xs uppercase tracking-wide text-neutral-300 transition-colors hover:border-neutral-400 hover:text-neutral-100"
                    >
                        Close
                    </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                    {templates.length === 0 ? (
                        <p className="text-sm text-neutral-400">No templates available yet.</p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {templates.map((template) => {
                                const metadata = metadataMap[template.id];
                                const displayName = metadata?.name?.trim() || template.name;
                                const displayDescription = metadata?.description?.trim() || template.description;
                                const displayAuthor = metadata?.author?.trim() || template.author;
                                return (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => onSelect(template)}
                                        className="group flex h-full flex-col items-start gap-2 rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 text-left transition-colors hover:border-sky-500 hover:bg-neutral-800"
                                    >
                                        <span className="text-sm font-semibold text-neutral-100 group-hover:text-white">
                                            {displayName}
                                        </span>
                                        <span className="text-xs text-neutral-400 group-hover:text-neutral-300">
                                            {displayDescription}
                                        </span>
                                        {displayAuthor && (
                                            <span className="text-[11px] uppercase tracking-wide text-neutral-500 group-hover:text-neutral-400">
                                                By {displayAuthor}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TemplateBrowserModal;
