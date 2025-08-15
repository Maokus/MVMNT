import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { GOOGLE_FONTS } from '../../../../utils/google-fonts-list';
import { ensureFontLoaded, loadGoogleFont, parseFontSelection } from '../../../../utils/font-loader';

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

const AVAILABLE_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold'];

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

    useEffect(() => {
        // Only ensure base family (not all weights) is loaded
        ensureFontLoaded(currentFamily);
    }, [currentFamily]);

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
        // Do not load variants yet; lazy load when weight chosen
        onChange(`${family}|${currentWeight}`);
        saveRecent(family);
        setFamilyOpen(false);
    };

    const handleWeightSelect = (weight: string) => {
        // Load only that selected weight now
        loadGoogleFont(currentFamily, { weights: [parseInt(weight) || 400], italics: false, display: 'swap' });
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
                        whiteSpace: 'nowrap'
                    }}
                >
                    {currentFamily}
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
                    style={{ width: '100%', textAlign: 'left' }}
                    title="Select font weight"
                >
                    {currentWeight}
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
                        {AVAILABLE_WEIGHTS.map(w => (
                            <div key={w}
                                onClick={() => handleWeightSelect(w)}
                                style={{
                                    padding: '4px 6px',
                                    cursor: 'pointer',
                                    background: w === currentWeight ? '#333' : 'transparent'
                                }}>{w}</div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FontInputRow;
