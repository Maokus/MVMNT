const GLOBAL_FLAG = '__MVMNT_CANVAS_RENDERER__';

function readBooleanOverride(value: unknown): boolean | null {
    if (value === 'enable' || value === true || value === 'true' || value === 1 || value === '1') {
        return true;
    }
    if (value === 'disable' || value === false || value === 'false' || value === 0 || value === '0') {
        return false;
    }
    return null;
}

export function isCanvasRendererAllowed(): boolean {
    if (typeof globalThis !== 'undefined' && globalThis) {
        const override = (globalThis as Record<string, unknown>)[GLOBAL_FLAG];
        const coerced = readBooleanOverride(override);
        if (coerced != null) {
            return coerced;
        }
    }

    try {
        const meta = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
        const envOverride = readBooleanOverride(meta.VITE_ENABLE_CANVAS_RENDERER);
        if (envOverride != null) {
            return envOverride;
        }
        if (typeof meta.DEV === 'boolean') {
            return meta.DEV;
        }
    } catch {
        // ignore: import.meta may not be defined in non-browser contexts
    }

    if (typeof process !== 'undefined' && process?.env) {
        const envOverride = readBooleanOverride(process.env.MVMNT_ENABLE_CANVAS_RENDERER);
        if (envOverride != null) {
            return envOverride;
        }
        if (typeof process.env.NODE_ENV === 'string') {
            return process.env.NODE_ENV !== 'production';
        }
    }

    return false;
}

export function setCanvasRendererOverride(value: 'enable' | 'disable' | null): void {
    if (typeof globalThis === 'undefined' || !globalThis) return;
    const target = globalThis as Record<string, unknown>;
    if (value == null) {
        delete target[GLOBAL_FLAG];
    } else {
        target[GLOBAL_FLAG] = value;
    }
}
