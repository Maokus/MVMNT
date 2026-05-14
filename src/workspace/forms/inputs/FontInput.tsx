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
import { ensureFontLoaded, loadGoogleFontAsync, ensureFontVariantsRegistered } from '@fonts/font-loader';
import { useVisualizer } from '@context/VisualizerContext';
import { useSceneStore } from '@state/sceneStore';
import { encodeCustomFontToken, parseFontSelectionToken, type FontAsset } from '@state/scene/fonts';

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

type WeightOption = {
    value: string;
    label: string;
    italic: boolean;
};

const FALLBACK_WEIGHT_OPTIONS: WeightOption[] = ['100', '200', '300', '400', '500', '600', '700', '800', '900'].map((entry) => ({
    value: entry,
    label: entry,
    italic: false,
}));

const FontInput: React.FC<FontInputRowProps> = ({ id, value, schema, disabled, title, onChange }) => {
    const fontsState = useSceneStore((state) => state.fonts);
    const [familyOpen, setFamilyOpen] = useState(false);
    const [weightOpen, setWeightOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<string[]>([]);
    const [remoteFonts, setRemoteFonts] = useState<RemoteFontMeta[] | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const familySearchRef = useRef<HTMLInputElement | null>(null);

    const parsedSelection = parseFontSelectionToken(value || schema.default || 'Arial', (assetId) => fontsState.assets[assetId]);
    const currentFamily = parsedSelection.family || 'Arial';
    const currentWeightValue = parsedSelection.weight
        ? `${parsedSelection.weight}${parsedSelection.italic ? 'i' : ''}`
        : parsedSelection.italic
            ? `400i`
            : '400';
    const isCustomSelection = Boolean(parsedSelection.isCustom && parsedSelection.assetId);
    const { visualizer } = useVisualizer();
    const [loading, setLoading] = useState(false);
    const [availableWeights, setAvailableWeights] = useState<WeightOption[]>(FALLBACK_WEIGHT_OPTIONS);
    const customFonts = useMemo(
        () => fontsState.order.map((fontId) => fontsState.assets[fontId]).filter((asset): asset is FontAsset => Boolean(asset)),
        [fontsState]
    );

    const customFontNames = useMemo(() => customFonts.map((asset) => asset.family), [customFonts]);

    const customFontLookup = useMemo(() => {
        const map = new Map<string, FontAsset>();
        customFonts.forEach((asset) => {
            map.set(asset.family, asset);
        });
        return map;
    }, [customFonts]);

    const currentWeightLabel = useMemo(() => {
        const match = availableWeights.find((option) => option.value === currentWeightValue);
        if (match) return match.label;
        if (parsedSelection.weight) {
            return parsedSelection.italic ? `${parsedSelection.weight} Italic` : parsedSelection.weight;
        }
        return parsedSelection.italic ? '400 Italic' : '400';
    }, [availableWeights, currentWeightValue, parsedSelection.weight, parsedSelection.italic]);

    useEffect(() => {
        if (!isCustomSelection || !parsedSelection.assetId) return;
        const asset = fontsState.assets[parsedSelection.assetId];
        if (asset?.variants?.length) {
            const next = asset.variants.map((variant) => ({
                value: `${variant.weight}${variant.style === 'italic' ? 'i' : ''}`,
                label: variant.style === 'italic' ? `${variant.weight} Italic` : `${variant.weight}`,
                italic: variant.style === 'italic',
            }));
            if (next.length) {
                setAvailableWeights(next);
                return;
            }
        }
        setAvailableWeights(FALLBACK_WEIGHT_OPTIONS);
    }, [fontsState.assets, isCustomSelection, parsedSelection.assetId]);

    // Derive available weights when remote font metadata is present
    useEffect(() => {
        if (isCustomSelection) return;
        if (!remoteFonts) return;
        const meta = remoteFonts.find(f => f.family === currentFamily);
        if (meta?.variants?.length) {
            // Google variants come like 'regular','500','700','italic','500italic'
            const weightMap = new Map<string, WeightOption>();
            meta.variants.forEach(v => {
                const match = v.match(/(\d+)|regular/);
                if (!match) return;
                const weight = match[0] === 'regular' ? '400' : match[0];
                const italic = v.includes('italic');
                const value = `${weight}${italic ? 'i' : ''}`;
                if (!weightMap.has(value)) {
                    weightMap.set(value, {
                        value,
                        label: italic ? `${weight} Italic` : weight,
                        italic,
                    });
                }
            });
            if (weightMap.size) {
                const sorted = Array.from(weightMap.values()).sort((a, b) => {
                    const weightA = parseInt(a.value, 10) || 0;
                    const weightB = parseInt(b.value, 10) || 0;
                    if (weightA === weightB) {
                        return Number(a.italic) - Number(b.italic);
                    }
                    return weightA - weightB;
                });
                setAvailableWeights(sorted);
                return;
            }
        }
        setAvailableWeights(FALLBACK_WEIGHT_OPTIONS);
    }, [remoteFonts, currentFamily, isCustomSelection]);

    useEffect(() => {
        if (!isCustomSelection || !parsedSelection.assetId) return;
        const asset = fontsState.assets[parsedSelection.assetId];
        if (!asset) return;
        const desiredValue = currentWeightValue;
        const variant =
            asset.variants.find((entry) => `${entry.weight}${entry.style === 'italic' ? 'i' : ''}` === desiredValue) ??
            asset.variants[0];
        if (!variant) return;
        void ensureFontVariantsRegistered(asset, [variant]).then(() => {
            visualizer?.invalidateRender?.();
        });
    }, [fontsState.assets, isCustomSelection, parsedSelection.assetId, currentWeightValue, visualizer]);

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
        const combined = [...system, ...curated, ...remoteFontNames, ...customFontNames, currentFamily];
        return Array.from(new Set(combined.filter(Boolean)));
    }, [remoteFontNames, customFontNames, currentFamily]);

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
        const customAsset = customFontLookup.get(family);
        saveRecent(family);
        setFamilyOpen(false);
        if (customAsset) {
            const firstVariant = customAsset.variants[0];
            if (!firstVariant) return;
            onChange(encodeCustomFontToken(customAsset.id, firstVariant.weight, firstVariant.style === 'italic'));
            void ensureFontVariantsRegistered(customAsset, [firstVariant]).then(() => {
                visualizer?.invalidateRender?.();
            });
            return;
        }
        const defaultWeight = parsedSelection.weight || '400';
        setLoading(true);
        loadGoogleFontAsync(family, {
            weights: [parseInt(defaultWeight, 10) || 400],
            italics: false,
            display: 'swap',
        })
            .finally(() => {
                setLoading(false);
                visualizer?.invalidateRender?.();
            });
        onChange(`${family}|${defaultWeight}`);
    };

    const handleWeightSelect = (option: WeightOption) => {
        if (isCustomSelection && parsedSelection.assetId) {
            const asset = fontsState.assets[parsedSelection.assetId];
            if (asset) {
                const variant =
                    asset.variants.find(
                        (entry) => `${entry.weight}${entry.style === 'italic' ? 'i' : ''}` === option.value
                    ) ??
                    asset.variants.find((entry) => String(entry.weight) === option.value.replace(/i$/, ''));
                if (variant) {
                    onChange(encodeCustomFontToken(asset.id, variant.weight, variant.style === 'italic'));
                    void ensureFontVariantsRegistered(asset, [variant]).then(() => {
                        visualizer?.invalidateRender?.();
                    });
                } else {
                    const numeric = parseInt(option.value, 10) || 400;
                    onChange(encodeCustomFontToken(asset.id, numeric, option.italic));
                }
                setWeightOpen(false);
                return;
            }
        }

        setLoading(true);
        loadGoogleFontAsync(currentFamily, {
            weights: [parseInt(option.value, 10) || 400],
            italics: option.italic,
            display: 'swap',
        })
            .finally(() => {
                setLoading(false);
                visualizer?.invalidateRender?.();
            });
        onChange(`${currentFamily}|${option.value}`);
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
                    className="flex w-full items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800/70 px-3 py-2 text-left text-xs font-medium text-neutral-100 transition focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ fontFamily: `'${currentFamily}', sans-serif` }}
                >
                    <span className="truncate">{currentFamily}</span>
                    <span className="flex items-center gap-1 uppercase tracking-wide text-neutral-400">
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
                                                        className={`rounded-full border px-2 py-1 text-[11px] transition ${r === currentFamily
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
                                            {filtered.map((f) => {
                                                const isGoogleFont = remoteFontNames.includes(f);
                                                const isCustomFont = customFontLookup.has(f);
                                                return (
                                                    <li key={f}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleFamilySelect(f)}
                                                            className={`flex w-full items-center justify-between px-3 py-2 text-left transition ${f === currentFamily
                                                                ? 'bg-sky-500/20 text-sky-100'
                                                                : 'text-neutral-200 hover:bg-neutral-800/60 hover:text-white'
                                                                }`}
                                                            style={{ fontFamily: `'${f}', sans-serif` }}
                                                        >
                                                            <span className="truncate">{f}</span>
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
                    <span>{currentWeightLabel}</span>
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
                                        availableWeights.map((option) => (
                                            <li key={option.value}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleWeightSelect(option)}
                                                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left transition ${option.value === currentWeightValue
                                                        ? 'bg-sky-500/20 text-sky-100'
                                                        : 'text-neutral-200 hover:bg-neutral-800/60 hover:text-white'
                                                        }`}
                                                >
                                                    <span>{option.label}</span>
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

    return renderLibrary();

};

export default FontInput;
