const env = (import.meta as any)?.env ?? {};

function normalizeBoolean(raw: unknown, fallback: boolean): boolean {
    if (raw === undefined || raw === null) return fallback;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function normalizeNumber(raw: unknown, fallback: number): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

const sceneStoreUiRaw = import.meta.env.VITE_ENABLE_SCENE_STORE_UI ?? env.VITE_SCENE_STORE_UI ?? env.SCENE_STORE_UI;

export const enableSceneStoreUI = normalizeBoolean(sceneStoreUiRaw, false);

const sceneStoreMacrosRaw =
    import.meta.env.VITE_ENABLE_SCENE_STORE_MACROS ?? env.VITE_SCENE_STORE_MACROS ?? env.SCENE_STORE_MACROS;
export const enableSceneStoreMacros = normalizeBoolean(sceneStoreMacrosRaw, enableSceneStoreUI);

const dualWriteRaw = import.meta.env.VITE_ENABLE_SCENE_STORE_DUAL_WRITE ?? env.SCENE_STORE_DUAL_WRITE;
export const enableSceneStoreDualWrite = normalizeBoolean(dualWriteRaw, true);

const runtimeAdapterRaw =
    import.meta.env.VITE_ENABLE_SCENE_RUNTIME_ADAPTER ?? env.VITE_SCENE_RUNTIME_ADAPTER ?? env.SCENE_RUNTIME_ADAPTER;
export const enableSceneRuntimeAdapter = normalizeBoolean(runtimeAdapterRaw, false);

export type SceneParityMode = 'strict' | 'monitor' | 'off';

function normalizeParityMode(raw: unknown): SceneParityMode {
    if (typeof raw === 'string') {
        const value = raw.trim().toLowerCase();
        if (value === 'strict' || value === 'monitor' || value === 'off') return value;
    }
    return env?.DEV ? 'strict' : 'monitor';
}

const parityModeRaw = env.VITE_SCENE_PARITY_MODE ?? env.SCENE_PARITY_MODE;
export const sceneParityMode: SceneParityMode = normalizeParityMode(parityModeRaw);

const sampleRateRaw = env.VITE_SCENE_PARITY_SAMPLE_RATE ?? env.SCENE_PARITY_SAMPLE_RATE;
const defaultSample = env?.DEV ? 1 : 0.1;
export const sceneParitySampleRate = Math.min(1, Math.max(0, normalizeNumber(sampleRateRaw, defaultSample)));

const telemetryRaw = env.VITE_SCENE_PARITY_TELEMETRY ?? env.SCENE_PARITY_TELEMETRY;
export const enableSceneParityTelemetry = normalizeBoolean(telemetryRaw, true);
