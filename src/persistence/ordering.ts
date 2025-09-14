/**
 * Phase 0 placeholder for canonical element ordering.
 * Phase 1 will implement: sort by (z ASC, type ASC, id ASC).
 */

export interface CanonicalElementLike {
    id: string;
    type?: string;
    z?: number;
    // Other fields ignored for ordering in Phase 0.
}

/**
 * Placeholder: returns a shallow copy of input array (non-mutating).
 */
export function canonicalizeElements<T extends CanonicalElementLike>(elements: readonly T[]): T[] {
    return [...elements];
}
