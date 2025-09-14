/**
 * Phase 0 placeholder for stable serialization.
 * Phase 1 will implement deterministic key ordering.
 */

export function serializeStable(value: unknown): string {
    // Non-stable placeholder: JSON.stringify direct.
    // Acceptable for Phase 0; tests rely only on non-crashing behavior.
    return JSON.stringify(value);
}
