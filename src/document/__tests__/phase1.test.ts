import { describe, it, expect } from 'vitest';
import { createEmptyDocument, migrate, SCHEMA_VERSION, DocumentRoot } from '../schema';
import { computeStructuralHash, canonicalize } from '../hash';

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
}

describe('Phase 1 - Schema & Structural Hash', () => {
    it('migrate(createEmptyDocument()) is idempotent (hash unchanged)', () => {
        const doc = createEmptyDocument();
        const migrated = migrate(doc);
        const h1 = computeStructuralHash(doc);
        const h2 = computeStructuralHash(migrated);
        expect(h2).toBe(h1);
    });

    it('Two fresh empty documents share same hash & canonical string (ignoring timestamps)', () => {
        const d1 = createEmptyDocument();
        const d2 = createEmptyDocument();
        const c1 = canonicalize(d1);
        const c2 = canonicalize(d2);
        expect(c1).toBe(c2);
        expect(computeStructuralHash(d1)).toBe(computeStructuralHash(d2));
    });

    it('Changing a non-ignored field changes the hash', () => {
        const doc = createEmptyDocument();
        const h1 = computeStructuralHash(doc);
        // Add an element
        const migrated = migrate({
            ...doc,
            elements: { byId: { e1: { id: 'e1', name: 'Elem', start: 0, duration: 500 } }, allIds: ['e1'] },
        });
        const h2 = computeStructuralHash(migrated);
        expect(h2).not.toBe(h1);
    });

    it('Modifying volatile timestamp fields alone does not change hash', () => {
        const doc = createEmptyDocument();
        const h1 = computeStructuralHash(doc);
        const modified: DocumentRoot = {
            ...clone(doc),
            createdAt: doc.createdAt + 1000,
            modifiedAt: doc.modifiedAt + 5000,
        };
        const h2 = computeStructuralHash(modified);
        expect(h2).toBe(h1);
    });

    it('Future schema version in migrate throws', () => {
        expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 10 })).toThrow();
    });
});
