import { beforeEach, describe, expect, it } from 'vitest';
import { useRenderDiagnosticsStore } from '../renderDiagnosticsStore';

describe('useRenderDiagnosticsStore', () => {
    beforeEach(() => {
        useRenderDiagnosticsStore.getState().reset();
    });

    it('records the latest frame snapshot', () => {
        const store = useRenderDiagnosticsStore.getState();
        store.recordFrame({
            renderer: 'canvas2d',
            contextType: 'canvas2d',
            frameHash: null,
            drawCalls: null,
            bytesHashed: null,
            frameTimeMs: 4.2,
            timestamp: 100,
        });
        const snapshot = useRenderDiagnosticsStore.getState().lastFrame;
        expect(snapshot?.renderer).toBe('canvas2d');
        expect(snapshot?.frameTimeMs).toBeCloseTo(4.2);
        expect(snapshot?.drawCalls).toBeNull();
        expect(useRenderDiagnosticsStore.getState().determinismIssues).toHaveLength(0);
    });

    it('tracks determinism mismatches for export frames', () => {
        const store = useRenderDiagnosticsStore.getState();
        store.recordFrame({
            renderer: 'webgl',
            contextType: 'webgl',
            frameHash: 'aaaa1111',
            drawCalls: 3,
            bytesHashed: 64,
            frameTimeMs: 1.5,
            timestamp: 200,
            target: { mode: 'export', frameIndex: 5 },
        });
        store.recordFrame({
            renderer: 'webgl',
            contextType: 'webgl',
            frameHash: 'bbbb2222',
            drawCalls: 4,
            bytesHashed: 64,
            frameTimeMs: 1.25,
            timestamp: 250,
            target: { mode: 'export', frameIndex: 5 },
        });
        const issues = useRenderDiagnosticsStore.getState().determinismIssues;
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ key: 'export:5', previousHash: 'aaaa1111', nextHash: 'bbbb2222' });
    });

    it('records render errors', () => {
        const error = new Error('render failed');
        useRenderDiagnosticsStore.getState().recordError(error, { renderer: 'webgl' });
        const snapshot = useRenderDiagnosticsStore.getState().lastError;
        expect(snapshot?.renderer).toBe('webgl');
        expect(snapshot?.message).toContain('render failed');
    });
});
