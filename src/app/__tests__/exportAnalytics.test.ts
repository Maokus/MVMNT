import { describe, expect, it } from 'vitest';
import { takeExportTerminalAnalytics } from '../exportAnalytics';

describe('export analytics outcomes', () => {
    it('reports exactly one mutually exclusive terminal outcome per job', () => {
        const reported = new Set<string>();

        expect(takeExportTerminalAnalytics(reported, 'job-1', 'video', 'completed', 'automation')).toEqual({
            event: 'export_completed',
            properties: { export_format: 'video', execution_mode: 'automation' },
        });
        expect(takeExportTerminalAnalytics(reported, 'job-1', 'video', 'failed', 'automation')).toBeNull();
        expect(takeExportTerminalAnalytics(reported, 'job-1', 'video', 'cancelled', 'automation')).toBeNull();
    });

    it('maps failures to the sanitized render category', () => {
        expect(takeExportTerminalAnalytics(new Set(), 'job-2', 'png', 'failed', 'background')).toEqual({
            event: 'export_failed',
            properties: {
                export_format: 'png',
                execution_mode: 'background',
                failure_category: 'render',
            },
        });
    });
});
