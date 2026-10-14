import React from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';

export function MultiSelectionPropertySearch({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="ae-search-bar ae-multi-selection-search">
            <FaSearch className="ae-search-leading-icon" aria-hidden="true" />
            <input
                className="ae-search-input"
                type="search"
                aria-label="Search selected properties"
                placeholder="Search selected properties…"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
            {value ? (
                <button
                    type="button"
                    className="ae-search-close"
                    onClick={() => onChange('')}
                    title="Clear property search"
                    aria-label="Clear property search"
                >
                    <FaTimes aria-hidden="true" />
                </button>
            ) : null}
        </div>
    );
}
