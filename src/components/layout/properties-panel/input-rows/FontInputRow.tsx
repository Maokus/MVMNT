import React, { useEffect, useMemo, useState, useRef } from 'react';
import { GOOGLE_FONTS } from '../../../../utils/google-fonts-list';
import { ensureFontLoaded } from '../../../../utils/font-loader';

interface FontInputRowProps {
    id: string;
    value: string;
    schema: any; // expects { default }
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const FontInputRow: React.FC<FontInputRowProps> = ({ id, value, schema, disabled, title, onChange }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement | null>(null);

    const currentValue = value || schema.default || 'Arial';

    useEffect(() => {
        ensureFontLoaded(currentValue);
    }, [currentValue]);

    const allFonts = useMemo(() => {
        const base = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'];
        const merged = Array.from(new Set([...base, ...GOOGLE_FONTS, currentValue]));
        return merged;
    }, [currentValue]);

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
        ensureFontLoaded(family);
        onChange(family);
        setOpen(false);
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
                    <div style={{ padding: 4 }}>
                        <input
                            autoFocus
                            placeholder="Search fonts..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {filtered.map(f => (
                            <div
                                key={f}
                                onClick={() => handleSelect(f)}
                                style={{
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    fontFamily: `'${f}', sans-serif`,
                                    background: f === currentValue ? '#333' : 'transparent'
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
