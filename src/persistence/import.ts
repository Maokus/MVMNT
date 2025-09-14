import { SERIALIZATION_V1_ENABLED } from './flags';

export interface ImportError {
    message: string;
}

export interface ImportResultDisabled {
    ok: false;
    disabled: true;
    reason: 'feature-disabled';
    errors: ImportError[];
}

export interface ImportResultPlaceholder {
    ok: true;
    disabled: false;
    errors: [];
}

export type ImportSceneResult = ImportResultDisabled | ImportResultPlaceholder;

/**
 * Phase 0 importer: validates nothing, does not mutate store (no dependency yet).
 */
export function importScene(_json: string): ImportSceneResult {
    if (!SERIALIZATION_V1_ENABLED()) {
        return {
            ok: false,
            disabled: true,
            reason: 'feature-disabled',
            errors: [{ message: 'Serialization feature disabled' }],
        };
    }
    // Placeholder: parse just to ensure not throwing silently (ignore result)
    try {
        JSON.parse(_json);
    } catch (e: any) {
        return { ok: false, disabled: false, errors: [{ message: 'Invalid JSON: ' + e.message }] } as any; // Will refine in Phase 1/2
    }
    return { ok: true, disabled: false, errors: [] };
}
