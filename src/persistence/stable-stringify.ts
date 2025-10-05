/**
 * Deterministic JSON serialization with stable object key ordering.
 * Rules:
 *  - Objects: keys sorted lexicographically (ascending, UTF-16 compare) at each level.
 *  - Arrays: order preserved.
 *  - Primitive serialization matches JSON.stringify for supported types.
 *  - Functions / symbols omitted (like JSON.stringify behavior when in objects) or become undefined in arrays.
 *  - BigInt not supported (JSON.stringify throws) -> we mimic same throw for early visibility.
 * NOTE: Cycle detection is intentionally omitted; cyclic input will throw to surface bugs early.
 */
export function serializeStable(value: unknown): string {
    const seen = new Set<any>();
    function encode(v: any): string {
        if (v === null) return 'null';
        const t = typeof v;
        switch (t) {
            case 'number':
                return isFinite(v) ? String(v) : 'null';
            case 'boolean':
                return v ? 'true' : 'false';
            case 'string':
                return JSON.stringify(v); // reuse native string escaping
            case 'bigint':
                // JSON.stringify throws TypeError for BigInt; replicate for consistency.
                throw new TypeError('Cannot serialize BigInt value');
            case 'undefined':
            case 'function':
            case 'symbol':
                return undefined as any; // handled by array/object context
            case 'object':
                if (seen.has(v)) {
                    throw new TypeError('Converting circular structure to JSON (stable)');
                }
                seen.add(v);
                if (Array.isArray(v)) {
                    const items = v.map((item) => {
                        const enc = encode(item);
                        return enc === undefined ? 'null' : enc; // JSON.stringify converts unsupported in arrays to null
                    });
                    return '[' + items.join(',') + ']';
                }
                // Plain object
                const keys = Object.keys(v).sort();
                const parts: string[] = [];
                for (const k of keys) {
                    const enc = encode(v[k]);
                    if (enc !== undefined) {
                        parts.push(JSON.stringify(k) + ':' + enc);
                    }
                }
                return '{' + parts.join(',') + '}';
            default:
                return 'null';
        }
    }
    return encode(value);
}

/** Convenience helper for tests to compare structural equality via stable JSON. */
export function stableEqual(a: unknown, b: unknown): boolean {
    try {
        return serializeStable(a) === serializeStable(b);
    } catch {
        return false;
    }
}
