import { describe, expect, it, vi } from 'vitest';
import { ExportPerformanceTracker, createExportDiagnostics } from '../diagnostics';

describe('export performance diagnostics', () => {
    it('records bounded stage metrics without project content', () => {
        const now = vi.spyOn(performance, 'now');
        now.mockReturnValueOnce(0)
            .mockReturnValueOnce(10)
            .mockReturnValueOnce(30)
            .mockReturnValueOnce(35)
            .mockReturnValueOnce(35);
        const tracker = new ExportPerformanceTracker();
        tracker.stage('rendering');
        tracker.stage('finalizing');
        const metrics = tracker.finish({ frames: 10 });
        expect(metrics.preparingMs).toBe(10);
        expect(metrics.renderingMs).toBe(20);
        expect(metrics.frames).toBe(10);
        now.mockRestore();
    });

    it('builds a support report from job metadata', () => {
        const report = createExportDiagnostics([], '1.0.0');
        expect(report).toMatchObject({ schemaVersion: 1, appVersion: '1.0.0', jobs: [] });
    });
});
