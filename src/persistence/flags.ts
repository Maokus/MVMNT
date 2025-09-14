/**
 * Feature flag utilities for persistence system.
 * Phase 0: Only SERIALIZATION_V1 is recognized.
 */

export const FEATURE_FLAGS = {
    SERIALIZATION_V1: 'VITE_FEATURE_SERIALIZATION_V1',
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

function readRawFlag(envKey: string): string | undefined {
    // Vite exposes import.meta.env
    // Cast to any to avoid needing a global type augmentation for Phase 0.
    const env: any = (import.meta as any).env || {};
    return env[envKey];
}

/** Boolean-ish coercion: '1', 'true', true => true */
function coerceBoolean(val: any): boolean {
    if (val === true) return true;
    if (typeof val === 'string') {
        const v = val.toLowerCase();
        return v === '1' || v === 'true' || v === 'on' || v === 'yes';
    }
    return false;
}

export function isFeatureEnabled(name: FeatureFlagName): boolean {
    const envKey = FEATURE_FLAGS[name];
    return coerceBoolean(readRawFlag(envKey));
}

export const SERIALIZATION_V1_ENABLED = () => isFeatureEnabled('SERIALIZATION_V1');
