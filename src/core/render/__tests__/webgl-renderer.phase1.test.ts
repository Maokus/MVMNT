import { describe, expect, it, vi, beforeEach } from 'vitest';
import { acquireWebGLContext, WebGLContextError } from '../webgl/context';
import { hashPixelBuffer } from '../webgl/frame-hash';
import { WebGLRenderer } from '../webgl/webgl-renderer';
import type { MaterialDescriptor } from '../webgl/material';
import type { WebGLRenderPrimitive } from '../webgl/types';

if (typeof ImageData === 'undefined') {
    class SimpleImageData {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;

        constructor(data: Uint8ClampedArray, width: number, height: number) {
            this.data = data;
            this.width = width;
            this.height = height;
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ImageData = SimpleImageData;
}

interface MockGL {
    context: WebGLRenderingContext;
    getPixels: () => Uint8Array | null;
}

function createMockGL(): MockGL {
    const mockUniformLocation = {} as WebGLUniformLocation;
    let lastPixels: Uint8Array | null = null;

    const gl = {
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88e4,
        COLOR_BUFFER_BIT: 0x4000,
        DEPTH_BUFFER_BIT: 0x0100,
        FLOAT: 0x1406,
        TRIANGLES: 0x0004,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        VERTEX_SHADER: 0x8b31,
        FRAGMENT_SHADER: 0x8b30,
        SRC_ALPHA: 0x0302,
        ONE_MINUS_SRC_ALPHA: 0x0303,
        createBuffer: vi.fn(() => ({} as WebGLBuffer)),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        bufferSubData: vi.fn(),
        deleteBuffer: vi.fn(),
        createShader: vi.fn(() => ({} as WebGLShader)),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        getShaderParameter: vi.fn(() => true),
        getShaderInfoLog: vi.fn(() => ''),
        deleteShader: vi.fn(),
        createProgram: vi.fn(() => ({} as WebGLProgram)),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        getProgramParameter: vi.fn(() => true),
        getProgramInfoLog: vi.fn(() => ''),
        deleteProgram: vi.fn(),
        useProgram: vi.fn(),
        getUniformLocation: vi.fn(() => mockUniformLocation),
        uniform1f: vi.fn(),
        uniform2fv: vi.fn(),
        uniform3fv: vi.fn(),
        uniform4fv: vi.fn(),
        uniform1i: vi.fn(),
        uniform2iv: vi.fn(),
        uniform3iv: vi.fn(),
        uniform4iv: vi.fn(),
        uniformMatrix3fv: vi.fn(),
        uniformMatrix4fv: vi.fn(),
        getAttribLocation: vi.fn(() => 0),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        drawArrays: vi.fn(),
        clearColor: vi.fn(),
        clear: vi.fn(),
        viewport: vi.fn(),
        disable: vi.fn(),
        enable: vi.fn(),
        blendFunc: vi.fn(),
        readPixels: vi.fn((x: number, y: number, width: number, height: number, format: number, type: number, pixels: ArrayBufferView) => {
            if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
                for (let i = 0; i < width * height * 4; i += 1) {
                    pixels[i] = i % 255;
                }
                lastPixels = new Uint8Array(pixels); // capture copy for assertions
            }
        }),
        getError: vi.fn(() => 0),
        getParameter: vi.fn(() => 0),
    } as unknown as WebGLRenderingContext;

    return {
        context: gl,
        getPixels: () => lastPixels,
    };
}

function createPrimitive(): { primitive: WebGLRenderPrimitive; material: MaterialDescriptor } {
    const geometry = {
        id: 'tri',
        data: new Float32Array([0, 0, 1, 0, 0, 1]),
        attributes: [
            {
                name: 'a_position',
                size: 2,
                stride: 0,
                offset: 0,
            },
        ],
    };
    const material: MaterialDescriptor = {
        id: 'basic',
        vertexSource: 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }',
        fragmentSource: 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }',
        attributes: [
            {
                name: 'a_position',
                size: 2,
                stride: 0,
                offset: 0,
            },
        ],
    };
    const primitive: WebGLRenderPrimitive = {
        geometry,
        material,
        vertexCount: 3,
    };
    return { primitive, material };
}

describe('acquireWebGLContext', () => {
    it('returns provided context when valid', () => {
        const { context } = createMockGL();
        const canvas = document.createElement('canvas');
        const result = acquireWebGLContext(canvas, { context });
        expect(result.gl).toBe(context);
        expect(result.contextType === 'webgl' || result.contextType === 'webgl2').toBe(true);
    });

    it('falls back from webgl2 to webgl when necessary', () => {
        const { context } = createMockGL();
        const canvas = document.createElement('canvas');
        const getContext = vi
            .fn<Parameters<HTMLCanvasElement['getContext']>, ReturnType<HTMLCanvasElement['getContext']>>()
            .mockImplementationOnce(() => null)
            .mockImplementationOnce(() => context);
        Object.defineProperty(canvas, 'getContext', { value: getContext });
        const result = acquireWebGLContext(canvas, {});
        expect(result.gl).toBe(context);
        expect(result.contextType).toBe('webgl');
        expect(getContext).toHaveBeenNthCalledWith(1, 'webgl2', undefined);
        expect(getContext).toHaveBeenNthCalledWith(2, 'webgl', undefined);
    });

    it('throws when provided context is invalid', () => {
        const canvas = document.createElement('canvas');
        expect(() => acquireWebGLContext(canvas, { context: {} as unknown as WebGLRenderingContext })).toThrow(
            WebGLContextError
        );
    });
});

describe('WebGLRenderer', () => {
    let mock: MockGL;
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
        mock = createMockGL();
        canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        Object.defineProperty(canvas, 'clientWidth', { value: 64, configurable: true });
        Object.defineProperty(canvas, 'clientHeight', { value: 32, configurable: true });
        Object.defineProperty(canvas, 'getContext', {
            value: vi.fn(() => mock.context),
            configurable: true,
        });
    });

    it('renders primitives and records diagnostics', () => {
        const renderer = new WebGLRenderer();
        renderer.init({ canvas });
        const { primitive } = createPrimitive();
        renderer.renderFrame({ timeSec: 0, sceneConfig: { backgroundColor: '#ff00ff' }, renderObjects: [primitive] });
        const diagnostics = renderer.diagnostics;
        expect(diagnostics?.drawCalls).toBe(1);
        expect(diagnostics?.frameHash).toMatch(/^[0-9a-f]{8}$/);
        expect(mock.context.clearColor).toHaveBeenCalled();
        expect(mock.context.drawArrays).toHaveBeenCalledWith(mock.context.TRIANGLES, 0, primitive.vertexCount);
    });

    it('produces hashes compatible with Canvas snapshots for identical pixels', () => {
        const renderer = new WebGLRenderer();
        renderer.init({ canvas });
        const { primitive } = createPrimitive();
        renderer.renderFrame({ timeSec: 0, sceneConfig: { backgroundColor: '#000000' }, renderObjects: [primitive] });
        const diagnostics = renderer.diagnostics;
        expect(diagnostics).not.toBeNull();
        const pixels = mock.getPixels();
        expect(pixels).not.toBeNull();
        const canvasImageData = new ImageData(new Uint8ClampedArray(pixels!), canvas.width, canvas.height);
        const canvasHash = hashPixelBuffer(canvasImageData.data);
        expect(canvasHash.hash).toBe(diagnostics?.frameHash);
    });

    it('applies device pixel ratio during resize', () => {
        const renderer = new WebGLRenderer();
        renderer.init({ canvas, devicePixelRatio: 2 });
        renderer.resize({ width: 100, height: 50, devicePixelRatio: 2 });
        expect(canvas.width).toBe(200);
        expect(canvas.height).toBe(100);
    });
});
