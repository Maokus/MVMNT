import React from 'react';

export type SectionProps = {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    subtitle?: string;
};

export const Section: React.FC<SectionProps> = ({ title, open, onToggle, subtitle, children }) => (
    <div style={{ marginBottom: 12 }}>
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(30, 41, 59, 0.9)',
                color: '#e2e8f0',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                cursor: 'pointer',
            }}
        >
            <span>{title}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {subtitle ? <span style={{ opacity: 0.6, fontSize: 10 }}>{subtitle}</span> : null}
                <span style={{ fontSize: 12 }}>{open ? '▾' : '▸'}</span>
            </span>
        </button>
        {open ? <div style={{ marginTop: 6, padding: '0 2px' }}>{children}</div> : null}
    </div>
);

export type CollapsibleCardProps = {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    subtitle?: string;
};

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
    title,
    open,
    onToggle,
    subtitle,
    children,
}) => (
    <div
        style={{
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: 8,
            background: 'rgba(30, 41, 59, 0.55)',
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.25)',
        }}
    >
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                fontSize: 12,
                color: '#e2e8f0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
            }}
        >
            <span style={{ fontWeight: 600 }}>{title}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                {subtitle ? <span style={{ opacity: 0.65 }}>{subtitle}</span> : null}
                <span>{open ? '▾' : '▸'}</span>
            </span>
        </button>
        {open ? (
            <div style={{ padding: '10px 12px 12px 12px', borderTop: '1px solid rgba(148, 163, 184, 0.25)' }}>
                {children}
            </div>
        ) : null}
    </div>
);
