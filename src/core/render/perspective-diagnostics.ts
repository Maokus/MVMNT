export interface PerspectiveFrameSample {
    warpedElements: number;
    fallbackElements: number;
    sourcePixels: number;
    projectedPixels: number;
    uploadedBytes: number;
    sourceRasterMs: number;
    gpuSubmissionMs: number;
    canvasCompositeMs: number;
    gpuExecutionMs: number | null;
    surfaceReallocations: number;
    contextLossEvents: number;
}

export interface PerspectiveRollingDiagnostics extends PerspectiveFrameSample {
    sampleCount: number;
    medianFrameCpuMs: number;
    p95FrameCpuMs: number;
}

const emptySample = (): PerspectiveFrameSample => ({
    warpedElements: 0,
    fallbackElements: 0,
    sourcePixels: 0,
    projectedPixels: 0,
    uploadedBytes: 0,
    sourceRasterMs: 0,
    gpuSubmissionMs: 0,
    canvasCompositeMs: 0,
    gpuExecutionMs: null,
    surfaceReallocations: 0,
    contextLossEvents: 0,
});

export class PerspectiveDiagnostics {
    private current = emptySample();
    private readonly history: PerspectiveFrameSample[] = [];
    private lifetimeSurfaceReallocations = 0;
    private lifetimeContextLossEvents = 0;

    beginFrame(): void {
        this.current = emptySample();
    }

    add(patch: Partial<PerspectiveFrameSample>): void {
        this.lifetimeSurfaceReallocations += patch.surfaceReallocations ?? 0;
        this.lifetimeContextLossEvents += patch.contextLossEvents ?? 0;
        for (const [key, value] of Object.entries(patch) as Array<[keyof PerspectiveFrameSample, number | null]>) {
            if (value == null) continue;
            if (key === 'gpuExecutionMs') {
                this.current.gpuExecutionMs = (this.current.gpuExecutionMs ?? 0) + value;
            } else {
                (this.current[key] as number) += value;
            }
        }
    }

    endFrame(): void {
        this.history.push({ ...this.current });
        if (this.history.length > 120) this.history.shift();
    }

    getSnapshot(): PerspectiveRollingDiagnostics {
        const latest = this.history[this.history.length - 1] ?? this.current;
        const totals = this.history.map(
            (sample) => sample.sourceRasterMs + sample.gpuSubmissionMs + sample.canvasCompositeMs
        );
        const sorted = [...totals].sort((a, b) => a - b);
        const percentile = (ratio: number) =>
            sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] : 0;
        return {
            ...latest,
            surfaceReallocations: this.lifetimeSurfaceReallocations,
            contextLossEvents: this.lifetimeContextLossEvents,
            sampleCount: this.history.length,
            medianFrameCpuMs: percentile(0.5),
            p95FrameCpuMs: percentile(0.95),
        };
    }

    reset(): void {
        this.current = emptySample();
        this.history.length = 0;
        this.lifetimeSurfaceReallocations = 0;
        this.lifetimeContextLossEvents = 0;
    }
}
