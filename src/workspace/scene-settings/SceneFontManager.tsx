import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { importFontFile } from '@fonts/import-font-file';
import {
    addGoogleFontFamilyToProject,
    fetchGoogleFontCatalog,
    hasGoogleFontsApiKey,
    readCachedGoogleFontCatalog,
    type GoogleFontDownloadProgress,
    type GoogleFontFamily,
} from '@fonts/google-fonts-client';
import { dispatchSceneCommand } from '@state/scene';
import { createSceneSnapshot, useSceneStore } from '@state/sceneStore';
import {
    encodeBuiltInFontToken,
    encodeProjectFontToken,
    parseFontSelectionToken,
    type FontAsset,
} from '@state/scene/fonts';

type Section = 'project' | 'google' | 'built-in' | 'device';

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function usageCount(value: unknown, assetId: string): number {
    if (typeof value === 'string') return value.startsWith(`Project:${assetId}|`) ? 1 : 0;
    if (Array.isArray(value)) return value.reduce((total, entry) => total + usageCount(entry, assetId), 0);
    if (!value || typeof value !== 'object') return 0;
    return Object.values(value).reduce((total, entry) => total + usageCount(entry, assetId), 0);
}

function replaceAssetTokens(value: unknown, assetId: string, replacement: FontAsset | 'built-in'): unknown {
    if (typeof value === 'string' && value.startsWith(`Project:${assetId}|`)) {
        const parsed = parseFontSelectionToken(value);
        const requestedWeight = Number.parseInt(parsed.weight || '400', 10) || 400;
        if (replacement === 'built-in') {
            return encodeBuiltInFontToken('inter', requestedWeight, Boolean(parsed.italic));
        }
        const style = parsed.italic ? 'italic' : 'normal';
        const variant =
            replacement.variants.find((entry) => entry.weight === requestedWeight && entry.style === style) ??
            replacement.variants
                .filter((entry) => entry.style === style)
                .sort((a, b) => Math.abs(a.weight - requestedWeight) - Math.abs(b.weight - requestedWeight))[0] ??
            replacement.variants[0];
        return variant
            ? encodeProjectFontToken(replacement.id, variant.weight, variant.style === 'italic')
            : encodeBuiltInFontToken('inter', requestedWeight, Boolean(parsed.italic));
    }
    if (Array.isArray(value)) return value.map((entry) => replaceAssetTokens(entry, assetId, replacement));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, replaceAssetTokens(entry, assetId, replacement)])
    );
}

const SceneFontManager: React.FC = () => {
    const fonts = useSceneStore((state) => state.fonts);
    const bindings = useSceneStore((state) => state.bindings.byElement);
    const macros = useSceneStore((state) => state.macros.byId);
    const automation = useSceneStore((state) => state.automation.channels);
    const [section, setSection] = useState<Section>('project');
    const [query, setQuery] = useState('');
    const [catalog, setCatalog] = useState<GoogleFontFamily[]>(() => readCachedGoogleFontCatalog()?.items ?? []);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [loadingCatalog, setLoadingCatalog] = useState(false);
    const [download, setDownload] = useState<GoogleFontDownloadProgress | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [replacementByAsset, setReplacementByAsset] = useState<Record<string, string>>({});
    const fileInput = useRef<HTMLInputElement>(null);
    const downloadController = useRef<AbortController | null>(null);
    const projectFonts = useMemo(
        () => fonts.order.map((id) => fonts.assets[id]).filter((asset): asset is FontAsset => Boolean(asset)),
        [fonts]
    );
    const snapshot = useMemo(
        () => createSceneSnapshot(useSceneStore.getState()),
        [automation, bindings, fonts, macros]
    );

    useEffect(() => {
        if (section !== 'google' || catalog.length || loadingCatalog || catalogError) return;
        if (!hasGoogleFontsApiKey()) {
            setCatalogError('Google Fonts requires an API key configured in this MVMNT build.');
            return;
        }
        setLoadingCatalog(true);
        fetchGoogleFontCatalog()
            .then((result) => setCatalog(result.items))
            .catch((error) => setCatalogError((error as Error).message))
            .finally(() => setLoadingCatalog(false));
    }, [catalog.length, catalogError, loadingCatalog, section]);

    useEffect(() => () => downloadController.current?.abort(), []);

    const filteredCatalog = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return catalog.filter((font) => !normalized || font.family.toLowerCase().includes(normalized));
    }, [catalog, query]);

    const upload = async (file: File) => {
        setOperationError(null);
        if (
            !fonts.licensingAcknowledgedAt &&
            !window.confirm('Confirm that you have the rights to use and distribute this font within the scene.')
        ) {
            return;
        }
        try {
            await importFontFile(file);
            setSection('project');
        } catch (error) {
            setOperationError((error as Error).message);
        }
    };

    const downloadFamily = async (family: GoogleFontFamily) => {
        const controller = new AbortController();
        downloadController.current = controller;
        setOperationError(null);
        try {
            await addGoogleFontFamilyToProject(family, { signal: controller.signal, onProgress: setDownload });
            setSection('project');
        } catch (error) {
            if ((error as Error).name !== 'AbortError') setOperationError((error as Error).message);
        } finally {
            setDownload(null);
            downloadController.current = null;
        }
    };

    const removeFont = (asset: FontAsset) => {
        const count = usageCount(snapshot, asset.id);
        if (count) {
            const replacementId = replacementByAsset[asset.id];
            if (!replacementId) return;
            const replacement = replacementId === 'built-in' ? 'built-in' : fonts.assets[replacementId];
            if (!replacement) return;
            const next = replaceAssetTokens(snapshot, asset.id, replacement) as ReturnType<typeof createSceneSnapshot>;
            dispatchSceneCommand({
                type: 'batch',
                commands: [
                    { type: 'loadSerializedScene', payload: next },
                    { type: 'deleteFontAsset', assetId: asset.id },
                ],
            });
            return;
        }
        dispatchSceneCommand({ type: 'deleteFontAsset', assetId: asset.id });
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex overflow-hidden rounded border border-neutral-700 bg-neutral-900/60 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                    {(['project', 'google', 'built-in', 'device'] as Section[]).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setSection(item)}
                            className={`px-3 py-1.5 capitalize ${section === item ? 'bg-sky-500/20 text-sky-200' : 'hover:bg-neutral-800'}`}
                        >
                            {item}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="rounded border border-sky-600 bg-sky-500/20 px-3 py-1.5 text-[10px] uppercase tracking-wide text-sky-100 hover:bg-sky-500/30"
                >
                    Upload font
                </button>
            </div>

            {operationError && <p className="text-[11px] text-rose-400">{operationError}</p>}

            {section === 'project' && (
                <div className="space-y-2 rounded border border-neutral-700 bg-neutral-900/40 p-3">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Project Fonts · embedded in this file</span>
                        <span>{formatBytes(fonts.totalBytes)}</span>
                    </div>
                    {!projectFonts.length && <p className="text-xs text-neutral-500">No embedded fonts yet.</p>}
                    {projectFonts.map((asset) => {
                        const count = usageCount(snapshot, asset.id);
                        return (
                            <div key={asset.id} className="rounded border border-neutral-800 bg-neutral-950/70 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-neutral-100">{asset.family}</div>
                                        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                                            {asset.source === 'google' ? 'Google · embedded' : 'Uploaded'} ·{' '}
                                            {asset.variants.length} faces · {count} usages
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-neutral-500">{formatBytes(asset.fileSize)}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {asset.variants.map((variant) => (
                                        <span
                                            key={variant.id}
                                            className="rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300"
                                        >
                                            {variant.weight}
                                            {variant.style === 'italic' ? ' Italic' : ''}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-3 flex items-center justify-end gap-2">
                                    {asset.source === 'google' && (
                                        <a
                                            href={`https://fonts.google.com/specimen/${encodeURIComponent(asset.google?.family || asset.family)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mr-auto text-[10px] text-sky-300 hover:underline"
                                        >
                                            Source &amp; license
                                        </a>
                                    )}
                                    {count > 0 && (
                                        <select
                                            aria-label={`Replacement for ${asset.family}`}
                                            value={replacementByAsset[asset.id] ?? ''}
                                            onChange={(event) =>
                                                setReplacementByAsset((current) => ({
                                                    ...current,
                                                    [asset.id]: event.target.value,
                                                }))
                                            }
                                            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200"
                                        >
                                            <option value="">Choose replacement…</option>
                                            <option value="built-in">Inter · Built-in</option>
                                            {projectFonts
                                                .filter((entry) => entry.id !== asset.id)
                                                .map((entry) => (
                                                    <option key={entry.id} value={entry.id}>
                                                        {entry.family}
                                                    </option>
                                                ))}
                                        </select>
                                    )}
                                    <button
                                        type="button"
                                        disabled={count > 0 && !replacementByAsset[asset.id]}
                                        onClick={() => removeFont(asset)}
                                        className="rounded border border-rose-700 px-2 py-1 text-[10px] uppercase tracking-wide text-rose-300 disabled:opacity-40"
                                    >
                                        {count ? 'Replace & remove' : 'Remove'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {section === 'google' && (
                <div className="space-y-3 rounded border border-neutral-700 bg-neutral-900/40 p-3">
                    <p className="text-xs text-neutral-400">
                        Selecting a family downloads every available weight and style and embeds it in the project.
                    </p>
                    <label className="relative block">
                        <FaSearch className="absolute left-3 top-2.5 text-xs text-neutral-500" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search Google Fonts…"
                            className="w-full rounded bg-neutral-800 py-2 pl-8 pr-3 text-xs text-neutral-100 outline-none focus:ring-2 focus:ring-sky-500"
                        />
                    </label>
                    {loadingCatalog && <p className="text-xs text-neutral-500">Loading catalog…</p>}
                    {catalogError && <p className="text-xs text-rose-400">{catalogError}</p>}
                    <div className="max-h-[280px] overflow-y-auto">
                        {filteredCatalog.map((family) => (
                            <button
                                key={family.family}
                                type="button"
                                disabled={Boolean(download)}
                                onClick={() => void downloadFamily(family)}
                                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                            >
                                <span>{family.family}</span>
                                <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                                    {family.variants.length} faces · Download
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {section === 'built-in' && (
                <div className="rounded border border-neutral-700 bg-neutral-900/40 p-3">
                    <div className="text-sm font-semibold text-neutral-100" style={{ fontFamily: 'Inter' }}>
                        Inter
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                        Bundled with MVMNT for deterministic offline defaults. Built-in fonts do not increase project
                        size.
                    </p>
                </div>
            )}

            {section === 'device' && (
                <div className="rounded border border-amber-700/60 bg-amber-950/20 p-3">
                    <p className="text-xs text-amber-200">
                        Device fonts are not embedded and may render differently on another computer.
                    </p>
                    <p className="mt-2 text-xs text-neutral-400">
                        Arial · Helvetica · Times New Roman · Georgia · Verdana
                    </p>
                </div>
            )}

            {download && (
                <div className="rounded border border-sky-700 bg-neutral-950 p-3 text-xs text-neutral-200">
                    <div className="flex items-center justify-between">
                        <span>
                            Embedding {download.family}… {download.completed}/{download.total}
                        </span>
                        <button
                            type="button"
                            onClick={() => downloadController.current?.abort()}
                            className="rounded border border-neutral-600 px-2 py-1"
                        >
                            Cancel
                        </button>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded bg-neutral-800">
                        <div
                            className="h-full bg-sky-500"
                            style={{ width: `${(download.completed / download.total) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            <input
                ref={fileInput}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = '';
                }}
            />
        </div>
    );
};

export default SceneFontManager;
