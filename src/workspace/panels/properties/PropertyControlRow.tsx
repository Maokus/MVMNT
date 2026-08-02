import React from 'react';

interface PropertyControlRowProps {
    label: string;
    description?: string;
    animationControl?: React.ReactNode;
    macroControl?: React.ReactNode;
    nested?: boolean;
    delinked?: boolean;
    className?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    children: React.ReactNode;
}

export function PropertyControlRow({
    label,
    description,
    animationControl,
    macroControl,
    nested = false,
    delinked = false,
    className = '',
    onMouseEnter,
    onMouseLeave,
    children,
}: PropertyControlRowProps) {
    return (
        <div
            className={`ae-property-row${nested ? ' ae-property-row-nested' : ''}${delinked ? ' ae-property-delinked' : ''}${className ? ` ${className}` : ''}`}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="ae-property-label">
                <span className="ae-property-animation-slot">{animationControl}</span>
                <span className="ae-property-name" title={description}>
                    {label}
                </span>
            </div>
            <div className="ae-property-controls">
                {macroControl}
                <div className="ae-property-input">{children}</div>
            </div>
        </div>
    );
}
