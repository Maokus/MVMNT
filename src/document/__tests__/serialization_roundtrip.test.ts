import { describe, it, expect } from 'vitest';
import { createEmptyDocument, SCHEMA_VERSION } from '../schema';
import { serializeDocument, deserializeDocument } from '../serialize';
import { computeStructuralHash } from '../hash';

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
}

describe('Serialization & Deserialization', () => {
    it('round-trip preserves structural hash', () => {
        const doc = createEmptyDocument();
        const hashBefore = computeStructuralHash(doc);
        const str = serializeDocument(doc);
        const loaded = deserializeDocument(str);
        const hashAfter = computeStructuralHash(loaded);
        expect(hashAfter).toBe(hashBefore);
    });

    it('modifying non-volatile field changes serialized string', () => {
        const doc = createEmptyDocument();
        const s1 = serializeDocument(doc);
        doc.meta.name = 'Project X';
        const s2 = serializeDocument(doc);
        expect(s2).not.toBe(s1);
    });

    it('createdAt / modifiedAt differences do not change structural hash but affect serialized string', () => {
        const doc1 = createEmptyDocument();
        const doc2 = clone(doc1);
        doc2.modifiedAt = doc1.modifiedAt + 1000;
        const hash1 = computeStructuralHash(doc1);
        const hash2 = computeStructuralHash(doc2);
        expect(hash1).toBe(hash2);
        const ser1 = serializeDocument(doc1);
        const ser2 = serializeDocument(doc2);
        expect(ser1).not.toBe(ser2);
    });

    it('future schema version rejection', () => {
        const doc = createEmptyDocument();
        const parsed: any = JSON.parse(serializeDocument(doc));
        parsed.schemaVersion = SCHEMA_VERSION + 10;
        const strFuture = JSON.stringify(parsed);
        expect(() => deserializeDocument(strFuture)).toThrow(/Unsupported future schemaVersion/);
    });

    it('deterministic key ordering', () => {
        const doc = createEmptyDocument();
        doc.elements.byId['b'] = { id: 'b', name: 'B', start: 0, duration: 10 } as any;
        doc.elements.allIds.push('b');
        doc.elements.byId['a'] = { id: 'a', name: 'A', start: 5, duration: 20 } as any;
        doc.elements.allIds.push('a');
        const s1 = serializeDocument(doc);
        const s2 = serializeDocument(doc);
        expect(s2).toBe(s1);
        const parsed: any = JSON.parse(s1);
        const keys = Object.keys(parsed.elements.byId);
        expect(keys).toEqual(['a', 'b']);
    });
});
