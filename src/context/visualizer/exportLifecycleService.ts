import type { ExportJob } from '@export/export-job-store';

interface MutableCell<T> {
    current: T;
}

/** Owns the mutable queue/background state shared by export callbacks and desktop events. */
export class ExportLifecycleService {
    readonly pendingExportsRef: MutableCell<ExportJob[]> = { current: [] };
    readonly drainingExportsRef: MutableCell<boolean> = { current: false };
    readonly abortControllersRef: MutableCell<Map<string, AbortController>> = { current: new Map() };
    readonly backgroundJobRef: MutableCell<string | null> = { current: null };

    enqueue(job: ExportJob): void {
        this.pendingExportsRef.current.push(job);
    }

    remove(jobId: string): void {
        this.pendingExportsRef.current = this.pendingExportsRef.current.filter((job) => job.id !== jobId);
        this.abortControllersRef.current.delete(jobId);
        if (this.backgroundJobRef.current === jobId) this.backgroundJobRef.current = null;
    }

    reset(): void {
        this.pendingExportsRef.current = [];
        this.abortControllersRef.current.clear();
        this.drainingExportsRef.current = false;
        this.backgroundJobRef.current = null;
    }
}
