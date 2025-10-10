/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
    FrameCaptureRequest,
    RenderObject,
    RendererCaptureResult,
    RendererContract,
    RendererFrameInput,
    RendererInitOptions,
    RendererInitResult,
    RendererResizePayload,
} from './renderer-contract';

export class ModularRenderer implements RendererContract {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    init(options: RendererInitOptions): RendererInitResult {
        const { canvas, context } = options;
        if (!canvas) throw new Error('Canvas element is required for ModularRenderer');
        const resolvedContext =
            (context as CanvasRenderingContext2D | undefined | null) ?? canvas.getContext('2d');
        if (!resolvedContext) {
            throw new Error('Unable to acquire CanvasRenderingContext2D');
        }
        this.canvas = canvas;
        this.ctx = resolvedContext;
        return { canvas, context: resolvedContext, contextType: 'canvas2d' };
    }

    resize({ width, height }: RendererResizePayload): void {
        if (!this.canvas) return;
        if (typeof width === 'number') this.canvas.width = width;
        if (typeof height === 'number') this.canvas.height = height;
    }

    renderFrame({ renderObjects, sceneConfig, timeSec }: RendererFrameInput): void {
        if (!this.ctx) throw new Error('ModularRenderer has not been initialized');
        const canvas = this.canvas ?? (sceneConfig.canvas as HTMLCanvasElement | undefined) ?? null;
        const config = { ...sceneConfig, canvas: canvas ?? sceneConfig.canvas };
        this.render(this.ctx, renderObjects as RenderObject[], config, timeSec);
    }

    captureFrame({ renderObjects, sceneConfig, timeSec, format }: FrameCaptureRequest): RendererCaptureResult {
        if (!this.canvas) throw new Error('ModularRenderer has not been initialized');
        const width = this.canvas.width;
        const height = this.canvas.height;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) throw new Error('Unable to acquire CanvasRenderingContext2D for capture');
        this.render(tempCtx, renderObjects as RenderObject[], { ...sceneConfig, canvas: tempCanvas }, timeSec);
        switch (format) {
            case 'imageData':
                return tempCtx.getImageData(0, 0, width, height);
            case 'dataURL':
                return tempCanvas.toDataURL();
            case 'blob':
                return new Promise<Blob | null>((resolve) => tempCanvas.toBlob(resolve));
            default:
                return tempCtx.getImageData(0, 0, width, height);
        }
    }

    teardown(): void {
        this.canvas = null;
        this.ctx = null;
    }

    render(ctx: CanvasRenderingContext2D, renderObjects: RenderObject[], config: any, time: number) {
        const first = renderObjects[0];
        const hasExplicitBg =
            first && typeof first.fillColor !== 'undefined' && first.fillColor === (config as any).backgroundColor;
        const canvasConfig = config as any;
        if (!renderObjects.length || !hasExplicitBg) {
            this.clearCanvas(ctx, canvasConfig.canvas.width, canvasConfig.canvas.height, canvasConfig.backgroundColor);
        }
        for (const ro of renderObjects) {
            try {
                ro?.render?.(ctx, config, time);
            } catch (e) {
                // Non-fatal render error
            }
        }
    }

    clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, backgroundColor: string) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }

    renderFrameSequence(
        canvas: HTMLCanvasElement,
        resolveRenderObjects: (time: number) => RenderObject[],
        config: any,
        startTime: number,
        endTime: number,
        frameRate: number
    ) {
        const frames: { time: number; dataURL: string }[] = [];
        const frameDuration = 1 / frameRate;
        for (let t = startTime; t <= endTime; t += frameDuration) {
            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = canvas.width;
            frameCanvas.height = canvas.height;
            const frameCtx = frameCanvas.getContext('2d');
            if (!frameCtx) continue;
            const renderObjects = resolveRenderObjects(t);
            this.render(frameCtx, renderObjects, { ...config, canvas: frameCanvas }, t);
            frames.push({ time: t, dataURL: frameCanvas.toDataURL() });
        }
        return frames;
    }
}
