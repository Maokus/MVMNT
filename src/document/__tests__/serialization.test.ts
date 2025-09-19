/// <reference types="vitest" />
import { createEmptyDocument } from '../schema';
import { serializeDocument, deserializeDocument } from '../serialize';
import { computeStructuralHash } from '../hash';
import { SCHEMA_VERSION } from '../schema';

// Utility to deep clone via JSON
function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
}

describe('Phase 4 Serialization', () => {
    test('round-trip preserves structural hash', () => {
        const doc = createEmptyDocument();
        const hashBefore = computeStructuralHash(doc);
        const str = serializeDocument(doc);
        const loaded = deserializeDocument(str);
        const hashAfter = computeStructuralHash(loaded);
        expect(hashAfter).toBe(hashBefore);
    });

    test('modifying non-volatile field changes serialized string', () => {
        const doc = createEmptyDocument();
        const s1 = serializeDocument(doc);
        // Change a meta field
        doc.meta.name = 'Project X';
        const s2 = serializeDocument(doc);
        expect(s2).not.toBe(s1);
    });

    test('createdAt / modifiedAt differences do not break structural hash but do change serialized string', () => {
        const doc1 = createEmptyDocument();
        const doc2 = clone(doc1);
        // simulate time passing
        doc2.modifiedAt = doc1.modifiedAt + 1000;
        const hash1 = computeStructuralHash(doc1);
        const hash2 = computeStructuralHash(doc2);
        expect(hash1).toBe(hash2); // timestamps omitted from hash
        const ser1 = serializeDocument(doc1);
        const ser2 = serializeDocument(doc2);
        expect(ser1).not.toBe(ser2); // but persistence includes timestamps
    });

    test('future schema version rejection', () => {
        const doc = createEmptyDocument();
        const parsed: any = JSON.parse(serializeDocument(doc));
        parsed.schemaVersion = SCHEMA_VERSION + 10; // future
        const strFuture = JSON.stringify(parsed);
        expect(() => deserializeDocument(strFuture)).toThrow(/Unsupported future schemaVersion/);
    });

    test('serialized output deterministic key ordering', () => {
        const doc = createEmptyDocument();
        // Add two elements/tracks in non-sorted insertion order to test key sorting
        doc.elements.byId['b'] = { id: 'b', name: 'B', start: 0, duration: 10 };
        doc.elements.allIds.push('b');
        doc.elements.byId['a'] = { id: 'a', name: 'A', start: 5, duration: 20 };
        doc.elements.allIds.push('a');
        const s1 = serializeDocument(doc);
        const s2 = serializeDocument(doc); // second call for deterministic check
        expect(s2).toBe(s1);
        // Parse JSON to inspect ordering indirectly by reconstructing expected stable object string for elements.byId
        const parsed: any = JSON.parse(s1);
        // elements.byId should have keys sorted alphabetically -> ['a','b']
        const keys = Object.keys(parsed.elements.byId);
        expect(keys).toEqual(['a', 'b']);
    });
});
