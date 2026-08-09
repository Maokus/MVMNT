import { describe, expect, it } from 'vitest';
import { resolveExportPlan } from '../planning';
import type { ExportRequest } from '../contracts';

function request(overrides: Partial<ExportRequest['settings']> = {}): ExportRequest {
    return {
        kind: 'video',
        sceneName: 'Plan Test',
        settings: {
            fps: 30,
            width: 1920,
            height: 1080,
            fullDuration: false,
            startTime: 2,
            endTime: 5,
            ...overrides,
        },
    };
}

describe('resolveExportPlan', () => {
    it('normalizes one range, filename, frame count, and encoding configuration', () => {
        const plan = resolveExportPlan(request(), 10);
        expect(plan).toMatchObject({
            startSeconds: 2,
            endSeconds: 5,
            durationSeconds: 3,
            startFrame: 60,
            frameCount: 90,
            extension: '.mp4',
        });
        expect(plan.outputName).toBe('Plan_Test_1920x1080_30fps');
        expect(plan.settings.videoBitrate).toBeGreaterThan(0);
    });

    it('resolves transparency to the supported WebM/VP9 pipeline', () => {
        const plan = resolveExportPlan(
            request({ transparentBackground: true, container: 'mp4', videoCodec: 'h264' }),
            10
        );
        expect(plan.settings).toMatchObject({ container: 'webm', videoCodec: 'vp9' });
        expect(plan.extension).toBe('.webm');
    });

    it('rejects invalid ranges before a job is queued', () => {
        expect(() => resolveExportPlan(request({ startTime: 5, endTime: 2 }), 10)).toThrow('Invalid start/end time');
    });
});
