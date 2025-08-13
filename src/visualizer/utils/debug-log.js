// Lightweight debug logging utility shared by TS/JS files
export function isDebugEnabled() {
    try {
        if (typeof window !== 'undefined') {
            if (window.VIS_DEBUG === true) return true;
            const stored = window.localStorage?.getItem?.('VIS_DEBUG');
            if (stored === '1' || stored === 'true') return true;
        }
    } catch {}
    // Allow opting in via env at build time
    try {
        // Vite style (ESM). Wrap in try in case of older environments.
        // @ts-ignore
        const e = import.meta.env;
        if (e && (e.VITE_VERBOSE_LOGS === 'true' || e.REACT_APP_VERBOSE_LOGS === 'true')) return true;
    } catch {}
    if (typeof process !== 'undefined' && process.env?.REACT_APP_VERBOSE_LOGS === 'true') return true;
    return false;
}

export function debugLog(...args) {
    if (isDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log(...args);
    }
}
