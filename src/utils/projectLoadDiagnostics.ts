export interface ProjectLoadDiagnostics {
    startedAt: number;
    editorReadyMs?: number;
    firstPreviewMs?: number;
    firstPreviewRenderMs?: number;
    settled: boolean;
    phases: { name: string; durationMs: number }[];
    work: { name: string; durationMs: number }[];
    longTaskCount: number;
    longTaskMs: number;
    maxFrameGapMs: number;
    memory?: Record<string, number | undefined>;
}

let snapshot: ProjectLoadDiagnostics | null = null;
const listeners = new Set<() => void>();
let stopObservation: (() => void) | undefined;
export const getProjectLoadDiagnostics = () => snapshot;
export function subscribeProjectLoadDiagnostics(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
function publish(value: ProjectLoadDiagnostics) {
    snapshot = value;
    for (const listener of listeners) listener();
}

/** Bounded, local diagnostics covering import and the first 30 seconds of editing. */
export function beginProjectLoadDiagnostics(sampleMemory: () => Record<string, number | undefined>) {
    stopObservation?.();
    const startedAt = performance.now();
    const trace: ProjectLoadDiagnostics = {
        startedAt,
        settled: false,
        phases: [],
        work: [],
        longTaskCount: 0,
        longTaskMs: 0,
        maxFrameGapMs: 0,
    };
    publish(trace);
    let phase = 'Reading project';
    let phaseAt = startedAt;
    let observer: PerformanceObserver | undefined;
    let frame = 0;
    let lastFrame: number | undefined;
    let stopped = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const sample = () => {
        if (!stopped) publish({ ...snapshot!, memory: sampleMemory() });
    };
    const sampler = setInterval(sample, 1000);
    const observeFrame = (time: number) => {
        if (lastFrame !== undefined && snapshot)
            snapshot.maxFrameGapMs = Math.max(snapshot.maxFrameGapMs, time - lastFrame);
        lastFrame = time;
        frame = requestAnimationFrame(observeFrame);
    };
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(observeFrame);
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        observer = new PerformanceObserver((entries) => {
            if (!snapshot) return;
            for (const entry of entries.getEntries()) {
                snapshot.longTaskCount++;
                snapshot.longTaskMs += entry.duration;
            }
        });
        observer.observe({ entryTypes: ['longtask'] });
    }
    const stop = () => {
        if (stopped) return;
        sample();
        stopped = true;
        clearInterval(sampler);
        clearTimeout(settleTimer);
        observer?.disconnect();
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        publish({ ...snapshot!, settled: true });
        if (typeof window !== 'undefined')
            window.dispatchEvent(new CustomEvent('mvmnt-project-load-diagnostics', { detail: snapshot }));
    };
    stopObservation = stop;
    return {
        phase(name: string) {
            if (stopped || name === phase) return;
            const now = performance.now();
            publish({
                ...snapshot!,
                phases: [...snapshot!.phases, { name: phase, durationMs: now - phaseAt }].slice(-100),
            });
            phase = name;
            phaseAt = now;
        },
        finish(success: boolean) {
            if (stopped) return;
            this.phase(success ? 'Editor ready' : 'Import failed');
            publish({ ...snapshot!, editorReadyMs: success ? performance.now() - startedAt : undefined });
            if (success) settleTimer = setTimeout(stop, 30_000);
            else stop();
        },
        stop,
    };
}

export async function measureProjectLoadWork<T>(name: string, run: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    const traceStart = snapshot?.startedAt;
    try {
        return await run();
    } finally {
        if (snapshot && !snapshot.settled && snapshot.startedAt === traceStart) {
            publish({
                ...snapshot,
                work: [...snapshot.work, { name, durationMs: performance.now() - startedAt }].slice(-200),
            });
        }
    }
}

export function recordProjectPreviewFrame(renderDurationMs: number): void {
    if (!snapshot || snapshot.settled || snapshot.editorReadyMs === undefined || snapshot.firstPreviewMs !== undefined)
        return;
    publish({
        ...snapshot,
        firstPreviewMs: performance.now() - snapshot.startedAt,
        firstPreviewRenderMs: renderDurationMs,
    });
}
