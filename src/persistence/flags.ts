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
    const raw = readRawFlag(envKey);
    // In test environments default to enabled to allow persistence tests to exercise implementation
    // without requiring explicit flag wiring in the test runner environment variables.
    // Detect test via common conventions (import.meta.env.MODE or NODE_ENV injected by Vite/Vitest).
    const mode: any = (import.meta as any).env?.MODE || (import.meta as any).env?.NODE_ENV;
    const isTest = typeof mode === 'string' && mode.toLowerCase() === 'test';
    if (raw == null && isTest && name === 'SERIALIZATION_V1') return true;
    return coerceBoolean(raw);
}

export const SERIALIZATION_V1_ENABLED = () => isFeatureEnabled('SERIALIZATION_V1');
