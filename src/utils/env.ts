export function isTestEnvironment(): boolean {
    if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
        const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
        if (nodeEnv === 'test') return true;
        if (process.env.VITEST === 'true') return true;
        if (process.env.JEST_WORKER_ID !== undefined) return true;
    }
    if (typeof import.meta !== 'undefined') {
        const meta = import.meta as any;
        if (meta?.vitest) return true;
        const env = meta?.env;
        if (env?.MODE === 'test') return true;
        if (env?.VITEST === 'true') return true;
    }
    return false;
}
