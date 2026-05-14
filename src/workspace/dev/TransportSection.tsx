import React from 'react';
import { Section } from './Section';

type TransportState = {
    mode?: string;
    source?: string;
    lastDerivedTick?: number;
};

type TransportSectionProps = {
    open: boolean;
    onToggle: () => void;
    transportState: TransportState;
};

export const TransportSection: React.FC<TransportSectionProps> = ({ open, onToggle, transportState }) => (
    <Section title="Transport" open={open} onToggle={onToggle}>
        <div>
            Mode:{' '}
            <span style={{ color: '#4ade80' }}>
                {transportState.mode ?? '—'}
            </span>
        </div>
        <div>
            Source: <span>{transportState.source ?? '—'}</span>
        </div>
        <div>
            Tick: <span>{transportState.lastDerivedTick ?? '—'}</span>
        </div>
    </Section>
);
