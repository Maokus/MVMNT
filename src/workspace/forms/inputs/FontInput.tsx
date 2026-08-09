import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { FloatingPortal, autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react';
import { useVisualizer } from '@context/VisualizerContext';
import { ensureFontLoaded } from '@fonts/font-loader';
import {
    addGoogleFontFamilyToProject,
    fetchGoogleFontCatalog,
    hasGoogleFontsApiKey,
    readCachedGoogleFontCatalog,
    type GoogleFontDownloadProgress,
    type GoogleFontFamily,
} from '@fonts/google-fonts-client';
import { useSceneStore } from '@state/sceneStore';
import {
    encodeBuiltInFontToken,
    encodeDeviceFontToken,
    encodeProjectFontToken,
    parseFontSelectionToken,
    type FontAsset,
    type FontVariant,
} from '@state/scene/fonts';

interface FontInputRowProps {
    id: string;
    value: string;
    schema: { default?: string };
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const DEVICE_FONTS = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'];
const BUILT_IN_VARIANTS = [100, 200, 300, 400, 500, 600, 700, 800, 900].flatMap((weight) => [
    { weight, italic: false },
    { weight, italic: true },
]);

function variantLabel(variant: Pick<FontVariant, 'weight' | 'style'>): string {
    return `${variant.weight}${variant.style === 'italic' ? ' Italic' : ''}`;
}

function closestVariant(asset: FontAsset, weight: number, italic: boolean): FontVariant | undefined {
    const style = italic ? 'italic' : 'normal';
    return (
        asset.variants.find((variant) => variant.weight === weight && variant.style === style) ??
        asset.variants
            .filter((variant) => variant.style === style)
            .sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0] ??
        asset.variants.find((variant) => variant.weight === 400 && variant.style === 'normal') ??
        asset.variants[0]
    );
}

const FontInput: React.FC<FontInputRowProps> = ({ id, value, schema, disabled, title, onChange }) => {
    const fonts = useSceneStore((state) => state.fonts);
    const { visualizer } = useVisualizer();
    const [open, setOpen] = useState(false);
    const [weightOpen, setWeightOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [catalog, setCatalog] = useState<GoogleFontFamily[]>(() => readCachedGoogleFontCatalog()?.items ?? []);
    const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [download, setDownload] = useState<GoogleFontDownloadProgress | null>(null);
    const downloadController = useRef<AbortController | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const familyFloating = useFloating({
        open,
        onOpenChange: setOpen,
        placement: 'bottom-start',
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(6),
            flip({ padding: 12 }),
            shift({ padding: 12 }),
            size({
                apply({ availableHeight, elements }) {
                    Object.assign(elements.floating.style, {
                        width: '360px',
                        maxHeight: `${Math.min(420, Math.max(220, availableHeight - 12))}px`,
                    });
                },
            }),
        ],
    });
    const weightFloating = useFloating({
        open: weightOpen,
        onOpenChange: setWeightOpen,
        placement: 'bottom-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
    });

    const token = value || schema.default || encodeBuiltInFontToken('inter', 400);
    const parsed = parseFontSelectionToken(token, (assetId) => fonts.assets[assetId]);
    const currentWeight = Number.parseInt(parsed.weight || '400', 10) || 400;
    const currentAsset = parsed.assetId ? fonts.assets[parsed.assetId] : undefined;
    const projectFonts = useMemo(
        () => fonts.order.map((fontId) => fonts.assets[fontId]).filter((asset): asset is FontAsset => Boolean(asset)),
        [fonts]
    );

    useEffect(() => {
        void ensureFontLoaded(token).finally(() => visualizer?.invalidateRender?.());
    }, [token, visualizer]);

    useEffect(() => {
        if (!open || catalogState !== 'idle') return;
        if (!hasGoogleFontsApiKey()) {
            setCatalogState('error');
            setError('Google Fonts is unavailable because this build has no API key configured.');
            return;
        }
        setCatalogState('loading');
        fetchGoogleFontCatalog()
            .then((result) => {
                setCatalog(result.items);
                setCatalogState('ready');
                setError(null);
            })
            .catch((cause) => {
                if ((cause as Error).name === 'AbortError') return;
                setCatalogState('error');
                setError((cause as Error).message);
            });
    }, [catalogState, open]);

    useEffect(() => () => downloadController.current?.abort(), []);

    useEffect(() => {
        if (!open && !weightOpen) return;
        const closeOnOutsidePress = (event: MouseEvent) => {
            if (
                !rootRef.current?.contains(event.target as Node) &&
                !familyFloating.refs.floating.current?.contains(event.target as Node) &&
                !weightFloating.refs.floating.current?.contains(event.target as Node)
            ) {
                setOpen(false);
                setWeightOpen(false);
            }
        };
        document.addEventListener('mousedown', closeOnOutsidePress);
        return () => document.removeEventListener('mousedown', closeOnOutsidePress);
    }, [familyFloating.refs.floating, open, weightFloating.refs.floating, weightOpen]);

    const filteredGoogle = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return catalog.filter((font) => !normalized || font.family.toLowerCase().includes(normalized));
    }, [catalog, query]);

    const selectProjectVariant = (asset: FontAsset, variant: FontVariant) => {
        onChange(encodeProjectFontToken(asset.id, variant.weight, variant.style === 'italic'));
        setOpen(false);
        setWeightOpen(false);
    };

    const selectGoogleFamily = async (family: GoogleFontFamily) => {
        const controller = new AbortController();
        downloadController.current = controller;
        setOpen(false);
        setError(null);
        try {
            const asset = await addGoogleFontFamilyToProject(family, {
                signal: controller.signal,
                onProgress: setDownload,
            });
            const variant = closestVariant(asset, currentWeight, Boolean(parsed.italic));
            if (!variant) throw new Error(`${family.family} did not contain a usable font face.`);
            selectProjectVariant(asset, variant);
        } catch (cause) {
            if ((cause as Error).name !== 'AbortError') setError((cause as Error).message);
        } finally {
            downloadController.current = null;
            setDownload(null);
        }
    };

    const availableVariants: Array<{ key: string; label: string; select: () => void }> = currentAsset
        ? currentAsset.variants.map((variant) => ({
              key: variant.id,
              label: variantLabel(variant),
              select: () => selectProjectVariant(currentAsset, variant),
          }))
        : BUILT_IN_VARIANTS.map(({ weight, italic }) => ({
              key: `${weight}-${italic ? 'italic' : 'normal'}`,
              label: `${weight}${italic ? ' Italic' : ''}`,
              select: () => {
                  const next =
                      parsed.source === 'device'
                          ? encodeDeviceFontToken(parsed.family, weight, italic)
                          : encodeBuiltInFontToken('inter', weight, italic);
                  onChange(next);
                  setWeightOpen(false);
              },
          }));

    return (
        <div ref={rootRef} className="relative flex gap-2" data-font-source={parsed.source}>
            <button
                id={id}
                ref={familyFloating.refs.setReference}
                type="button"
                title={title}
                disabled={disabled || Boolean(download)}
                onClick={() => {
                    setOpen((current) => !current);
                    setWeightOpen(false);
                }}
                className="flex min-w-0 flex-1 items-center justify-between rounded border border-neutral-700 bg-neutral-800/70 px-3 py-2 text-left text-xs text-neutral-100 disabled:opacity-60"
                style={{ fontFamily: `'${parsed.family || 'Inter'}', sans-serif` }}
            >
                <span className="truncate">{parsed.missing ? `Missing: ${parsed.family}` : parsed.family}</span>
                <span className="ml-2 text-[9px] uppercase tracking-wide text-neutral-500">{parsed.source}</span>
            </button>
            <button
                type="button"
                ref={weightFloating.refs.setReference}
                disabled={disabled || Boolean(download) || parsed.missing}
                onClick={() => {
                    setWeightOpen((current) => !current);
                    setOpen(false);
                }}
                className="w-[108px] rounded border border-neutral-700 bg-neutral-800/70 px-3 py-2 text-left text-xs text-neutral-100 disabled:opacity-60"
            >
                {parsed.weight || '400'}
                {parsed.italic ? ' Italic' : ''}
            </button>

            {open && !disabled && (
                <FloatingPortal>
                    <div
                        ref={familyFloating.refs.setFloating}
                        style={familyFloating.floatingStyles}
                        data-preserve-selection="true"
                        className="z-[1000] flex max-h-[420px] w-[360px] flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-950 text-xs shadow-2xl"
                    >
                        <label className="relative border-b border-neutral-800 p-3">
                            <FaSearch className="absolute left-6 top-[22px] text-neutral-500" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search Google Fonts…"
                                className="w-full rounded bg-neutral-800 py-2 pl-8 pr-3 text-neutral-100 outline-none focus:ring-2 focus:ring-sky-500"
                            />
                        </label>
                        <div className="overflow-y-auto p-2">
                            <FontSection label="Project Fonts · embedded">
                                {projectFonts.length ? (
                                    projectFonts.map((asset) => {
                                        const variant = closestVariant(asset, currentWeight, Boolean(parsed.italic));
                                        return (
                                            <FontRow
                                                key={asset.id}
                                                family={asset.family}
                                                badge={asset.source === 'google' ? 'Google · embedded' : 'Uploaded'}
                                                onClick={() => variant && selectProjectVariant(asset, variant)}
                                            />
                                        );
                                    })
                                ) : (
                                    <EmptyRow>No project fonts yet</EmptyRow>
                                )}
                            </FontSection>
                            <FontSection label="Built-in Fonts · offline">
                                <FontRow
                                    family="Inter"
                                    badge="Built-in"
                                    onClick={() => {
                                        onChange(
                                            encodeBuiltInFontToken('inter', currentWeight, Boolean(parsed.italic))
                                        );
                                        setOpen(false);
                                    }}
                                />
                            </FontSection>
                            <FontSection label="Google Fonts · downloads entire family">
                                {catalogState === 'loading' && <EmptyRow>Loading catalog…</EmptyRow>}
                                {filteredGoogle.slice(0, 150).map((family) => (
                                    <FontRow
                                        key={family.family}
                                        family={family.family}
                                        badge={`${family.variants.length} faces · Download`}
                                        onClick={() => void selectGoogleFamily(family)}
                                    />
                                ))}
                                {catalogState === 'error' && <EmptyRow>{error}</EmptyRow>}
                            </FontSection>
                            <FontSection label="Device Fonts · not portable">
                                {DEVICE_FONTS.map((family) => (
                                    <FontRow
                                        key={family}
                                        family={family}
                                        badge="This device"
                                        onClick={() => {
                                            onChange(encodeDeviceFontToken(family, currentWeight));
                                            setOpen(false);
                                        }}
                                    />
                                ))}
                            </FontSection>
                        </div>
                    </div>
                </FloatingPortal>
            )}

            {weightOpen && (
                <FloatingPortal>
                    <div
                        ref={weightFloating.refs.setFloating}
                        style={weightFloating.floatingStyles}
                        data-preserve-selection="true"
                        className="z-[1000] max-h-[280px] w-[140px] overflow-y-auto rounded border border-neutral-700 bg-neutral-950 p-1 shadow-xl"
                    >
                        {availableVariants.map((variant) => (
                            <button
                                key={variant.key}
                                type="button"
                                onClick={variant.select}
                                className="block w-full rounded px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                            >
                                {variant.label}
                            </button>
                        ))}
                    </div>
                </FloatingPortal>
            )}

            {download && (
                <FloatingPortal>
                    <div
                        data-preserve-selection="true"
                        className="fixed left-1/2 top-1/2 z-[1100] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded border border-sky-700 bg-neutral-950 p-3 text-xs text-neutral-200 shadow-2xl"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <span>
                                Embedding {download.family}… {download.completed}/{download.total}
                            </span>
                            <button
                                type="button"
                                onClick={() => downloadController.current?.abort()}
                                className="rounded border border-neutral-600 px-2 py-1 hover:bg-neutral-800"
                            >
                                Cancel
                            </button>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded bg-neutral-800">
                            <div
                                className="h-full bg-sky-500 transition-[width]"
                                style={{ width: `${(download.completed / download.total) * 100}%` }}
                            />
                        </div>
                    </div>
                </FloatingPortal>
            )}
            {error && catalogState !== 'error' && !download && (
                <div className="absolute left-0 top-full z-[1100] mt-1 rounded border border-rose-700 bg-neutral-950 p-2 text-[11px] text-rose-300">
                    {error}
                </div>
            )}
        </div>
    );
};

const FontSection: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
    <section className="mb-3 last:mb-0">
        <h4 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</h4>
        {children}
    </section>
);

const FontRow: React.FC<{ family: string; badge: string; onClick: () => void }> = ({ family, badge, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-neutral-200 hover:bg-neutral-800"
    >
        <span className="truncate">{family}</span>
        <span className="ml-3 shrink-0 text-[9px] uppercase tracking-wide text-neutral-500">{badge}</span>
    </button>
);

const EmptyRow: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="px-2 py-2 text-[11px] text-neutral-500">{children}</div>
);

export default FontInput;
