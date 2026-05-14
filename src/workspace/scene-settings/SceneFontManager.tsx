import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { GOOGLE_FONTS } from '@fonts/google-fonts-list';
import { ensureFontLoaded, ensureFontVariantsRegistered, registerCustomFontVariant } from '@fonts/font-loader';
import { parseFontMetadata } from '@fonts/font-metadata';
import { FontBinaryStore } from '@persistence/font-binary-store';
import { sha256Hex } from '@utils/hash/sha256';
import { useSceneStore } from '@state/sceneStore';
import type { FontAsset, FontSourceFormat, FontVariant } from '@state/scene/fonts';

type RemoteFontMeta = { family: string; category?: string; variants?: string[] };

const MAX_FONT_BYTES = 10 * 1024 * 1024;
const TOTAL_FONT_LIMIT_BYTES = 40 * 1024 * 1024;
const LICENSING_STORAGE_KEY = 'fontUploadAcknowledged_v1';
const RECENT_FONTS_STORAGE_KEY = 'recentFonts_v1';
const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog 0123456789';

function generateFontAssetId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `font-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferSourceFormat(name: string, mimeType?: string): FontSourceFormat | null {
    const extension = name.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'ttf':
            return 'ttf';
        case 'otf':
            return 'otf';
        case 'woff':
            return 'woff';
        case 'woff2':
            return 'woff2';
        default:
            break;
    }
    if (mimeType) {
        if (mimeType.includes('woff2')) return 'woff2';
        if (mimeType.includes('woff')) return 'woff';
        if (mimeType.includes('opentype')) return 'otf';
        if (mimeType.includes('truetype')) return 'ttf';
    }
    return null;
}

interface PreviewState {
    family: string;
    weight?: number;
    italic?: boolean;
}

const SceneFontManager: React.FC = () => {
    const fontsState = useSceneStore((state) => state.fonts);
    const registerFontAsset = useSceneStore((state) => state.registerFontAsset);
    const updateFontAsset = useSceneStore((state) => state.updateFontAsset);
    const deleteFontAsset = useSceneStore((state) => state.deleteFontAsset);
    const acknowledgeFontLicensing = useSceneStore((state) => state.acknowledgeFontLicensing);

    const [segment, setSegment] = useState<'library' | 'uploaded' | 'manage'>('library');
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<string[]>([]);
    const [remoteFonts, setRemoteFonts] = useState<RemoteFontMeta[] | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<PreviewState | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const librarySearchRef = useRef<HTMLInputElement | null>(null);

    const customFonts = useMemo(
        () => fontsState.order.map((fontId) => fontsState.assets[fontId]).filter((asset): asset is FontAsset => Boolean(asset)),
        [fontsState]
    );

    const customFontLookup = useMemo(() => {
        const map = new Map<string, FontAsset>();
        customFonts.forEach((asset) => {
            map.set(asset.family, asset);
        });
        return map;
    }, [customFonts]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(RECENT_FONTS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setRecent(parsed.filter((entry) => typeof entry === 'string'));
            }
        } catch {
            /* ignore */
        }
    }, []);

    const saveRecent = useCallback((family: string) => {
        setRecent((prev) => {
            const next = [family, ...prev.filter((entry) => entry !== family)].slice(0, 8);
            try {
                localStorage.setItem(RECENT_FONTS_STORAGE_KEY, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    useEffect(() => {
        const apiKey = (import.meta as any).env?.VITE_GOOGLE_FONTS_API_KEY;
        if (!apiKey) return;
        (async () => {
            try {
                const resp = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`);
                if (!resp.ok) throw new Error(resp.statusText);
                const data = await resp.json();
                if (Array.isArray(data.items)) {
                    setRemoteFonts(
                        data.items.map((item: any) => ({
                            family: item.family,
                            category: item.category,
                            variants: item.variants,
                        }))
                    );
                }
            } catch (error: any) {
                setFetchError(error?.message ?? 'Failed to fetch Google Fonts');
            }
        })();
    }, []);

    useEffect(() => {
        if (!librarySearchRef.current || segment !== 'library') return;
        const id = window.setTimeout(() => {
            librarySearchRef.current?.focus();
        }, 0);
        return () => window.clearTimeout(id);
    }, [segment]);

    const ensureLicensingAcknowledged = useCallback(() => {
        if (fontsState.licensingAcknowledgedAt) return true;
        if (typeof window === 'undefined') return true;
        const alreadyAcknowledged = localStorage.getItem(LICENSING_STORAGE_KEY) === 'true';
        if (alreadyAcknowledged) {
            acknowledgeFontLicensing(Date.now());
            return true;
        }
        const confirmed = window.confirm(
            'Please confirm you have the rights to upload and distribute this font within your scene.'
        );
        if (confirmed) {
            try {
                localStorage.setItem(LICENSING_STORAGE_KEY, 'true');
            } catch {
                /* ignore */
            }
            acknowledgeFontLicensing(Date.now());
            return true;
        }
        return false;
    }, [acknowledgeFontLicensing, fontsState.licensingAcknowledgedAt]);

    const handleUploadClick = useCallback(() => {
        if (!ensureLicensingAcknowledged()) return;
        fileInputRef.current?.click();
    }, [ensureLicensingAcknowledged]);

    const handleFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploadError(null);
            if (file.size > MAX_FONT_BYTES) {
                setUploadError('Font exceeds the 10MB upload limit.');
                event.target.value = '';
                return;
            }
            if (fontsState.totalBytes + file.size > TOTAL_FONT_LIMIT_BYTES) {
                setUploadError('Adding this font would exceed the 40MB scene font budget.');
                event.target.value = '';
                return;
            }
            setUploading(true);
            try {
                const buffer = await file.arrayBuffer();
                const hash = await sha256Hex(new Uint8Array(buffer));
                const duplicate = customFonts.find((asset) => asset.hash === hash);
                if (duplicate) {
                    setUploadError(`Font already uploaded as “${duplicate.family}”.`);
                    setSegment('uploaded');
                    return;
                }
                const metadata = await parseFontMetadata(buffer);
                const sourceFormat = inferSourceFormat(file.name, file.type);
                if (!sourceFormat) {
                    throw new Error('Unsupported font format. Please upload TTF, OTF, WOFF, or WOFF2 files.');
                }
                acknowledgeFontLicensing(Date.now());
                const assetId = generateFontAssetId();
                const variant: FontVariant = {
                    id: `${assetId}-variant`,
                    weight: metadata.weight,
                    style: metadata.style,
                    sourceFormat,
                    postscriptName: metadata.postscriptName,
                    variationSettings: metadata.variationAxes,
                };
                const asset: FontAsset = {
                    id: assetId,
                    family: metadata.family,
                    variants: [variant],
                    originalFileName: file.name,
                    fileSize: file.size,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    licensingAcknowledged: true,
                    hash,
                };
                await FontBinaryStore.put(assetId, buffer);
                registerFontAsset(asset);
                await registerCustomFontVariant({ asset, variant, data: buffer });
                setSegment('uploaded');
                setPreview({ family: asset.family, weight: variant.weight, italic: variant.style === 'italic' });
            } catch (error: any) {
                setUploadError(error?.message ?? 'Failed to upload font.');
            } finally {
                setUploading(false);
                if (event.target) event.target.value = '';
            }
        },
        [acknowledgeFontLicensing, customFonts, fontsState.totalBytes, registerFontAsset]
    );

    const handleDeleteFont = useCallback(
        async (assetId: string) => {
            const asset = customFonts.find((entry) => entry.id === assetId);
            await FontBinaryStore.delete(assetId);
            deleteFontAsset(assetId);
            setPreview((prev) => {
                if (prev && asset && asset.family === prev.family) {
                    return null;
                }
                return prev;
            });
        },
        [customFonts, deleteFontAsset]
    );

    const handleRenameFont = useCallback(
        (asset: FontAsset) => {
            if (typeof window === 'undefined') return;
            const next = window.prompt('Rename font family', asset.family);
            if (!next) return;
            const trimmed = next.trim();
            if (!trimmed || trimmed === asset.family) return;
            updateFontAsset(asset.id, { family: trimmed, updatedAt: Date.now() });
            setPreview((prev) => {
                if (prev && prev.family === asset.family) {
                    return { ...prev, family: trimmed };
                }
                return prev;
            });
        },
        [updateFontAsset]
    );

    const handlePreviewFont = useCallback(
        (family: string) => {
            setPreview({ family });
            saveRecent(family);
            void ensureFontLoaded(family);
        },
        [saveRecent]
    );

    const handlePreviewCustomVariant = useCallback((asset: FontAsset, variant: FontVariant) => {
        setPreview({ family: asset.family, weight: variant.weight, italic: variant.style === 'italic' });
        void ensureFontVariantsRegistered(asset, [variant]);
    }, []);

    const remoteFontNames = useMemo(() => remoteFonts?.map((font) => font.family) ?? [], [remoteFonts]);

    const allFonts = useMemo(() => {
        const system = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'];
        const curated = GOOGLE_FONTS;
        const combined = [...system, ...curated, ...remoteFontNames, ...customFonts.map((asset) => asset.family)];
        return Array.from(new Set(combined.filter(Boolean)));
    }, [remoteFontNames, customFonts]);

    const filteredFonts = useMemo(() => {
        if (!query) return allFonts;
        const lower = query.toLowerCase();
        return allFonts.filter((family) => family.toLowerCase().includes(lower));
    }, [allFonts, query]);

    const previewStyle = useMemo<React.CSSProperties | undefined>(() => {
        if (!preview) return undefined;
        return {
            fontFamily: `'${preview.family}', sans-serif`,
            fontWeight: preview.weight ? `${preview.weight}` : undefined,
            fontStyle: preview.italic ? 'italic' : 'normal',
        };
    }, [preview]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <div className="inline-flex overflow-hidden rounded border border-neutral-700 bg-neutral-900/60 text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                    <button
                        type="button"
                        onClick={() => setSegment('library')}
                        className={`px-3 py-1 transition ${segment === 'library' ? 'bg-sky-500/20 text-sky-200' : 'hover:bg-neutral-800/70'}`}
                    >
                        Library
                    </button>
                    <button
                        type="button"
                        onClick={() => setSegment('uploaded')}
                        className={`px-3 py-1 transition ${segment === 'uploaded' ? 'bg-sky-500/20 text-sky-200' : 'hover:bg-neutral-800/70'}`}
                    >
                        Uploaded
                    </button>
                    <button
                        type="button"
                        onClick={() => setSegment('manage')}
                        className={`px-3 py-1 transition ${segment === 'manage' ? 'bg-sky-500/20 text-sky-200' : 'hover:bg-neutral-800/70'}`}
                    >
                        Manage
                    </button>
                </div>
                <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="rounded border border-sky-600 bg-sky-500/20 px-3 py-1 text-[11px] uppercase tracking-wide text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {uploading ? 'Uploading…' : 'Upload Font'}
                </button>
            </div>
            {uploadError && <p className="text-[11px] text-rose-400">{uploadError}</p>}

            {segment === 'library' && (
                <div className="space-y-3 rounded border border-neutral-700 bg-neutral-900/40 p-3">
                    <div className="border-b border-neutral-800 pb-3">
                        <label className="relative flex items-center">
                            <FaSearch className="pointer-events-none absolute left-3 text-xs text-neutral-500" />
                            <input
                                ref={librarySearchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search fonts..."
                                className="w-full rounded bg-neutral-800/80 py-2 pl-8 pr-3 text-[13px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                aria-label="Search font library"
                            />
                        </label>
                        {fetchError && <p className="mt-2 text-[11px] text-rose-400/80">API: {fetchError}</p>}
                        {recent.length > 0 && (
                            <div className="mt-3">
                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Recent</div>
                                <div className="flex flex-wrap gap-1">
                                    {recent.map((family) => (
                                        <button
                                            key={family}
                                            type="button"
                                            onClick={() => handlePreviewFont(family)}
                                            className={`rounded-full border px-2 py-1 text-[11px] transition ${
                                                preview?.family === family
                                                    ? 'border-sky-500/80 bg-sky-500/20 text-sky-100'
                                                    : 'border-neutral-700 bg-neutral-800/60 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800'
                                            }`}
                                        >
                                            {family}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="max-h-[240px] overflow-y-auto">
                        {filteredFonts.length === 0 ? (
                            <p className="p-4 text-center text-[12px] text-neutral-500">No matching fonts</p>
                        ) : (
                            <ul className="m-0 list-none space-y-1 p-0">
                                {filteredFonts.map((family) => {
                                    const isGoogleFont = remoteFontNames.includes(family);
                                    const isCustomFont = customFontLookup.has(family);
                                    return (
                                        <li key={family}>
                                            <button
                                                type="button"
                                                onClick={() => handlePreviewFont(family)}
                                                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] transition ${
                                                    preview?.family === family
                                                        ? 'bg-sky-500/20 text-sky-100'
                                                        : 'text-neutral-200 hover:bg-neutral-800/60 hover:text-white'
                                                }`}
                                                style={{ fontFamily: `'${family}', sans-serif` }}
                                            >
                                                <span className="truncate">{family}</span>
                                                {(isGoogleFont || isCustomFont) && (
                                                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
                                                        {isGoogleFont && <span>Google</span>}
                                                        {isCustomFont && <span>Custom</span>}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                    <p className="text-[11px] text-neutral-400">
                        Use the font inputs on properties panels to assign a family. Uploaded fonts appear in those pickers automatically.
                    </p>
                </div>
            )}

            {segment === 'uploaded' && (
                <div className="space-y-3 rounded border border-neutral-700 bg-neutral-900/40 p-3">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Uploaded fonts • {(fontsState.totalBytes / (1024 * 1024)).toFixed(1)} MB / 40 MB</span>
                    </div>
                    {customFonts.length === 0 ? (
                        <p className="text-xs text-neutral-400">No uploaded fonts yet. Use the upload button to add one.</p>
                    ) : (
                        customFonts.map((asset) => (
                            <div key={asset.id} className="rounded border border-neutral-800 bg-neutral-950/70 p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-neutral-100">{asset.family}</div>
                                        <div className="text-[11px] text-neutral-400">{asset.originalFileName}</div>
                                    </div>
                                    <span className="text-[11px] text-neutral-500">
                                        {(asset.fileSize / (1024 * 1024)).toFixed(2)} MB
                                    </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {asset.variants.map((variant) => (
                                        <button
                                            key={variant.id}
                                            type="button"
                                            onClick={() => handlePreviewCustomVariant(asset, variant)}
                                            className={`rounded border px-3 py-1 text-[12px] transition ${
                                                preview?.family === asset.family && preview?.weight === variant.weight && (preview?.italic ? 'italic' : 'normal') === variant.style
                                                    ? 'border-sky-500 bg-sky-500/20 text-sky-100'
                                                    : 'border-neutral-700 bg-neutral-800/70 text-neutral-100 hover:border-sky-500 hover:bg-sky-500/20'
                                            }`}
                                        >
                                            {variant.weight}
                                            {variant.style === 'italic' ? ' Italic' : ''}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {segment === 'manage' && (
                <div className="space-y-3 rounded border border-neutral-700 bg-neutral-900/40 p-3">
                    <p className="text-xs text-neutral-400">
                        Total storage {(fontsState.totalBytes / (1024 * 1024)).toFixed(1)} MB of 40 MB limit.
                    </p>
                    <p className="text-xs text-neutral-500">
                        Ensure you have permission to distribute uploaded fonts. Deleting a font removes it from this scene only.
                    </p>
                    {customFonts.length === 0 ? (
                        <p className="text-xs text-neutral-400">No custom fonts to manage.</p>
                    ) : (
                        customFonts.map((asset) => (
                            <div key={asset.id} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950/70 px-3 py-2">
                                <div>
                                    <div className="text-sm font-semibold text-neutral-100">{asset.family}</div>
                                    <div className="text-[11px] text-neutral-500">{asset.originalFileName}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleRenameFont(asset)}
                                        className="rounded border border-neutral-700 px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-200 hover:border-sky-500 hover:text-sky-200"
                                    >
                                        Rename
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteFont(asset.id)}
                                        className="rounded border border-rose-600 px-2 py-1 text-[11px] uppercase tracking-wide text-rose-300 hover:bg-rose-500/20"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {preview && (
                <div className="rounded border border-neutral-700 bg-neutral-900/40 p-3">
                    <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-400">
                        <span className="uppercase tracking-wide text-neutral-500">Preview</span>
                        <span>{preview.family}</span>
                    </div>
                    <p className="text-[13px] text-neutral-100" style={previewStyle}>
                        {SAMPLE_TEXT}
                    </p>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
};

export default SceneFontManager;
