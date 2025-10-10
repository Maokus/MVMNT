import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MIDIVisualizerCore } from '../visualizer-core';
import { useSceneStore, DEFAULT_SCENE_SETTINGS } from '@state/sceneStore';
import { useRenderDiagnosticsStore } from '@state/scene';
import type {
    FrameCaptureRequest,
    RendererCaptureResult,
    RendererContract,
    RendererFrameInput,
    RendererInitOptions,
    RendererInitResult,
    RendererResizePayload,
    RenderObject,
} from '@core/render/renderer-contract';
import type { RendererDiagnostics, WebGLRenderPrimitive } from '@core/render/webgl/types';

type CanvasCtx = CanvasRenderingContext2D & {
    clearRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
};

function createMock2dContext(canvas: HTMLCanvasElement): CanvasCtx {
    const ctx = {
        canvas,
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        strokeRect: vi.fn(),
        setLineDash: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        globalAlpha: 1,
    } as unknown as CanvasCtx;
    return ctx;
}

class FakeCanvasRenderer implements RendererContract<RenderObject> {
    public readonly renderFrames: RendererFrameInput<RenderObject>[] = [];
    constructor(private readonly ctx: CanvasRenderingContext2D) {}
    init(options: RendererInitOptions): RendererInitResult {
        return { canvas: options.canvas, context: this.ctx, contextType: 'canvas2d' };
    }
    resize(_payload: RendererResizePayload): void {}
    renderFrame(input: RendererFrameInput<RenderObject>): void {
        this.renderFrames.push(input);
    }
    captureFrame(_request: FrameCaptureRequest<RenderObject>): RendererCaptureResult {
        return null;
    }
    teardown(): void {}
}

class FakeWebGLRenderer implements RendererContract<WebGLRenderPrimitive | RenderObject> {
    public readonly renderCalls: RendererFrameInput<WebGLRenderPrimitive | RenderObject>[] = [];
    public resizeCalls = 0;
    public teardownCalls = 0;
    public initCanvas: HTMLCanvasElement | null = null;
    public diagnostics: RendererDiagnostics | null = {
        frameHash: 'facefeed',
        drawCalls: 2,
        bytesHashed: 128,
        contextType: 'webgl',
    };
    init(options: RendererInitOptions): RendererInitResult {
        this.initCanvas = options.canvas;
        return {
            canvas: options.canvas,
            context: {} as WebGLRenderingContext,
            contextType: 'webgl',
        };
    }
    resize(_payload: RendererResizePayload): void {
        this.resizeCalls += 1;
    }
    renderFrame(input: RendererFrameInput<WebGLRenderPrimitive | RenderObject>): void {
        this.renderCalls.push(input);
    }
    captureFrame(_request: FrameCaptureRequest<WebGLRenderPrimitive | RenderObject>): RendererCaptureResult {
        return null;
    }
    teardown(): void {
        this.teardownCalls += 1;
    }
}

class FailingWebGLRenderer extends FakeWebGLRenderer {
    init(): RendererInitResult {
        throw new Error('no webgl context available');
    }
}

beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
});

afterAll(() => {
    vi.unstubAllGlobals();
});

beforeEach(() => {
    useSceneStore.getState().clearScene();
    useSceneStore.setState({ settings: { ...DEFAULT_SCENE_SETTINGS } });
    useRenderDiagnosticsStore.getState().reset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MIDIVisualizerCore phase 3 integration', () => {
    it('routes frames through the WebGL renderer when enabled', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx2d = createMock2dContext(canvas);
        vi.spyOn(canvas, 'getContext').mockImplementation((type: string) => (type === '2d' ? ctx2d : null));
        useSceneStore.setState({ settings: { ...DEFAULT_SCENE_SETTINGS, renderer: 'webgl' } });
        const fakeCanvasRenderer = new FakeCanvasRenderer(ctx2d);
        const fakeWebGLRenderer = new FakeWebGLRenderer();
        const vis = new MIDIVisualizerCore(canvas, null, {
            rendererFactories: {
                createCanvasRenderer: () => fakeCanvasRenderer,
                createWebGLRenderer: () => fakeWebGLRenderer,
            },
        });
        vis.renderWithCustomObjects([], 0);
        expect(fakeWebGLRenderer.renderCalls).toHaveLength(1);
        expect(fakeCanvasRenderer.renderFrames).toHaveLength(0);
        expect(fakeWebGLRenderer.initCanvas).not.toBe(canvas);
        expect(fakeWebGLRenderer.renderCalls[0].sceneConfig.canvas).toBe(fakeWebGLRenderer.initCanvas);
        expect(ctx2d.drawImage).toHaveBeenCalled();
        const diagnostics = useRenderDiagnosticsStore.getState().lastFrame;
        expect(diagnostics?.renderer).toBe('webgl');
        expect(diagnostics?.frameHash).toBe('facefeed');
        expect(diagnostics?.drawCalls).toBe(2);
        vis.cleanup();
    });

    it('falls back to the canvas renderer and records errors when WebGL init fails', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 144;
        const ctx2d = createMock2dContext(canvas);
        vi.spyOn(canvas, 'getContext').mockImplementation((type: string) => (type === '2d' ? ctx2d : null));
        useSceneStore.setState({ settings: { ...DEFAULT_SCENE_SETTINGS, renderer: 'webgl' } });
        const fakeCanvasRenderer = new FakeCanvasRenderer(ctx2d);
        const failingRenderer = new FailingWebGLRenderer();
        const vis = new MIDIVisualizerCore(canvas, null, {
            rendererFactories: {
                createCanvasRenderer: () => fakeCanvasRenderer,
                createWebGLRenderer: () => failingRenderer,
            },
        });
        vis.renderWithCustomObjects([], 0);
        expect(fakeCanvasRenderer.renderFrames).toHaveLength(1);
        expect(useRenderDiagnosticsStore.getState().lastError?.renderer).toBe('webgl');
        expect(useRenderDiagnosticsStore.getState().lastError?.message).toContain('no webgl context available');
        const diagnostics = useRenderDiagnosticsStore.getState().lastFrame;
        expect(diagnostics?.renderer).toBe('canvas2d');
        vis.cleanup();
    });

    it('tears down the WebGL renderer when switching preference back to canvas', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx2d = createMock2dContext(canvas);
        vi.spyOn(canvas, 'getContext').mockImplementation((type: string) => (type === '2d' ? ctx2d : null));
        useSceneStore.setState({ settings: { ...DEFAULT_SCENE_SETTINGS, renderer: 'webgl' } });
        const fakeCanvasRenderer = new FakeCanvasRenderer(ctx2d);
        const fakeWebGLRenderer = new FakeWebGLRenderer();
        const vis = new MIDIVisualizerCore(canvas, null, {
            rendererFactories: {
                createCanvasRenderer: () => fakeCanvasRenderer,
                createWebGLRenderer: () => fakeWebGLRenderer,
            },
        });

        vis.renderWithCustomObjects([], 0);
        expect(fakeWebGLRenderer.renderCalls).toHaveLength(1);

        useSceneStore.setState({ settings: { ...DEFAULT_SCENE_SETTINGS, renderer: 'canvas2d' } });
        vis.renderWithCustomObjects([], 0);

        expect(fakeWebGLRenderer.teardownCalls).toBe(1);
        expect(fakeCanvasRenderer.renderFrames).toHaveLength(1);
        expect(useRenderDiagnosticsStore.getState().lastFrame?.renderer).toBe('canvas2d');

        vis.cleanup();
    });
});
