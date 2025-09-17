import { describe, it, expect } from 'vitest';
import { serializeDocument, deserializeDocument, DOCUMENT_SCHEMA_VERSION } from '../document-serializer';
import { useDocumentStore } from '../../state/document/documentStore';

describe('Phase 3 Document Serializer', () => {
    it('serialize produces versioned envelope JSON', () => {
        const doc = useDocumentStore.getState().getSnapshot();
        const json = serializeDocument(doc);
        const parsed = JSON.parse(json);
        expect(parsed.version).toBe(DOCUMENT_SCHEMA_VERSION);
        expect(parsed.doc).toBeTruthy();
        expect(parsed.doc.timeline).toBeTruthy();
    });

    it('deserialize accepts envelope and returns doc shape', () => {
        const doc = useDocumentStore.getState().getSnapshot();
        const json = serializeDocument(doc);
        const round = deserializeDocument(json);
        expect(round.timeline.timeline.id).toBe(doc.timeline.timeline.id);
    });

    it('deserialize tolerates raw document JSON without envelope', () => {
        const doc = useDocumentStore.getState().getSnapshot();
        const json = JSON.stringify({
            ...doc,
            timeline: { ...doc.timeline, timeline: { ...doc.timeline.timeline, currentTick: 999 } },
        });
        const parsed = deserializeDocument(json);
        expect(parsed.timeline.timeline.currentTick).toBe(999);
    });

    it('unknown fields are stripped during deserialize', () => {
        const doc = useDocumentStore.getState().getSnapshot();
        const withUi = {
            version: DOCUMENT_SCHEMA_VERSION,
            doc: {
                ...doc,
                uiOnlyFoo: 'bar',
                timeline: { ...doc.timeline, uiZoomLevel: 1.5 },
            } as any,
        };
        const parsed = deserializeDocument(JSON.stringify(withUi));
        expect((parsed as any).uiOnlyFoo).toBeUndefined();
        expect((parsed.timeline as any).uiZoomLevel).toBeUndefined();
    });
});
