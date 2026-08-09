import { describe, expect, it } from 'vitest';
import { createExportJob } from '@export/export-job-store';
import { ExportLifecycleService } from './exportLifecycleService';

describe('ExportLifecycleService', () => {
    it('owns queue removal and background cleanup atomically', () => {
        const service = new ExportLifecycleService();
        const job = createExportJob('png', 'Scene', {} as never, 0, 0, 'job-1');
        service.enqueue(job);
        service.backgroundJobRef.current = job.id;
        service.abortControllersRef.current.set(job.id, new AbortController());

        service.remove(job.id);

        expect(service.pendingExportsRef.current).toEqual([]);
        expect(service.backgroundJobRef.current).toBeNull();
        expect(service.abortControllersRef.current.has(job.id)).toBe(false);
    });
});
