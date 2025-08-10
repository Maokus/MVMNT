// Lightweight debug logging utility shared by TS/JS files
export function isDebugEnabled() {
    try {
        if (typeof window !== 'undefined') {
            if (window.VIS_DEBUG === true) return true;
            const stored = window.localStorage?.getItem?.('VIS_DEBUG');
            if (stored === '1' || stored === 'true') return true;
        }
    } catch { }
    // Allow opting in via env at build time
    return process.env.REACT_APP_VERBOSE_LOGS === 'true';
}

export function debugLog(...args) {
    if (isDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log(...args);
    }
}
