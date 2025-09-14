/**
 * Canonical element ordering (Phase 1 implementation).
 * Sort priority: (z ASC, type ASC, id ASC). Missing values are treated as follows:
 *  - z: missing -> +Infinity (pushes unspecified z to end preserving relative order via stable sort fallback)
 *  - type: missing -> '' (empty string sorts before named types, but z dominates earlier)
 *  - id: required (if somehow undefined it is treated as '')
 * Non-mutating: returns a new array.
 */
export interface CanonicalElementLike {
    id: string;
    type?: string;
    z?: number;
}

function safeZ(z: number | undefined): number {
    return typeof z === 'number' && isFinite(z) ? z : Number.POSITIVE_INFINITY;
}

export function canonicalizeElements<T extends CanonicalElementLike>(elements: readonly T[]): T[] {
    // Copy first to avoid mutating caller array.
    const arr = [...elements];
    // Use Array.prototype.sort (not guaranteed stable < ES2019, but modern engines including Vite targets are stable).
    // If absolute stability across older runtimes needed, implement a decorate-sort-undecorate; skipped for now.
    arr.sort((a, b) => {
        const za = safeZ(a.z);
        const zb = safeZ(b.z);
        if (za !== zb) return za - zb;
        const ta = a.type || '';
        const tb = b.type || '';
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        const ia = a.id || '';
        const ib = b.id || '';
        if (ia < ib) return -1;
        if (ia > ib) return 1;
        return 0;
    });
    return arr;
}

/** Convenience helper for tests: returns true if already canonical order. */
export function isCanonicalOrder<T extends CanonicalElementLike>(elements: readonly T[]): boolean {
    for (let i = 1; i < elements.length; i++) {
        const prev = elements[i - 1];
        const curr = elements[i];
        const cmp = canonicalizeElements([prev, curr]);
        if (cmp[0] !== prev) return false; // if sorting the pair swaps them, order not canonical
    }
    return true;
}
