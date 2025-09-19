import { canonicalize } from './hash';
import { migrate } from './schema';
import { assertValidDocument } from './validate';
import type { DocumentRoot } from './schema';

// Phase 4: Deterministic serialization & deserialization
// serializeDocument: produce canonical JSON string with sorted keys (leverages canonicalize from hash.ts)
// deserializeDocument: parse -> migrate -> validate -> return DocumentRoot

export function serializeDocument(doc: DocumentRoot): string {
    // canonicalize already removes volatile fields (createdAt, modifiedAt) for hashing BUT
    // For persistence we want to keep those fields. So we implement a persistenceStableStringify that keeps them.
    return persistenceStableStringify(doc);
}

// Deterministic stable stringify that:
// 1. Sorts object keys recursively
// 2. Does NOT remove volatile fields (persistence wants full fidelity)
// 3. Produces minified JSON (no whitespace differences)
function persistenceStableStringify(value: any): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map((v) => persistenceStableStringify(v)).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const k of keys) {
        parts.push(JSON.stringify(k) + ':' + persistenceStableStringify(value[k]));
    }
    return '{' + parts.join(',') + '}';
}

export function deserializeDocument(str: string): DocumentRoot {
    let parsed: unknown;
    try {
        parsed = JSON.parse(str);
    } catch (err) {
        throw new Error('Failed to parse document JSON: ' + (err as Error).message);
    }
    const migrated = migrate(parsed);
    // If the incoming doc had a higher schemaVersion, migrate() would already throw.
    // Validate structure after migration.
    assertValidDocument(migrated);
    return migrated;
}

// Helper to compute the canonical hash string of the persisted doc so tests can compare.
// (Exports canonicalize already used in hashing but we re-export for completeness.)
export { canonicalize };
