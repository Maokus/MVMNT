import React from 'react';
import { getTransportCoordinator } from '@core/transport-coordinator';

export const TransportStatusDev: React.FC = () => {
    if (process.env.NODE_ENV === 'production') return null;
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => {
        const tc = getTransportCoordinator();
        const unsub = tc.subscribe(() => force());
        return () => { unsub(); };
    }, []);
    const tc = getTransportCoordinator();
    const s = tc.getState();
    return (
        <div style={{ position: 'fixed', bottom: 4, right: 4, background: 'rgba(0,0,0,0.55)', color: '#0f0', fontSize: 11, padding: '4px 6px', fontFamily: 'monospace', borderRadius: 4, zIndex: 9999 }}>
            T:{s.mode} [{s.source}] tick:{s.lastDerivedTick}
        </div>
    );
};
