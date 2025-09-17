import { describe, it, expect } from 'vitest';
import { createDocumentGateway } from '../document/gateway';
import type { Patch } from 'immer';

describe('Phase 3 Document Gateway', () => {
    it('snapshot returns read-only clone (mutation throws) and store unaffected', () => {
        const gw = createDocumentGateway();
        const snap = gw.snapshot();
        // Try to mutate snapshot; should not affect store state
        const beforeId = snap.timeline.timeline.id;
        let threw = false;
        try {
            (snap.timeline.timeline as any).id = 'mutated';
        } catch {
            threw = true;
        }
        expect(threw).toBe(true);
        const snap2 = gw.snapshot();
        expect(snap2.timeline.timeline.id).toBe(beforeId);
    });

    it('replace swaps the document', () => {
        const gw = createDocumentGateway();
        const snap = gw.snapshot();
        const next = {
            ...snap,
            timeline: {
                ...snap.timeline,
                timeline: { ...snap.timeline.timeline, currentTick: snap.timeline.timeline.currentTick + 123 },
            },
        };
        gw.replace(next, { label: 'test replace' });
        const after = gw.get();
        expect(after.timeline.timeline.currentTick).toBe(snap.timeline.timeline.currentTick + 123);
    });

    it('apply patches results in expected changes', () => {
        const gw = createDocumentGateway();
        const base = gw.snapshot();
        const p: Patch[] = [
            {
                op: 'replace',
                path: ['timeline', 'timeline', 'currentTick'],
                value: base.timeline.timeline.currentTick + 5,
            } as any,
        ];
        gw.apply(p, { label: 'tick +5' });
        const after = gw.get();
        expect(after.timeline.timeline.currentTick).toBe(base.timeline.timeline.currentTick + 5);
    });
});
