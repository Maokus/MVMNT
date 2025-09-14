/**
 * Phase 0 validation stub. Real validation logic arrives in Phase 1.
 */
export interface ValidationResult {
    ok: boolean;
    errors: { message: string }[];
    warnings: { message: string }[];
}

export function validateSceneEnvelope(_data: unknown): ValidationResult {
    return { ok: true, errors: [], warnings: [] };
}
