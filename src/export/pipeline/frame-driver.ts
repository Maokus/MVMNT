import type { ExportEnvironment, ResolvedExportPlan } from '../contracts';

export function beginExportSurface(
    canvas: HTMLCanvasElement,
    renderer: ExportEnvironment['renderer'],
    width: number,
    height: number,
    transparent: boolean
): () => void {
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    canvas.width = width;
    canvas.height = height;
    renderer.resize(width, height);
    if (transparent) renderer.setTransparentMode?.(true);
    return () => {
        if (transparent) renderer.setTransparentMode?.(false);
        canvas.width = originalWidth;
        canvas.height = originalHeight;
        renderer.resize(originalWidth, originalHeight);
    };
}

export async function withExportSurface<T>(
    environment: ExportEnvironment,
    plan: ResolvedExportPlan,
    task: () => Promise<T>
): Promise<T> {
    const restore = beginExportSurface(
        environment.canvas,
        environment.renderer,
        plan.settings.width,
        plan.settings.height,
        plan.settings.transparentBackground
    );
    try {
        return await task();
    } finally {
        restore();
    }
}

export async function driveFrames(
    options: {
        startSeconds: number;
        fps: number;
        frameCount: number;
        signal?: AbortSignal;
        prepareFrame(seconds: number, signal?: AbortSignal): Promise<void>;
        renderAtTime(seconds: number): void;
    },
    consume: (frameIndex: number, sceneTime: number, encodeTime: number, frameDuration: number) => Promise<void>,
    onFrame?: (completedFrames: number) => void
): Promise<void> {
    const frameDuration = 1 / options.fps;
    for (let frameIndex = 0; frameIndex < options.frameCount; frameIndex += 1) {
        if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
        const encodeTime = frameIndex * frameDuration;
        const sceneTime = options.startSeconds + encodeTime;
        await options.prepareFrame(sceneTime, options.signal);
        if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
        options.renderAtTime(sceneTime);
        await consume(frameIndex, sceneTime, encodeTime, frameDuration);
        onFrame?.(frameIndex + 1);
        if (frameIndex % 10 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
}

export async function renderFrameSequence(
    environment: ExportEnvironment,
    plan: ResolvedExportPlan,
    signal: AbortSignal,
    consume: (frameIndex: number, sceneTime: number, encodeTime: number, frameDuration: number) => Promise<void>,
    onFrame?: (completedFrames: number) => void
): Promise<void> {
    return driveFrames(
        {
            startSeconds: plan.startSeconds,
            fps: plan.settings.fps,
            frameCount: plan.frameCount,
            signal,
            prepareFrame: (seconds, signal) => environment.renderer.prepareFrame(seconds, signal),
            renderAtTime: (seconds) => environment.renderer.renderAtTime(seconds),
        },
        consume,
        onFrame
    );
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Failed to convert canvas to PNG blob.'))),
            'image/png',
            1
        );
    });
}
