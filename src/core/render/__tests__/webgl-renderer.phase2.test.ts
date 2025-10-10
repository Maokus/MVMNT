import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { WebGLRenderAdapter } from '../webgl/adapter';
import { WebGLRenderer } from '../webgl/webgl-renderer';
import { Rectangle } from '../render-objects/rectangle';
import { Line } from '../render-objects/line';
import { Text } from '../render-objects/text';
import { Image as ImageObject } from '../render-objects/image';
import { ParticleSystem } from '../render-objects/particle-system';
import type { WebGLRenderPrimitive } from '../webgl/types';
import type { MaterialDescriptor } from '../webgl/material';

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

interface MockGLContext {
    context: WebGLRenderingContext;
    getPixels: () => Uint8Array | null;
    bufferData: Mock;
}

function createExtendedMockGL(): MockGLContext {
    const mockUniformLocation = {} as WebGLUniformLocation;
    let lastPixels: Uint8Array | null = null;
    const bufferData = vi.fn();
    const gl = {
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88e4,
        COLOR_BUFFER_BIT: 0x4000,
        DEPTH_BUFFER_BIT: 0x0100,
        FLOAT: 0x1406,
        TRIANGLES: 0x0004,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        ALPHA: 0x1906,
        TEXTURE_2D: 0x0de1,
        TEXTURE0: 0x84c0,
        CLAMP_TO_EDGE: 0x812f,
        LINEAR: 0x2601,
        VERTEX_SHADER: 0x8b31,
        FRAGMENT_SHADER: 0x8b30,
        SRC_ALPHA: 0x0302,
        ONE_MINUS_SRC_ALPHA: 0x0303,
        createBuffer: vi.fn(() => ({} as WebGLBuffer)),
        bindBuffer: vi.fn(),
        bufferData,
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
                    pixels[i] = (i + x + y) % 255;
                }
                lastPixels = new Uint8Array(pixels);
            }
        }),
        getError: vi.fn(() => 0),
        getParameter: vi.fn(() => 0),
        createTexture: vi.fn(() => ({} as WebGLTexture)),
        deleteTexture: vi.fn(),
        bindTexture: vi.fn(),
        texParameteri: vi.fn(),
        texImage2D: vi.fn(),
        texSubImage2D: vi.fn(),
        pixelStorei: vi.fn(),
        activeTexture: vi.fn(),
    } as unknown as WebGLRenderingContext;
    return {
        context: gl,
        getPixels: () => lastPixels,
        bufferData,
    };
}

describe('WebGLRenderAdapter', () => {
    it('adapts render objects into WebGL primitives', () => {
        const { context } = createExtendedMockGL();
        const adapter = new WebGLRenderAdapter(context);
        const rect = new Rectangle(0, 0, 50, 40, '#ff0000').setStroke('#00ff00', 2);
        const line = new Line(0, 0, 80, 0, '#0000ff', 4);
        const text = new Text(10, 10, 'GPU');
        const imageEl = document.createElement('img');
        imageEl.width = 32;
        imageEl.height = 32;
        const image = new ImageObject(0, 0, 32, 32, imageEl);
        const particles = new ParticleSystem();
        particles.addParticle({ x: 5, y: 5, size: 6, color: '#abcdef', opacity: 0.8 });

        const result = adapter.adapt([rect, line, text, image, particles], { width: 640, height: 360 });

        expect(result.primitives.length).toBeGreaterThan(0);
        expect(result.diagnostics.fillCount).toBeGreaterThan(0);
        expect(result.diagnostics.strokeCount).toBeGreaterThan(0);
        expect(result.diagnostics.textCount).toBe(1);
        expect(result.diagnostics.imageCount).toBe(1);
        expect(result.diagnostics.particleCount).toBe(1);
        expect(result.primitives.some((primitive) => primitive.textureHandle)).toBe(true);
    });
});

describe('WebGLRenderer phase 2 integration', () => {
    let mock: MockGLContext;
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
        mock = createExtendedMockGL();
        canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 72;
        Object.defineProperty(canvas, 'clientWidth', { value: 128, configurable: true });
        Object.defineProperty(canvas, 'clientHeight', { value: 72, configurable: true });
        Object.defineProperty(canvas, 'getContext', {
            value: vi.fn(() => mock.context),
            configurable: true,
        });
    });

    it('converts RenderObjects via adapter and records resource diagnostics', () => {
        const renderer = new WebGLRenderer();
        renderer.init({ canvas });
        const rect = new Rectangle(0, 0, 40, 20, '#ff0000');
        const text = new Text(5, 5, 'Phase2');
        const imgEl = document.createElement('img');
        imgEl.width = 16;
        imgEl.height = 16;
        const img = new ImageObject(10, 10, 16, 16, imgEl);
        const line = new Line(0, 0, 30, 10, '#00ffcc', 3);
        const particles = new ParticleSystem();
        particles.addParticle({ x: 8, y: 8, size: 5, color: '#123456', opacity: 1 });

        renderer.renderFrame({ timeSec: 0, sceneConfig: { backgroundColor: '#000000' }, renderObjects: [rect, text, img, line, particles] });

        expect(mock.context.drawArrays).toHaveBeenCalled();
        const diagnostics = renderer.diagnostics;
        expect(diagnostics?.resources?.primitives.texts).toBeGreaterThanOrEqual(1);
        expect(diagnostics?.resources?.primitives.images).toBeGreaterThanOrEqual(1);
        expect(diagnostics?.resources?.geometryBytes).toBeGreaterThan(0);
        expect(diagnostics?.atlas?.uploadsThisFrame).toBeLessThanOrEqual(1);
        const subImageCalls = (mock.context.texSubImage2D as Mock).mock.calls;
        expect(subImageCalls.length).toBeLessThanOrEqual(1);
        if (subImageCalls.length > 0) {
            expect(subImageCalls[0]?.[8]).toBeInstanceOf(Uint8Array);
        }
    });

    it('continues to render existing WebGL primitives without re-adapting', () => {
        const renderer = new WebGLRenderer();
        renderer.init({ canvas });
        const geometry = {
            id: 'manual',
            data: new Float32Array([0, 0, 1, 0, 0, 1]),
            attributes: [{ name: 'a_position', size: 2, stride: 0, offset: 0 }],
        };
        const primitive: WebGLRenderPrimitive = {
            geometry,
            material: {
                id: 'basic',
                vertexSource: 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }',
                fragmentSource: 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }',
                attributes: [{ name: 'a_position', size: 2, stride: 0, offset: 0 }],
            },
            vertexCount: 3,
        };
        renderer.renderFrame({ timeSec: 0, sceneConfig: { backgroundColor: '#ffffff' }, renderObjects: [primitive] });
        expect(mock.context.drawArrays).toHaveBeenCalled();
    });

    it('reuploads geometry data when a cached source is replaced', () => {
        const renderer = new WebGLRenderer();
        renderer.init({ canvas });
        const material: MaterialDescriptor = {
            id: 'basic',
            vertexSource: 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }',
            fragmentSource: 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }',
            attributes: [{ name: 'a_position', size: 2, stride: 0, offset: 0 }],
        };
        const firstGeometry = {
            id: 'manual',
            data: new Float32Array([0, 0, 1, 0, 0, 1]),
            attributes: [{ name: 'a_position', size: 2, stride: 0, offset: 0 }],
        };
        const firstPrimitive: WebGLRenderPrimitive = {
            geometry: firstGeometry,
            material,
            vertexCount: 3,
        };
        renderer.renderFrame({
            timeSec: 0,
            sceneConfig: { backgroundColor: '#000000' },
            renderObjects: [firstPrimitive],
        });

        const updatedGeometry = {
            id: 'manual',
            data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
            attributes: [{ name: 'a_position', size: 2, stride: 0, offset: 0 }],
        };
        const updatedPrimitive: WebGLRenderPrimitive = {
            geometry: updatedGeometry,
            material,
            vertexCount: 6,
        };

        mock.bufferData.mockClear();

        renderer.renderFrame({
            timeSec: 1,
            sceneConfig: { backgroundColor: '#000000' },
            renderObjects: [updatedPrimitive],
        });

        expect(mock.bufferData).toHaveBeenCalledTimes(1);
        const [, uploaded] = mock.bufferData.mock.calls[0];
        expect(uploaded).toBe(updatedGeometry.data);
    });
});
