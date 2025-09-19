import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../schema';
import { validateDocument, assertValidDocument } from '../validate';

describe('Document Validation', () => {
    it('Valid empty document passes with no errors', () => {
        const doc = createEmptyDocument();
        const errs = validateDocument(doc);
        expect(errs.length).toBe(0);
        expect(() => assertValidDocument(doc)).not.toThrow();
    });

    it('Duplicate element ID detected', () => {
        const doc = createEmptyDocument();
        const el = { id: 'e1', name: 'Elem', start: 0, duration: 100 } as any;
        doc.elements.byId['e1'] = el;
        doc.elements.byId['e2'] = { ...el, id: 'e1' } as any; // mismatched key with duplicate id
        doc.elements.allIds.push('e1', 'e2');
        const errs = validateDocument(doc);
        const dupErr = errs.find((e) => e.message.toLowerCase().includes('duplicate element id'));
        expect(dupErr).toBeTruthy();
    });

    it('Track referencing missing element produces error', () => {
        const doc = createEmptyDocument();
        doc.tracks.byId['t1'] = { id: 't1', name: 'Track 1', elementIds: ['missing'] } as any;
        doc.tracks.allIds.push('t1');
        const errs = validateDocument(doc);
        const refErr = errs.find((e) => e.message.includes("Missing referenced element 'missing'"));
        expect(refErr).toBeTruthy();
    });

    it('Element with negative start and non-positive duration yields errors', () => {
        const doc = createEmptyDocument();
        const bad = { id: 'e1', name: 'Elem', start: -10, duration: 0 } as any;
        doc.elements.byId['e1'] = bad;
        doc.elements.allIds.push('e1');
        const errs = validateDocument(doc);
        expect(errs.some((e) => e.path.endsWith('.start'))).toBe(true);
        expect(errs.some((e) => e.path.endsWith('.duration'))).toBe(true);
    });

    it('assertValidDocument throws with aggregated message', () => {
        const doc = createEmptyDocument();
        const bad = { id: 'e1', name: '', start: 0, duration: 10 } as any;
        doc.elements.byId['e1'] = bad;
        doc.elements.allIds.push('e1');
        expect(() => assertValidDocument(doc)).toThrow(/validation failed/i);
    });
});
