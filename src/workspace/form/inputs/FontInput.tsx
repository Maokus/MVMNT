import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
    FloatingFocusManager,
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    size,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import { FaSearch } from 'react-icons/fa';
import { GOOGLE_FONTS } from '@fonts/google-fonts-list';
import {
    ensureFontLoaded,
    loadGoogleFontAsync,
    ensureFontVariantsRegistered,
    registerCustomFontVariant,
} from '@fonts/font-loader';
import { useVisualizer } from '@context/VisualizerContext';
import { useSceneStore } from '@state/sceneStore';
import {
    encodeCustomFontToken,
    parseFontSelectionToken,
    type FontAsset,
    type FontVariant,
    type FontSourceFormat,
} from '@state/scene/fonts';
import { FontBinaryStore } from '@persistence/font-binary-store';
import { parseFontMetadata } from '@fonts/font-metadata';
import { sha256Hex } from '@utils/hash/sha256';

interface FontInputRowProps {
    id: string;
    value: string; // stored as "Family" or "Family|Weight" for weight-aware
    schema: any; // expects { default }
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

interface RemoteFontMeta { family: string; category?: string; variants?: string[] }

const LOCAL_STORAGE_KEY = 'recentFonts_v1';
const LICENSING_STORAGE_KEY = 'fontUploadAcknowledged_v1';
const MAX_FONT_BYTES = 10 * 1024 * 1024;
const TOTAL_FONT_LIMIT_BYTES = 40 * 1024 * 1024;

function generateFontAssetId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `font-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Fallback list when we don't have variant metadata
const FALLBACK_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

const FontInput: React.FC<FontInputRowProps> = ({ id, value, schema, disabled, title, onChange }) => {
    const fontsState = useSceneStore((state) => state.fonts);
    const registerFontAsset = useSceneStore((state) => state.registerFontAsset);
    const updateFontAsset = useSceneStore((state) => state.updateFontAsset);
    const deleteFontAsset = useSceneStore((state) => state.deleteFontAsset);
    const acknowledgeFontLicensing = useSceneStore((state) => state.acknowledgeFontLicensing);
    const [familyOpen, setFamilyOpen] = useState(false);
    const [weightOpen, setWeightOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<string[]>([]);
    const [remoteFonts, setRemoteFonts] = useState<RemoteFontMeta[] | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const familySearchRef = useRef<HTMLInputElement | null>(null);

    const parsedSelection = parseFontSelectionToken(value || schema.default || 'Arial', (assetId) => fontsState.assets[assetId]);
    const currentFamily = parsedSelection.family || 'Arial';
    const currentWeight = parsedSelection.weight || '400';
    const isCustomSelection = Boolean(parsedSelection.isCustom && parsedSelection.assetId);
    const { visualizer } = useVisualizer();
    const [loading, setLoading] = useState(false);
    const [availableWeights, setAvailableWeights] = useState<string[]>(FALLBACK_WEIGHTS);
    const [segment, setSegment] = useState<'library' | 'uploaded' | 'manage'>(isCustomSelection ? 'uploaded' : 'library');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const customFonts = useMemo(
        () => fontsState.order.map((fontId) => fontsState.assets[fontId]).filter((asset): asset is FontAsset => Boolean(asset)),
        [fontsState]
    );

    const inferSourceFormat = useCallback((name: string, mimeType?: string): FontSourceFormat | null => {
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
    }, []);

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
            localStorage.setItem(LICENSING_STORAGE_KEY, 'true');
            acknowledgeFontLicensing(Date.now());
            return true;
        }
        return false;
    }, [acknowledgeFontLicensing, fontsState.licensingAcknowledgedAt]);

    const handleUploadClick = useCallback(() => {
        if (disabled) return;
        if (!ensureLicensingAcknowledged()) return;
        fileInputRef.current?.click();
    }, [disabled, ensureLicensingAcknowledged]);

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
                onChange(encodeCustomFontToken(assetId, variant.weight, variant.style === 'italic'));
                setSegment('uploaded');
            } catch (error: any) {
                setUploadError(error?.message ?? 'Failed to upload font.');
            } finally {
                setUploading(false);
                if (event.target) event.target.value = '';
            }
        },
        [acknowledgeFontLicensing, customFonts, fontsState.totalBytes, inferSourceFormat, onChange, registerFontAsset]
    );

    const handleSelectCustom = useCallback(
        async (asset: FontAsset, variant: FontVariant) => {
            onChange(encodeCustomFontToken(asset.id, variant.weight, variant.style === 'italic'));
            await ensureFontVariantsRegistered(asset, [variant]);
            setSegment('uploaded');
        },
        [onChange]
    );

    const handleDeleteFont = useCallback(
        async (assetId: string) => {
            await FontBinaryStore.delete(assetId);
            deleteFontAsset(assetId);
        },
        [deleteFontAsset]
    );

    const handleRenameFont = useCallback(
        (asset: FontAsset) => {
            if (typeof window === 'undefined') return;
            const next = window.prompt('Rename font family', asset.family);
            if (!next) return;
            const trimmed = next.trim();
            if (!trimmed || trimmed === asset.family) return;
            updateFontAsset(asset.id, { family: trimmed, updatedAt: Date.now() });
        },
        [updateFontAsset]
    );

    useEffect(() => {
        if (!isCustomSelection || !parsedSelection.assetId) return;
        const asset = fontsState.assets[parsedSelection.assetId];
        if (asset?.variants?.length) {
            setAvailableWeights(asset.variants.map((variant) => String(variant.weight)));
        }
    }, [fontsState.assets, isCustomSelection, parsedSelection.assetId]);

    // Derive available weights when remote font metadata is present
    useEffect(() => {
        if (isCustomSelection) return;
        if (!remoteFonts) return;
        const meta = remoteFonts.find(f => f.family === currentFamily);
        if (meta?.variants?.length) {
            // Google variants come like 'regular','500','700','italic','500italic'
            const weightSet = new Set<string>();
            meta.variants.forEach(v => {
                const m = v.match(/(\d+)|regular/);
                if (m) {
                    weightSet.add(m[0] === 'regular' ? '400' : m[0]);
                }
            });
            if (weightSet.size) setAvailableWeights(Array.from(weightSet).sort());
        } else {
            setAvailableWeights(FALLBACK_WEIGHTS);
        }
    }, [remoteFonts, currentFamily, isCustomSelection]);

    useEffect(() => {
        // Ensure base family (common weights) is loaded and rerender when done
        setLoading(true);
        ensureFontLoaded(currentFamily).finally(() => {
            setLoading(false);
            visualizer?.invalidateRender?.();
        });
    }, [currentFamily, visualizer]);

    // Load recent from localStorage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (raw) setRecent(JSON.parse(raw));
        } catch { }
    }, []);

    const saveRecent = useCallback((family: string) => {
        setRecent(prev => {
            const next = [family, ...prev.filter(f => f !== family)].slice(0, 8);
            try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next)); } catch { }
            return next;
        });
    }, []);

    // Optional remote fetch (requires env var VITE_GOOGLE_FONTS_API_KEY) for full list
    useEffect(() => {
        const apiKey = (import.meta as any).env?.VITE_GOOGLE_FONTS_API_KEY;
        if (!apiKey) return; // skip if no key
        (async () => {
            try {
                const resp = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`);
                if (!resp.ok) throw new Error(resp.statusText);
                const data = await resp.json();
                if (data.items) {
                    setRemoteFonts(data.items.map((it: any) => ({ family: it.family, category: it.category, variants: it.variants })));
                }
            } catch (e: any) {
                setFetchError(e.message || 'Fetch failed');
            }
        })();
    }, []);

    const remoteFontNames = useMemo(() => remoteFonts?.map(f => f.family) || [], [remoteFonts]);

    const allFonts = useMemo(() => {
        const system = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'];
        const curated = GOOGLE_FONTS;
        const combined = [...system, ...curated, ...remoteFontNames, currentFamily];
        return Array.from(new Set(combined));
    }, [remoteFontNames, currentFamily]);

    const filtered = useMemo(() => {
        if (!query) return allFonts;
        const q = query.toLowerCase();
        return allFonts.filter(f => f.toLowerCase().includes(q));
    }, [allFonts, query]);

    const {
        refs: familyRefs,
        floatingStyles: familyFloatingStyles,
        context: familyContext,
    } = useFloating({
        open: familyOpen,
        onOpenChange: setFamilyOpen,
        placement: 'bottom-start',
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(6),
            flip({ padding: 12 }),
            shift({ padding: 12 }),
            size({
                apply({ rects, availableHeight, elements }) {
                    const targetWidth = Math.max(Math.round(rects.reference.width), 320);
                    Object.assign(elements.floating.style, {
                        width: `${targetWidth}px`,
                        maxHeight: `${Math.min(Math.max(availableHeight - 12, 200), 360)}px`,
                    });
                },
            }),
        ],
    });

    const {
        refs: weightRefs,
        floatingStyles: weightFloatingStyles,
        context: weightContext,
    } = useFloating({
        open: weightOpen,
        onOpenChange: setWeightOpen,
        placement: 'bottom-start',
        whileElementsMounted: autoUpdate,
        middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
    });

    const familyDismiss = useDismiss(familyContext, { outsidePressEvent: 'mousedown' });
    const familyRole = useRole(familyContext, { role: 'listbox' });
    const { getReferenceProps: getFamilyReferenceProps, getFloatingProps: getFamilyFloatingProps } = useInteractions([
        familyDismiss,
        familyRole,
    ]);

    const weightDismiss = useDismiss(weightContext, { outsidePressEvent: 'mousedown' });
    const weightRole = useRole(weightContext, { role: 'listbox' });
    const { getReferenceProps: getWeightReferenceProps, getFloatingProps: getWeightFloatingProps } = useInteractions([
        weightDismiss,
        weightRole,
    ]);

    useEffect(() => {
        if (!familyOpen) {
            setQuery('');
            return;
        }
        const id = window.setTimeout(() => {
            familySearchRef.current?.focus();
        }, 0);
        return () => window.clearTimeout(id);
    }, [familyOpen]);

    useEffect(() => {
        if (!familyOpen) return;
        setWeightOpen(false);
    }, [familyOpen]);

    useEffect(() => {
        if (!weightOpen) return;
        setFamilyOpen(false);
    }, [weightOpen]);

    const handleFamilySelect = (family: string) => {
        onChange(`${family}|${currentWeight}`);
        saveRecent(family);
        setFamilyOpen(false);
    };

    const handleWeightSelect = (weight: string) => {
        setLoading(true);
        loadGoogleFontAsync(currentFamily, { weights: [parseInt(weight) || 400], italics: false, display: 'swap' })
            .finally(() => {
                setLoading(false);
                visualizer?.invalidateRender?.();
            });
        onChange(`${currentFamily}|${weight}`);
        setWeightOpen(false);
    };
    const renderLibrary = () => (
        <div className="flex flex-col gap-2">
            <div className="ae-font-input" style={{ flex: 1 }}>
                <button
                    {...getFamilyReferenceProps({
                        type: 'button',
                        onClick: () => setFamilyOpen((o) => !o),
                        disabled,
                        id,
                        title,
                    })}
                    ref={familyRefs.setReference}
                    className="flex w-full items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800/70 px-3 py-2 text-left text-[12px] font-medium text-neutral-100 transition focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ fontFamily: `'${currentFamily}', sans-serif` }}
                >
                    <span className="truncate">{currentFamily}</span>
                    <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-neutral-400">
                        {loading && <span className="animate-pulse text-[10px]">⏳</span>}
                        <span>Family</span>
                    </span>
                </button>
                {familyOpen && !disabled && (
                    <FloatingPortal>
                        <FloatingFocusManager context={familyContext} modal={false} initialFocus={-1}>
                            <div
                                {...getFamilyFloatingProps({})}
                                ref={familyRefs.setFloating}
                                style={familyFloatingStyles}
                                data-preserve-selection="true"
                                className="z-[1000] flex max-h-[360px] flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-950/95 text-[13px] text-neutral-100 shadow-2xl"
                            >
                                <div className="border-b border-neutral-800 bg-neutral-900/60 p-3">
                                    <label className="relative flex items-center">
                                        <FaSearch className="pointer-events-none absolute left-3 text-xs text-neutral-500" />
                                        <input
                                            ref={familySearchRef}
                                            placeholder="Search fonts..."
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            className="w-full rounded bg-neutral-800/80 py-2 pl-8 pr-3 text-[13px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                            aria-label="Search font families"
                                        />
                                    </label>
                                    {fetchError && (
                                        <p className="mt-2 text-[11px] text-rose-400/80">API: {fetchError}</p>
                                    )}
                                    {recent.length > 0 && (
                                        <div className="mt-3">
                                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Recent</div>
                                            <div className="flex flex-wrap gap-1">
                                                {recent.map((r) => (
                                                    <button
                                                        key={r}
                                                        type="button"
                                                        onClick={() => handleFamilySelect(r)}
                                                        className={`rounded-full border px-2 py-1 text-[11px] transition ${
                                                            r === currentFamily
                                                                ? 'border-sky-500/80 bg-sky-500/20 text-sky-100'
                                                                : 'border-neutral-700 bg-neutral-800/60 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800'
                                                        }`}
                                                    >
                                                        {r}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto bg-neutral-950/90">
                                    {filtered.length > 0 ? (
                                        <ul className="m-0 list-none p-0">
                                            {filtered.map((f) => (
                                                <li key={f}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleFamilySelect(f)}
                                                        className={`flex w-full items-center justify-between px-3 py-2 text-left transition ${
                                                            f === currentFamily
                                                                ? 'bg-sky-500/20 text-sky-100'
                                                                : 'text-neutral-200 hover:bg-neutral-800/60 hover:text-white'
                                                        }`}
                                                        style={{ fontFamily: `'${f}', sans-serif` }}
                                                    >
                                                        <span className="truncate">{f}</span>
                                                        {remoteFontNames.includes(f) && (
                                                            <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-500">Google</span>
                                                        )}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="p-4 text-center text-[12px] text-neutral-500">No matching fonts</div>
                                    )}
                                </div>
                            </div>
                        </FloatingFocusManager>
                    </FloatingPortal>
                )}
            </div>
            <div className="ae-font-weight-input w-[110px]">
                <button
                    {...getWeightReferenceProps({
                        type: 'button',
                        onClick: () => setWeightOpen((o) => !o),
                        disabled,
                    })}
                    ref={weightRefs.setReference}
                    className="flex w-full items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800/70 px-3 py-2 text-left text-[12px] font-medium text-neutral-100 transition focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Select font weight"
                >
                    <span>{currentWeight}</span>
                    <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-neutral-400">
                        {loading && <span className="animate-pulse text-[10px]">⏳</span>}
                        <span>Weight</span>
                    </span>
                </button>
                {weightOpen && !disabled && (
                    <FloatingPortal>
                        <FloatingFocusManager context={weightContext} modal={false} initialFocus={-1}>
                            <div
                                {...getWeightFloatingProps({})}
                                ref={weightRefs.setFloating}
                                style={weightFloatingStyles}
                                data-preserve-selection="true"
                                className="z-[1000] max-h-[240px] w-[110px] overflow-y-auto rounded border border-neutral-700 bg-neutral-950/95 text-[13px] text-neutral-100 shadow-xl"
                            >
                                <ul className="m-0 list-none p-1">
                                    {availableWeights.length > 0 ? (
                                        availableWeights.map((w) => (
                                            <li key={w}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleWeightSelect(w)}
                                                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left transition ${
                                                        w === currentWeight
                                                            ? 'bg-sky-500/20 text-sky-100'
                                                            : 'text-neutral-200 hover:bg-neutral-800/60 hover:text-white'
                                                    }`}
                                                >
                                                    <span>{w}</span>
                                                </button>
                                            </li>
                                        ))
                                    ) : (
                                        <li className="px-3 py-2 text-center text-[12px] text-neutral-500">No weights</li>
                                    )}
                                </ul>
                            </div>
                        </FloatingFocusManager>
                    </FloatingPortal>
                )}
            </div>
        </div>
    );

    const renderUploaded = () => (
        <div className="space-y-3 rounded border border-neutral-700 bg-neutral-900/40 p-3">
            <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-400">
                    Uploaded fonts • {(fontsState.totalBytes / (1024 * 1024)).toFixed(1)} MB / 40 MB
                </p>
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
                                    onClick={() => handleSelectCustom(asset, variant)}
                                    className="rounded border border-neutral-700 bg-neutral-800/70 px-3 py-1 text-[12px] text-neutral-100 hover:border-sky-500 hover:bg-sky-500/20"
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
    );

    const renderManage = () => (
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
    );

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
                    disabled={disabled || uploading}
                    className="rounded border border-sky-600 bg-sky-500/20 px-3 py-1 text-[11px] uppercase tracking-wide text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {uploading ? 'Uploading…' : 'Upload Font'}
                </button>
            </div>
            {uploadError && <p className="text-[11px] text-rose-400">{uploadError}</p>}
            {segment === 'library' && renderLibrary()}
            {segment === 'uploaded' && renderUploaded()}
            {segment === 'manage' && renderManage()}
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

export default FontInput;
