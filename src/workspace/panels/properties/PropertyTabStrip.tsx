import React, { useState, useRef, useEffect } from 'react';
import { PropertyTab } from '@core/types';

export interface OverflowAction {
    label: string;
    onActivate: () => void;
    disabled?: boolean;
    dividerBefore?: boolean;
}

interface PropertyTabStripProps {
    tabs: PropertyTab[];
    activeTabId: string;
    onTabChange: (id: string) => void;
    overflowActions?: OverflowAction[];
    onSearch?: () => void;
}

const PropertyTabStrip: React.FC<PropertyTabStripProps> = ({
    tabs,
    activeTabId,
    onTabChange,
    overflowActions,
    onSearch,
}) => {
    const [overflowOpen, setOverflowOpen] = useState(false);
    const overflowWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!overflowOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            if (overflowWrapRef.current && !overflowWrapRef.current.contains(e.target as Node)) {
                setOverflowOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOverflowOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [overflowOpen]);

    const hasOverflow = overflowActions && overflowActions.length > 0;

    return (
        <div className="ae-tab-strip">
            <div className="ae-tab-scroll">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`ae-tab${tab.id === activeTabId ? ' ae-tab--active' : ''}`}
                        onClick={() => onTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="ae-tab-strip-actions">
                {hasOverflow && (
                    <div ref={overflowWrapRef} className="relative">
                        <button
                            type="button"
                            className="ae-overflow-btn"
                            onClick={() => setOverflowOpen((o) => !o)}
                            title="More actions"
                        >
                            ···
                        </button>
                        {overflowOpen && (
                            <div className="ae-overflow-menu">
                                <div className="ae-overflow-options">
                                    {overflowActions!.map((action) => (
                                        <React.Fragment key={action.label}>
                                            {action.dividerBefore && <div className="ae-overflow-divider" />}
                                            <button
                                                type="button"
                                                className="ae-overflow-option"
                                                disabled={action.disabled}
                                                onClick={() => {
                                                    if (!action.disabled) {
                                                        setOverflowOpen(false);
                                                        action.onActivate();
                                                    }
                                                }}
                                            >
                                                {action.label}
                                            </button>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {onSearch && (
                    <button
                        type="button"
                        className="ae-search-btn"
                        onClick={onSearch}
                        title="Search properties (⌘F)"
                    >
                        ⌕
                    </button>
                )}
            </div>
        </div>
    );
};

export default PropertyTabStrip;
