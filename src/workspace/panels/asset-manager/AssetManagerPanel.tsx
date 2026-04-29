import React, { useEffect, useRef, useState } from 'react';
import {
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    useDismiss,
    useFloating,
    useInteractions,
} from '@floating-ui/react';
import { useVisualAssetRegistryStore, type ProjectAsset } from '@state/visualAssetRegistryStore';

const ACCEPTED_TYPES = 'image/*,.gif';

const AssetCard: React.FC<{
    entry: ProjectAsset;
    onDelete: () => void;
    onRename: (name: string) => void;
}> = ({ entry, onDelete, onRename }) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(entry.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (typeof entry.file === 'string') {
            setThumbnailUrl(entry.file);
            return;
        }
        const url = URL.createObjectURL(entry.file);
        setThumbnailUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [entry.file]);

    useEffect(() => { setDraft(entry.name); }, [entry.name]);
    useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

    const commitRename = () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== entry.name) onRename(trimmed);
        else setDraft(entry.name);
        setEditing(false);
    };

    return (
        <div className="flex flex-col rounded border border-neutral-700 bg-neutral-800 overflow-hidden hover:border-neutral-500 transition-colors">
            <div className="flex items-center justify-center bg-neutral-900 relative" style={{ height: 72 }}>
                {thumbnailUrl && (
                    <img
                        src={thumbnailUrl}
                        alt={entry.name}
                        draggable={false}
                        className="max-w-full max-h-full object-contain"
                        style={{ maxHeight: 68 }}
                    />
                )}
                {entry.source === 'bundled' && (
                    <span
                        className="absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded bg-neutral-700 text-neutral-400 leading-none select-none"
                        title="Bundled plugin asset — cannot be deleted"
                    >
                        plugin
                    </span>
                )}
            </div>
            <div className="flex items-center gap-1 px-1.5 py-1 min-w-0">
                {editing ? (
                    <input
                        ref={inputRef}
                        className="flex-1 min-w-0 px-1 py-0.5 text-[11px] bg-neutral-700 border border-accent rounded text-white outline-none"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') { setDraft(entry.name); setEditing(false); }
                        }}
                    />
                ) : (
                    <span
                        className="flex-1 min-w-0 truncate text-[11px] text-neutral-300 cursor-default"
                        title={entry.name}
                        onDoubleClick={() => setEditing(true)}
                    >
                        {entry.name}
                    </span>
                )}
                {entry.deletable && (
                    <button
                        className="shrink-0 text-neutral-500 hover:text-red-400 text-sm leading-none transition-colors"
                        title="Remove asset"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        type="button"
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
};

const AssetManagerPanel: React.FC = () => {
    const { assets, assetsOrder, addAsset, addSparrowAsset, removeAsset, renameAsset } = useVisualAssetRegistryStore(state => state);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sparrowPngRef = useRef<HTMLInputElement>(null);
    const sparrowXmlRef = useRef<HTMLInputElement>(null);
    const [pendingSparrowPng, setPendingSparrowPng] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [showPluginAssets, setShowPluginAssets] = useState(false);

    const { refs, floatingStyles, context } = useFloating({
        open: filterOpen,
        onOpenChange: setFilterOpen,
        placement: 'bottom-end',
        middleware: [offset(4), flip(), shift({ padding: 4 })],
        whileElementsMounted: autoUpdate,
    });
    const dismiss = useDismiss(context);
    const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f) addAsset(f);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleSparrowPngSelected = (files: FileList | null) => {
        const png = files?.[0];
        if (!png) return;
        if (sparrowPngRef.current) sparrowPngRef.current.value = '';
        setPendingSparrowPng(png);
        sparrowXmlRef.current?.click();
    };

    const handleSparrowXmlSelected = (files: FileList | null) => {
        const xml = files?.[0];
        if (sparrowXmlRef.current) sparrowXmlRef.current.value = '';
        if (!xml || !pendingSparrowPng) { setPendingSparrowPng(null); return; }
        addSparrowAsset(pendingSparrowPng, xml);
        setPendingSparrowPng(null);
    };

    // Clean up pending state if user cancels the XML picker
    useEffect(() => {
        if (!pendingSparrowPng) return;
        const timer = setTimeout(() => setPendingSparrowPng(null), 60_000);
        return () => clearTimeout(timer);
    }, [pendingSparrowPng]);

    const orderedEntries = assetsOrder
        .map((id) => assets[id])
        .filter((e): e is ProjectAsset => Boolean(e))
        .filter((e) => showPluginAssets || e.source !== 'bundled');

    return (
        <div
            className={`flex flex-col h-full bg-neutral-950 transition-colors${dragOver ? ' ring-1 ring-inset ring-accent/50' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
        >
            {/* Header */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800 shrink-0">
                <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wide mr-auto">Assets</span>
                <button
                    ref={refs.setReference}
                    {...getReferenceProps()}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${filterOpen || showPluginAssets ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200'}`}
                    title="Filter assets"
                    type="button"
                    onClick={() => setFilterOpen((v) => !v)}
                >
                    Filter{showPluginAssets ? ' ●' : ''}
                </button>
                <button
                    className="text-xs px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
                    title="Import Sparrow atlas (PNG + XML)"
                    type="button"
                    onClick={() => sparrowPngRef.current?.click()}
                >
                    + Sparrow
                </button>
                <button
                    className="text-xs px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
                    title="Upload images"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                >
                    + Upload
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleFiles(e.target.files)}
                />
                <input
                    ref={sparrowPngRef}
                    type="file"
                    accept="image/png"
                    style={{ display: 'none' }}
                    onChange={(e) => handleSparrowPngSelected(e.target.files)}
                />
                <input
                    ref={sparrowXmlRef}
                    type="file"
                    accept=".xml"
                    style={{ display: 'none' }}
                    onChange={(e) => handleSparrowXmlSelected(e.target.files)}
                />
            </div>

            {/* Filter popup */}
            {filterOpen && (
                <FloatingPortal>
                    <div
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="z-50 min-w-[180px] rounded border border-neutral-700 bg-neutral-900 shadow-lg py-2 px-3"
                    >
                        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">Filters</p>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showPluginAssets}
                                onChange={(e) => setShowPluginAssets(e.target.checked)}
                                className="accent-accent"
                            />
                            <span className="text-xs text-neutral-300">Show plugin assets</span>
                        </label>
                    </div>
                </FloatingPortal>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto min-h-0 p-2">
                {orderedEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-xs text-center gap-1 select-none">
                        <span>No assets yet.</span>
                        <span>Upload images, drop files, or import a Sparrow atlas.</span>
                    </div>
                ) : (
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
                        {orderedEntries.map((entry) => (
                            <AssetCard
                                key={entry.id}
                                entry={entry}
                                onDelete={() => removeAsset(entry.id)}
                                onRename={(name) => renameAsset(entry.id, name)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AssetManagerPanel;
