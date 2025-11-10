const DEFAULT_FLAGS: Record<string, boolean> = {};

function readWindowOverride(flag: string): boolean | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    const overrides = (window as any).__MVMNT_FLAGS__;
    if (overrides && typeof overrides === 'object') {
        const value = overrides[flag];
        if (typeof value === 'boolean') {
            return value;
        }
    }
    return undefined;
}

function readEnvOverride(flag: string): boolean | undefined {
    try {
        const env = (import.meta as any)?.env as Record<string, unknown> | undefined;
        if (!env) return undefined;
        const key = `VITE_FLAG_${flag.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
        const raw = env[key];
        if (typeof raw === 'boolean') {
            return raw;
        }
        if (typeof raw === 'string') {
            const normalized = raw.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1') return true;
            if (normalized === 'false' || normalized === '0') return false;
        }
    } catch {
        /* ignore */
    }
    return undefined;
}

export function isFeatureEnabled(flag: string): boolean {
    const windowOverride = readWindowOverride(flag);
    if (windowOverride !== undefined) {
        return windowOverride;
    }
    const envOverride = readEnvOverride(flag);
    if (envOverride !== undefined) {
        return envOverride;
    }
    return DEFAULT_FLAGS[flag] ?? false;
}

export function enableFeatureForSession(flag: string, value: boolean): void {
    if (typeof window === 'undefined') {
        return;
    }
    const overrides = ((window as any).__MVMNT_FLAGS__ ?? {}) as Record<string, boolean>;
    overrides[flag] = value;
    (window as any).__MVMNT_FLAGS__ = overrides;
}
