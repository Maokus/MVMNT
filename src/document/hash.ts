import type { DocumentRoot } from './schema';

// Compute a deterministic structural hash (simple, not cryptographic) by:
// 1. Producing a canonical JSON string with sorted object keys.
// 2. Omitting volatile timestamp fields (createdAt, modifiedAt).
// 3. Applying a fast FNV-1a 32-bit style hash over the canonical string.
// NOTE: Collisions are acceptable at this early stage; upgrade later if needed.

export function computeStructuralHash(doc: DocumentRoot): string {
    const canonical = canonicalize(doc);
    return fnv1a32(canonical);
}

export function canonicalize(doc: DocumentRoot): string {
    const replacer = (key: string, value: any) => {
        if (key === 'createdAt' || key === 'modifiedAt') return undefined; // omit volatile
        return value;
    };
    const normalized = JSON.parse(JSON.stringify(doc, replacer));
    return stableStringify(normalized);
}

function stableStringify(value: any): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        const items = value.map((v) => stableStringify(v));
        return `[${items.join(',')}]`;
    }
    // Object: sort keys
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const k of keys) {
        parts.push(`${JSON.stringify(k)}:${stableStringify(value[k])}`);
    }
    return `{${parts.join(',')}}`;
}

function fnv1a32(str: string): string {
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0; // * FNV prime 16777619
    }
    return hash.toString(16).padStart(8, '0');
}
