import { describe, expect, it } from 'vitest';
import { createExportManifest } from '../export-manifest';
import type { ExportJob } from '../export-job-store';

describe('export manifest', () => {
    it('records deterministic settings and range-derived frame count', () => {
        const job: ExportJob = {
            id: 'job-1',
            kind: 'video',
            status: 'finalizing',
            progress: 99,
            text: 'Finalizing',
            snapshot: {
                sceneName: 'Example',
                createdAt: '2026-01-01T00:00:00.000Z',
                sceneElementCount: 2,
                trackCount: 1,
                settings: {
                    width: 1920,
                    height: 1080,
                    fps: 30,
                    fullDuration: false,
                    startTime: 2,
                    endTime: 7,
                },
            },
            logs: [{ at: 'now', level: 'warning', message: 'codec fallback' }],
        };
        const manifest = createExportManifest(job, '1.2.3', 20, { elapsedMs: 500 });
        expect(manifest.frameCount).toBe(150);
        expect(manifest.durationSeconds).toBe(5);
        expect(manifest.warnings).toEqual(['codec fallback']);
        expect(manifest.applicationVersion).toBe('1.2.3');
    });
});
