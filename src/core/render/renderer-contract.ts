export type RendererContextType = 'canvas2d' | 'webgl' | 'webgl2';

export type RendererContext =
    | CanvasRenderingContext2D
    | WebGLRenderingContext
    | WebGL2RenderingContext;

export interface RendererInitOptions {
    canvas: HTMLCanvasElement;
    context?: RendererContext | null;
    devicePixelRatio?: number;
}

export interface RendererInitResult {
    canvas: HTMLCanvasElement;
    context: RendererContext;
    contextType: RendererContextType;
}

export interface RendererResizePayload {
    width: number;
    height: number;
    devicePixelRatio?: number;
}

export interface RendererFrameTarget {
    mode: 'interactive' | 'export';
    frameIndex?: number;
}

export interface RendererFrameInput<TRenderObject extends RenderObject = RenderObject> {
    timeSec: number;
    sceneConfig: Record<string, unknown>;
    renderObjects: readonly TRenderObject[];
    target?: RendererFrameTarget;
}

export type FrameCaptureFormat = 'imageData' | 'dataURL' | 'blob';

export interface FrameCaptureRequest<TRenderObject extends RenderObject = RenderObject>
    extends RendererFrameInput<TRenderObject> {
    format: FrameCaptureFormat;
}

export type RendererCaptureResult = ImageData | string | Blob | null | Promise<Blob | null>;

export interface RendererContract<TRenderObject extends RenderObject = RenderObject> {
    init(options: RendererInitOptions): RendererInitResult;
    resize(payload: RendererResizePayload): void;
    renderFrame(input: RendererFrameInput<TRenderObject>): void;
    captureFrame(request: FrameCaptureRequest<TRenderObject>): RendererCaptureResult;
    teardown(): void;
}

export interface RenderObject {
    render?: (ctx: CanvasRenderingContext2D, config: any, timeSec: number) => void;
    fillColor?: string;
    getBounds?: () => { x: number; y: number; width: number; height: number } | undefined;
}
