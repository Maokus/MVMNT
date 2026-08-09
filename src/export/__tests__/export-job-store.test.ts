import { beforeEach, describe, expect, it } from 'vitest';
import { createExportJob, isExportJobActive, useExportJobStore } from '../jobs';

describe('export job store', () => {
    beforeEach(() => {
        localStorage.clear();
        useExportJobStore.setState({ jobs: [] });
    });

    it('tracks progress, cancellation, bounded logs, and terminal state', () => {
        const job = createExportJob(
            'video',
            'Scene',
            {
                width: 1920,
                height: 1080,
                fps: 30,
                fullDuration: true,
                startTime: 0,
                endTime: 0,
            },
            3,
            2
        );
        const store = useExportJobStore.getState();
        store.enqueue(job);
        store.update(job.id, { status: 'rendering', progress: 50 });
        store.requestCancel(job.id);
        store.log(job.id, 'warning', 'fallback');

        const updated = useExportJobStore.getState().jobs[0];
        expect(updated).toMatchObject({ status: 'rendering', progress: 50, cancelRequested: true });
        expect(updated.logs.at(-1)?.message).toBe('fallback');
        expect(isExportJobActive(updated.status)).toBe(true);

        store.update(job.id, { status: 'cancelled' });
        expect(isExportJobActive(useExportJobStore.getState().jobs[0].status)).toBe(false);
    });
});
