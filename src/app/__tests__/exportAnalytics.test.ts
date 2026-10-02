import { describe, expect, it } from 'vitest';
import { exportDurationBucket, takeExportTerminalAnalytics } from '../exportAnalytics';

const attemptId = '123e4567-e89b-42d3-a456-426614174000';
const createdAt = '2026-10-02T12:00:00.000Z';

describe('export analytics outcomes', () => {
    it('reports one terminal outcome with a matching attempt ID and duration bucket', () => {
        const reported = new Set<string>();

        expect(
            takeExportTerminalAnalytics(
                reported,
                attemptId,
                'video',
                'completed',
                'automation',
                'render',
                createdAt,
                '2026-10-02T12:00:45.000Z'
            )
        ).toEqual({
            event: 'export_completed',
            properties: {
                export_attempt_id: attemptId,
                export_format: 'video',
                execution_mode: 'automation',
                duration_bucket: '30s_2m',
            },
        });
        expect(takeExportTerminalAnalytics(reported, attemptId, 'video', 'failed', 'automation')).toBeNull();
        expect(takeExportTerminalAnalytics(reported, attemptId, 'video', 'cancelled', 'automation')).toBeNull();
    });

    it('maps failures to the sanitized render category', () => {
        expect(
            takeExportTerminalAnalytics(
                new Set(),
                attemptId,
                'png',
                'failed',
                'background',
                'render',
                createdAt,
                '2026-10-02T12:12:00.000Z'
            )
        ).toEqual({
            event: 'export_failed',
            properties: {
                export_attempt_id: attemptId,
                export_format: 'png',
                execution_mode: 'background',
                failure_category: 'render',
                duration_bucket: 'over_10m',
            },
        });
    });

    it('classifies background setup failures as output failures', () => {
        expect(
            takeExportTerminalAnalytics(new Set(), attemptId, 'video', 'failed', 'background', 'output', createdAt)
        ).toEqual({
            event: 'export_failed',
            properties: {
                export_attempt_id: attemptId,
                export_format: 'video',
                execution_mode: 'background',
                failure_category: 'output',
                duration_bucket: 'unknown',
            },
        });
    });

    it('does not mislabel missing or reversed timestamps as fast exports', () => {
        expect(exportDurationBucket(createdAt, undefined)).toBe('unknown');
        expect(exportDurationBucket(createdAt, '2026-10-02T11:59:59.000Z')).toBe('unknown');
    });
});
