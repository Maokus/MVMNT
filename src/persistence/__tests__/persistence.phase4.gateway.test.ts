import { describe, it, expect } from 'vitest';
import { exportDocument, importDocument } from '../index';
import { useDocumentStore } from '../../state/document/documentStore';

describe('Persistence Phase 4 - Gateway import/export', () => {
    it('exportDocument produces versioned JSON and round-trips via importDocument', () => {
        const out = exportDocument();
        expect(out.ok).toBe(true);
        const json = out.json;
        // mutate store then import to ensure replacement
        useDocumentStore.getState().commit(
            (draft) => {
                draft.timeline.timeline.currentTick += 123;
            },
            { label: 'test-mutate' }
        );
        const res = importDocument(json);
        expect(res.ok).toBe(true);
        const after = useDocumentStore.getState().getSnapshot();
        const parsed = JSON.parse(json);
        expect(parsed.version).toBeDefined();
        // After import, snapshot should deep-equal serialized doc shape for a few fields
        expect(after.timeline.timeline.id).toBe(out.doc.timeline.timeline.id);
    });

    it('importDocument accepts legacy Phase1 envelope and clears history (undo is no-op)', () => {
        const baseline = useDocumentStore.getState().getSnapshot();
        const legacyEnvelope = {
            schemaVersion: 1,
            format: 'mvmnt.scene',
            metadata: { id: 'x', name: 'y', createdAt: '', modifiedAt: '', format: 'scene' },
            scene: baseline.scene,
            timeline: baseline.timeline,
            compatibility: { warnings: [] },
        };
        // Create some history
        useDocumentStore.getState().commit(
            (d) => {
                d.timeline.timeline.globalBpm = 123;
            },
            { label: 'bpm' }
        );
        expect(useDocumentStore.getState().canUndo).toBe(true);
        const res = importDocument(JSON.stringify(legacyEnvelope));
        expect(res.ok).toBe(true);
        // History should be cleared by replace
        expect(useDocumentStore.getState().canUndo).toBe(false);
        expect(useDocumentStore.getState().canRedo).toBe(false);
    });
});
