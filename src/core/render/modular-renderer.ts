/* Minimal typing; refine in later iterations */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RenderObject {
    render?: (ctx: CanvasRenderingContext2D, config: any, time: number) => void;
    fillColor?: string;
    getBounds?: () => { x: number; y: number; width: number; height: number } | undefined;
}

export class ModularRenderer {
    render(ctx: CanvasRenderingContext2D, renderObjects: RenderObject[], config: any, currentTime: number) {
        const first = renderObjects[0];
        const hasExplicitBg =
            first && typeof first.fillColor !== 'undefined' && first.fillColor === config.backgroundColor;
        if (!renderObjects.length || !hasExplicitBg) {
            this.clearCanvas(ctx, config.canvas.width, config.canvas.height, config.backgroundColor);
        }
        for (const ro of renderObjects) {
            try {
                ro && ro.render && ro.render(ctx, config, currentTime);
            } catch (e) {
                // Non-fatal render error
            }
        }
    }

    clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, backgroundColor: string) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }

    renderFrame(ctx: CanvasRenderingContext2D, renderObjects: RenderObject[], config: any, timestamp: number) {
        this.render(ctx, renderObjects, config, timestamp);
    }

    getFrameData(
        canvas: HTMLCanvasElement,
        renderObjects: RenderObject[],
        config: any,
        timestamp: number,
        outputFormat: 'imageData' | 'dataURL' | 'blob' = 'imageData'
    ): any {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d')!;
        this.render(tempCtx, renderObjects, { ...config, canvas: tempCanvas }, timestamp);
        switch (outputFormat) {
            case 'imageData':
                return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            case 'dataURL':
                return tempCanvas.toDataURL();
            case 'blob':
                return new Promise<Blob | null>((resolve) => tempCanvas.toBlob(resolve));
            default:
                return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        }
    }

    renderFrameSequence(
        canvas: HTMLCanvasElement,
        sceneBuilder: any,
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
            const frameCtx = frameCanvas.getContext('2d')!;
            const renderObjects = sceneBuilder.buildScene({ ...config, canvas: frameCanvas }, t);
            this.render(frameCtx, renderObjects, { ...config, canvas: frameCanvas }, t);
            frames.push({ time: t, dataURL: frameCanvas.toDataURL() });
        }
        return frames;
    }
}
