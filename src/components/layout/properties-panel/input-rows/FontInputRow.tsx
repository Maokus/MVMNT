import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { GOOGLE_FONTS } from '../../../../utils/google-fonts-list';
import { ensureFontLoaded, loadGoogleFont } from '../../../../utils/font-loader';

interface FontInputRowProps {
    id: string;
    value: string;
    schema: any; // expects { default }
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

interface RemoteFontMeta { family: string; category?: string; variants?: string[] }

const LOCAL_STORAGE_KEY = 'recentFonts_v1';

const AVAILABLE_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const FontInputRow: React.FC<FontInputRowProps> = ({ id, value, schema, disabled, title, onChange }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<string[]>([]);
    const [remoteFonts, setRemoteFonts] = useState<RemoteFontMeta[] | null>(null);
    const [weightsToLoad, setWeightsToLoad] = useState<number[]>([400, 700]);
    const [italic, setItalic] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const currentValue = value || schema.default || 'Arial';

    useEffect(() => {
        ensureFontLoaded(currentValue);
    }, [currentValue]);

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
        const combined = [...system, ...curated, ...remoteFontNames, currentValue];
        return Array.from(new Set(combined));
    }, [remoteFontNames, currentValue]);

    const filtered = useMemo(() => {
        if (!query) return allFonts;
        const q = query.toLowerCase();
        return allFonts.filter(f => f.toLowerCase().includes(q));
    }, [allFonts, query]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (family: string) => {
        // Load currently chosen variant weights
        loadGoogleFont(family, { weights: weightsToLoad, italics: italic, display: 'swap' });
        onChange(family);
        saveRecent(family);
        setOpen(false);
    };

    const toggleWeight = (w: number) => {
        setWeightsToLoad(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w].sort((a, b) => a - b));
    };

    const preloadVariants = (e: React.MouseEvent) => {
        e.stopPropagation();
        loadGoogleFont(currentValue, { weights: weightsToLoad, italics: italic, display: 'swap' });
    };

    return (
        <div className="ae-font-input" ref={containerRef} style={{ position: 'relative' }}>
            <button
                id={id}
                type="button"
                className="ae-font-trigger"
                disabled={disabled}
                title={title}
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    fontFamily: `'${currentValue}', sans-serif`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}
            >
                {currentValue}
                <span style={{ float: 'right', opacity: 0.6 }}>▼</span>
            </button>
            {open && !disabled && (
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
                        {/*<div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {AVAILABLE_WEIGHTS.map(w => (
                                <button
                                    key={w}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); toggleWeight(w); }}
                                    style={{
                                        padding: '2px 4px',
                                        fontSize: 10,
                                        border: '1px solid #555',
                                        background: weightsToLoad.includes(w) ? '#555' : 'transparent',
                                        cursor: 'pointer'
                                    }}
                                    title={`Toggle load weight ${w}`}
                                >{w}</button>
                            ))}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setItalic(i => !i); }}
                                style={{
                                    padding: '2px 6px',
                                    fontSize: 10,
                                    border: '1px solid #555',
                                    background: italic ? '#555' : 'transparent'
                                }}
                                title="Toggle italic variants"
                            >Ital</button>
                            <button
                                type="button"
                                onClick={preloadVariants}
                                style={{
                                    padding: '2px 6px',
                                    fontSize: 10,
                                    border: '1px solid #888',
                                    background: '#333'
                                }}
                                title="Preload selected variants for current font"
                            >Load</button>
                        </div>
                        */}
                        {/*recent.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>Recent:</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {recent.map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleSelect(r); }}
                                            style={{
                                                padding: '2px 6px',
                                                fontSize: 11,
                                                border: '1px solid #444',
                                                background: r === currentValue ? '#333' : 'transparent',
                                                fontFamily: `'${r}', sans-serif`,
                                                cursor: 'pointer'
                                            }}
                                        >{r}</button>
                                    ))}
                                </div>
                            </div>
                        )*/}
                        {fetchError && (
                            <div style={{ marginTop: 6, color: '#e88', fontSize: 10 }}>API: {fetchError}</div>
                        )}
                    </div>
                    <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                        {filtered.map(f => (
                            <div
                                key={f}
                                onClick={() => handleSelect(f)}
                                style={{
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    fontFamily: `'${f}', sans-serif`,
                                    background: f === currentValue ? '#333' : 'transparent',
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
    );
};

export default FontInputRow;
