// Lightweight debug logging utility shared by TS/JS files
export function isDebugEnabled(): boolean {
    try {
        if (typeof window !== 'undefined') {
            // @ts-ignore runtime injected flag
            if ((window as any).VIS_DEBUG === true) return true;
            const stored = window.localStorage?.getItem?.('VIS_DEBUG');
            if (stored === '1' || stored === 'true') return true;
        }
    } catch {}
    try {
        // Vite style env access
        // @ts-ignore
        const e = import.meta.env as any;
        if (e && (e.VITE_VERBOSE_LOGS === 'true' || e.REACT_APP_VERBOSE_LOGS === 'true')) return true;
    } catch {}
    if (typeof process !== 'undefined' && (process as any).env?.REACT_APP_VERBOSE_LOGS === 'true') return true;
    return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debugLog(...args: any[]) {
    if (isDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log(...args);
    }
}
