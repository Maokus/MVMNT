import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { GOOGLE_FONTS } from '@shared/services/fonts/google-fonts-list';
import { ensureFontLoaded, loadGoogleFontAsync, parseFontSelection } from '@shared/services/fonts/font-loader';
import { useVisualizer } from '@context/VisualizerContext';

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

// Fallback list when we don't have variant metadata
const FALLBACK_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

const FontInputRow: React.FC<FontInputRowProps> = ({ id, value, schema, disabled, title, onChange }) => {
    const [familyOpen, setFamilyOpen] = useState(false);
    const [weightOpen, setWeightOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<string[]>([]);
    const [remoteFonts, setRemoteFonts] = useState<RemoteFontMeta[] | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const weightContainerRef = useRef<HTMLDivElement | null>(null);

    const { family: currentFamilyRaw, weight: currentWeightRaw } = parseFontSelection(value || schema.default || 'Arial');
    const currentFamily = currentFamilyRaw || 'Arial';
    const currentWeight = currentWeightRaw || '400';
    const { visualizer } = useVisualizer();
    const [loading, setLoading] = useState(false);
    const [availableWeights, setAvailableWeights] = useState<string[]>(FALLBACK_WEIGHTS);

    // Derive available weights when remote font metadata is present
    useEffect(() => {
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
    }, [remoteFonts, currentFamily]);

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

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (containerRef.current && !containerRef.current.contains(target)) {
                setFamilyOpen(false);
            }
            if (weightContainerRef.current && !weightContainerRef.current.contains(target)) {
                setWeightOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    return (
        <div style={{ display: 'flex', gap: 4, flexDirection: "column" }}>
            <div className="ae-font-input" ref={containerRef} style={{ position: 'relative', flex: 1 }}>
                <button
                    id={id}
                    type="button"
                    className="ae-font-trigger"
                    disabled={disabled}
                    title={title}
                    onClick={() => setFamilyOpen(o => !o)}
                    style={{
                        width: '100%',
                        textAlign: 'left',
                        fontFamily: `'${currentFamily}', sans-serif`,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        position: 'relative',
                        background: "#383838",
                        color: "#e0e0e0",
                        padding: "4px",
                        border: "none",
                        fontSize: "1em"
                    }}
                >
                    {currentFamily}
                    {loading && <span style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', fontSize: 10, opacity: 0.7 }}>⏳</span>}
                    <span style={{ float: 'right', opacity: 0.6 }}>▼</span>
                </button>
                {familyOpen && !disabled && (
                    <div className="ae-font-dropdown" style={{
                        position: 'absolute',
                        zIndex: 1000,
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: 260,
                        overflow: 'hidden',
                        background: '#222',
                        border: '1px solid #444',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                    }}>
                        <div style={{ padding: 4, borderBottom: '1px solid #333' }}>
                            <input
                                autoFocus
                                placeholder="Search fonts..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                style={{ width: '100%' }}
                            />
                            {fetchError && (
                                <div style={{ marginTop: 6, color: '#e88', fontSize: 10 }}>API: {fetchError}</div>
                            )}
                        </div>
                        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                            {filtered.map(f => (
                                <div
                                    key={f}
                                    onClick={() => handleFamilySelect(f)}
                                    style={{
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        fontFamily: `'${f}', sans-serif`,
                                        background: f === currentFamily ? '#333' : 'transparent',
                                    }}
                                >
                                    {f}
                                </div>
                            ))}
                            {filtered.length === 0 && (
                                <div style={{ padding: '6px 8px', opacity: 0.6 }}>No matches</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <div className="ae-font-weight-input" ref={weightContainerRef} style={{ position: 'relative', width: 90 }}>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setWeightOpen(o => !o)}
                    style={{
                        width: '100%',
                        textAlign: 'left',
                        background: "#383838",
                        color: "#e0e0e0",
                        padding: "4px",
                        border: "none",
                        fontSize: "1em"
                    }}
                    title="Select font weight"
                >
                    {currentWeight}
                    {loading && <span style={{ float: 'right', opacity: 0.6, marginRight: 4 }}>⏳</span>}
                    <span style={{ float: 'right', opacity: 0.6 }}>▼</span>
                </button>
                {weightOpen && !disabled && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: '#222',
                        border: '1px solid #444',
                        zIndex: 1000,
                        maxHeight: 200,
                        overflowY: 'auto'
                    }}>
                        {availableWeights.map(w => (
                            <div key={w}
                                onClick={() => handleWeightSelect(w)}
                                style={{
                                    padding: '4px 6px',
                                    cursor: 'pointer',
                                    background: w === currentWeight ? '#333' : 'transparent'
                                }}>{w}</div>
                        ))}
                        {availableWeights.length === 0 && (
                            <div style={{ padding: '4px 6px', opacity: 0.6 }}>No weights</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FontInputRow;
