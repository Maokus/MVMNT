import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../document/documentStore';

const getSnap = () => useDocumentStore.getState().getSnapshot();

describe('history grouping & logging', () => {
    beforeEach(() => {
        const api = useDocumentStore.getState();
        api.setHistoryCap(200);
        api.replace(getSnap());
        // remove logger if any
        api.setHistoryLogger(null);
    });

    it('groups multiple commits into a single history entry', () => {
        const api = useDocumentStore.getState();
        const startTick = getSnap().timeline.timeline.currentTick;
        api.beginGroup('drag playhead');
        for (let i = 0; i < 5; i++) {
            api.commit(
                (d) => {
                    d.timeline.timeline.currentTick += 1;
                },
                { label: 'drag step' }
            );
        }
        api.endGroup();
        // One undo should revert all 5 increments
        expect(useDocumentStore.getState().canUndo).toBe(true);
        api.undo();
        expect(getSnap().timeline.timeline.currentTick).toBe(startTick);
        expect(useDocumentStore.getState().canRedo).toBe(true);
        api.redo();
        expect(getSnap().timeline.timeline.currentTick).toBe(startTick + 5);
    });

    it('invokes history logger with events', () => {
        const api = useDocumentStore.getState();
        const events: string[] = [];
        api.setHistoryLogger((e) => {
            events.push(e.type);
        });
        api.commit(
            (d) => {
                d.timeline.timeline.currentTick += 2;
            },
            { label: 'nudge' }
        );
        api.undo();
        api.redo();
        expect(events).toContain('commit');
        expect(events).toContain('undo');
        expect(events).toContain('redo');
        api.setHistoryLogger(null);
    });
});
