import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCompositor } from '../perspective-compositor';
import { PerspectiveDiagnostics } from '../perspective-diagnostics';
import { PerspectiveElementRoot } from '../render-objects/perspective-element-root';

const strongWarp = {
    topLeft: { x: 0.1, y: 0 },
    topRight: { x: 0.9, y: 0.15 },
    bottomRight: { x: 1.1, y: 1 },
    bottomLeft: { x: -0.1, y: 0.85 },
};

function rootAt(x: number, y = 0): PerspectiveElementRoot {
    const root = new PerspectiveElementRoot('test', strongWarp, x, y, 1, 1, 1);
    root.baseBounds = { x: 0, y: 0, width: 100, height: 100 };
    root.visualBounds = { ...root.baseBounds };
    root.setOriginFraction(0, 0);
    return root;
}

describe('PerspectiveCompositor', () => {
    it('skips an entirely off-viewport warp before allocating WebGL or a source surface', () => {
        const createCanvas = vi.fn(() => {
            throw new Error('must not allocate');
        });
        const compositor = new PerspectiveCompositor({ createCanvas });
        compositor.beginFrame();
        expect(
            compositor.renderElement(
                rootAt(500),
                {} as CanvasRenderingContext2D,
                {
                    canvas: { width: 100, height: 100 } as HTMLCanvasElement,
                },
                0
            )
        ).toBe(true);
        compositor.endFrame();
        expect(createCanvas).not.toHaveBeenCalled();
        expect(compositor.diagnostics.getSnapshot().sourcePixels).toBe(0);
    });

    it('returns a deterministic affine fallback signal when WebGL initialization fails', () => {
        const canvas = {
            width: 0,
            height: 0,
            addEventListener: vi.fn(),
            getContext: vi.fn(() => null),
        } as unknown as HTMLCanvasElement;
        const compositor = new PerspectiveCompositor({ createCanvas: () => canvas });
        compositor.beginFrame();
        expect(
            compositor.renderElement(
                rootAt(0),
                {} as CanvasRenderingContext2D,
                {
                    canvas: { width: 200, height: 200 } as HTMLCanvasElement,
                },
                0
            )
        ).toBe(false);
        compositor.recordFallback();
        compositor.endFrame();
        expect(compositor.diagnostics.getSnapshot().fallbackElements).toBe(1);
        expect(() => compositor.dispose()).not.toThrow();
        expect(() => compositor.dispose()).not.toThrow();
    });

    it('reuses source surfaces and texture storage at a stable size', () => {
        const { compositor, gl, createCanvas, target } = createWorkingHarness();
        compositor.beginFrame();
        expect(
            compositor.renderElement(rootAt(0), target, { canvas: { width: 200, height: 200 } as HTMLCanvasElement }, 0)
        ).toBe(true);
        expect(
            compositor.renderElement(rootAt(0), target, { canvas: { width: 200, height: 200 } as HTMLCanvasElement }, 0)
        ).toBe(true);
        compositor.endFrame();
        expect(createCanvas).toHaveBeenCalledTimes(2);
        expect(gl.texImage2D).toHaveBeenCalledTimes(1);
        expect(gl.texSubImage2D).toHaveBeenCalledTimes(1);
        expect(target.drawImage).toHaveBeenCalledTimes(2);
        expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_FLIP_Y_WEBGL, 0);
    });

    it('draws projected anchor diagnostics after a successful warped composite', () => {
        const { compositor, target } = createWorkingHarness();
        const root = rootAt(0);
        const drawDiagnostics = vi.spyOn(root, 'renderProjectedAnchorVisualization').mockImplementation(() => {});

        expect(
            compositor.renderElement(
                root,
                target,
                { canvas: { width: 200, height: 200 } as HTMLCanvasElement, showAnchorPoints: true },
                0
            )
        ).toBe(true);

        expect(drawDiagnostics).toHaveBeenCalledWith(target);
    });

    it('composites from an integer rectangle enclosing fractional projected bounds', () => {
        const { compositor, target, scratch } = createWorkingHarness();

        expect(
            compositor.renderElement(
                rootAt(20.25, 20.25),
                target,
                { canvas: { width: 200, height: 200 } as HTMLCanvasElement },
                0
            )
        ).toBe(true);

        expect(target.drawImage).toHaveBeenCalledWith(scratch, 0, 0, 121, 101, 10, 20, 121, 101);
    });

    it('preserves a shared appearance blend mode when compositing a tilted element', () => {
        const { compositor, target } = createWorkingHarness();
        const root = rootAt(0).setOutputBlendMode('multiply');

        expect(
            compositor.renderElement(root, target, { canvas: { width: 200, height: 200 } as HTMLCanvasElement }, 0)
        ).toBe(true);

        expect(target.globalCompositeOperation).toBe('multiply');
    });

    it('falls back during context loss and recompiles after restoration', () => {
        const { compositor, scratch, target } = createWorkingHarness();
        compositor.beginFrame();
        expect(
            compositor.renderElement(rootAt(0), target, { canvas: { width: 200, height: 200 } as HTMLCanvasElement }, 0)
        ).toBe(true);
        scratch.listeners.webglcontextlost({ preventDefault: vi.fn() });
        expect(
            compositor.renderElement(rootAt(0), target, { canvas: { width: 200, height: 200 } as HTMLCanvasElement }, 0)
        ).toBe(false);
        scratch.listeners.webglcontextrestored({});
        expect(
            compositor.renderElement(rootAt(0), target, { canvas: { width: 200, height: 200 } as HTMLCanvasElement }, 0)
        ).toBe(true);
        compositor.endFrame();
        expect(compositor.diagnostics.getSnapshot().contextLossEvents).toBe(1);
    });

    it('falls back on upload/draw errors and caps source surfaces to texture limits', () => {
        const failed = createWorkingHarness();
        failed.gl.getError.mockReturnValue(1);
        failed.compositor.beginFrame();
        expect(
            failed.compositor.renderElement(
                rootAt(0),
                failed.target,
                { canvas: { width: 200, height: 200 } as HTMLCanvasElement },
                0
            )
        ).toBe(false);

        const limited = createWorkingHarness(64);
        limited.compositor.beginFrame();
        expect(
            limited.compositor.renderElement(
                rootAt(0),
                limited.target,
                { canvas: { width: 200, height: 200 } as HTMLCanvasElement },
                0
            )
        ).toBe(true);
        expect(limited.source.width).toBe(64);
        expect(limited.source.height).toBe(64);
    });
});

function createWorkingHarness(maxTextureSize = 2048) {
    const gl: any = {
        VERTEX_SHADER: 1,
        FRAGMENT_SHADER: 2,
        COMPILE_STATUS: 3,
        LINK_STATUS: 4,
        ARRAY_BUFFER: 5,
        STATIC_DRAW: 6,
        TEXTURE_2D: 7,
        TEXTURE_MIN_FILTER: 8,
        TEXTURE_MAG_FILTER: 9,
        LINEAR: 10,
        TEXTURE_WRAP_S: 11,
        TEXTURE_WRAP_T: 12,
        CLAMP_TO_EDGE: 13,
        UNPACK_FLIP_Y_WEBGL: 14,
        MAX_TEXTURE_SIZE: 15,
        UNPACK_PREMULTIPLY_ALPHA_WEBGL: 21,
        COLOR_BUFFER_BIT: 16,
        FLOAT: 17,
        RGBA: 18,
        UNSIGNED_BYTE: 19,
        TRIANGLES: 20,
        NO_ERROR: 0,
        getParameter: vi.fn((value: number) => (value === 15 ? maxTextureSize : 0)),
        getExtension: vi.fn(() => null),
        createShader: vi.fn(() => ({})),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        getShaderParameter: vi.fn(() => true),
        getShaderInfoLog: vi.fn(() => ''),
        deleteShader: vi.fn(),
        createProgram: vi.fn(() => ({})),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        getProgramParameter: vi.fn(() => true),
        getProgramInfoLog: vi.fn(() => ''),
        createBuffer: vi.fn(() => ({})),
        createTexture: vi.fn(() => ({})),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        bindTexture: vi.fn(),
        texParameteri: vi.fn(),
        pixelStorei: vi.fn(),
        viewport: vi.fn(),
        clearColor: vi.fn(),
        clear: vi.fn(),
        useProgram: vi.fn(),
        getAttribLocation: vi.fn(() => 0),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        texImage2D: vi.fn(),
        texSubImage2D: vi.fn(),
        getUniformLocation: vi.fn(() => ({})),
        uniform1i: vi.fn(),
        uniformMatrix3fv: vi.fn(),
        uniform4f: vi.fn(),
        uniform1f: vi.fn(),
        uniform2f: vi.fn(),
        drawArrays: vi.fn(),
        getError: vi.fn(() => 0),
        deleteTexture: vi.fn(),
        deleteBuffer: vi.fn(),
        deleteProgram: vi.fn(),
    };
    const sourceContext = {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        scale: vi.fn(),
        translate: vi.fn(),
        restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const scratch: any = {
        width: 0,
        height: 0,
        listeners: {} as Record<string, (event: any) => void>,
        addEventListener(type: string, listener: (event: any) => void) {
            this.listeners[type] = listener;
        },
        getContext: vi.fn((type: string) => (type === 'webgl' ? gl : null)),
    };
    const source: any = { width: 0, height: 0, getContext: vi.fn(() => sourceContext) };
    const createCanvas = vi
        .fn()
        .mockImplementationOnce(() => scratch)
        .mockImplementation(() => source);
    const target = {
        save: vi.fn(),
        restore: vi.fn(),
        drawImage: vi.fn(),
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
    } as unknown as CanvasRenderingContext2D;
    return { compositor: new PerspectiveCompositor({ createCanvas }), gl, scratch, source, createCanvas, target };
}

describe('PerspectiveDiagnostics', () => {
    it('keeps a bounded 120-frame window and reports median and p95 CPU time', () => {
        const diagnostics = new PerspectiveDiagnostics();
        for (let index = 1; index <= 140; index++) {
            diagnostics.beginFrame();
            diagnostics.add({ sourceRasterMs: index });
            diagnostics.endFrame();
        }
        const snapshot = diagnostics.getSnapshot();
        expect(snapshot.sampleCount).toBe(120);
        expect(snapshot.medianFrameCpuMs).toBe(80);
        expect(snapshot.p95FrameCpuMs).toBe(134);
    });
});
