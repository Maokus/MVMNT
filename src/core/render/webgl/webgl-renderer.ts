import type {
    FrameCaptureRequest,
    RenderObject,
    RendererCaptureResult,
    RendererContract,
    RendererFrameInput,
    RendererInitOptions,
    RendererInitResult,
    RendererResizePayload,
} from '../renderer-contract';
import { attachContextLossHandlers, acquireWebGLContext, WebGLContextError } from './context';
import { GeometryBatchCache } from './primitive-batcher';
import { MaterialRegistry } from './material';
import { hashFrame, hashFromSummary } from './frame-hash';
import type { RendererDiagnostics, WebGLRenderPrimitive, WebGLRendererState } from './types';
import { WebGLRenderAdapter } from './adapter';
import type { AdaptResult } from './adapter';

export class WebGLRenderer implements RendererContract<WebGLRenderPrimitive | RenderObject> {
    private canvas: HTMLCanvasElement | null = null;
    private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    private contextType: 'webgl' | 'webgl2' = 'webgl';
    private detachContextListeners: (() => void) | null = null;
    private dpr = 1;
    private materialRegistry: MaterialRegistry | null = null;
    private geometryCache: GeometryBatchCache | null = null;
    private state: WebGLRendererState = { diagnostics: null };
    private scratchPixels: Uint8Array | null = null;
    private contextLost = false;
    private adapter: WebGLRenderAdapter | null = null;
    private diagnosticsLogged = {
        context: false,
        viewport: false,
        framebuffer: false,
    };

    init(options: RendererInitOptions): RendererInitResult {
        const { canvas, context, devicePixelRatio } = options;
        const { gl, contextType } = acquireWebGLContext(canvas, { context });
        this.canvas = canvas;
        this.gl = gl;
        this.contextType = contextType === 'webgl2' ? 'webgl2' : 'webgl';
        this.materialRegistry = new MaterialRegistry(gl);
        this.geometryCache = new GeometryBatchCache(gl);
        this.adapter = new WebGLRenderAdapter(gl);
        this.dpr = devicePixelRatio ?? this.resolveDevicePixelRatio();

        this.detachContextListeners?.();
        this.detachContextListeners = attachContextLossHandlers(canvas, {
            onLost: () => {
                this.contextLost = true;
            },
            onRestored: () => {
                if (!this.canvas) return;
                const acquisition = acquireWebGLContext(this.canvas, {});
                this.gl = acquisition.gl;
                this.contextType = acquisition.contextType === 'webgl2' ? 'webgl2' : 'webgl';
                this.materialRegistry = new MaterialRegistry(this.gl);
                this.geometryCache = new GeometryBatchCache(this.gl);
                this.adapter = this.gl ? new WebGLRenderAdapter(this.gl) : null;
                this.contextLost = false;
                const glRestored = this.gl;
                if (!glRestored) return;
                this.initializeGLState(glRestored);
                this.resize({
                    width: this.canvas.width / this.dpr,
                    height: this.canvas.height / this.dpr,
                    devicePixelRatio: this.dpr,
                });
            },
        });

        this.initializeGLState(gl);
        this.resize({ width: canvas.clientWidth || canvas.width, height: canvas.clientHeight || canvas.height });
        this.logOnce('webgl-context-ready', {
            contextType: this.contextType,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
        });

        return { canvas, context: gl, contextType };
    }

    resize({ width, height, devicePixelRatio }: RendererResizePayload): void {
        const canvas = this.canvas;
        const gl = this.gl;
        if (!canvas || !gl) return;
        const resolvedDpr = devicePixelRatio ?? this.dpr;
        this.dpr = resolvedDpr;
        const pixelWidth = Math.max(1, Math.floor(width * resolvedDpr));
        const pixelHeight = Math.max(1, Math.floor(height * resolvedDpr));
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        gl.viewport(0, 0, pixelWidth, pixelHeight);
        this.logOnce('webgl-viewport-initialized', {
            cssWidth: width,
            cssHeight: height,
            devicePixelRatio: resolvedDpr,
            framebufferWidth: pixelWidth,
            framebufferHeight: pixelHeight,
        });
    }

    renderFrame(input: RendererFrameInput<WebGLRenderPrimitive | RenderObject>): void {
        const gl = this.gl;
        const canvas = this.canvas;
        if (!gl || !canvas) {
            throw new WebGLContextError('WebGLRenderer has not been initialized.');
        }
        if (this.contextLost) {
            throw new WebGLContextError('WebGL context is lost.');
        }

        const { renderObjects, sceneConfig } = input;
        const adapter = this.adapter;
        let primitives = renderObjects as readonly WebGLRenderPrimitive[];
        let adapterResult: AdaptResult | null = null;
        if (renderObjects.length > 0 && !this.isPrimitive(renderObjects[0])) {
            if (!adapter) throw new WebGLContextError('WebGL render adapter is not initialized.');
            const logicalWidth = this.resolveFrameDimension(
                (sceneConfig as { viewportWidth?: unknown })?.viewportWidth,
                canvas.width
            );
            const logicalHeight = this.resolveFrameDimension(
                (sceneConfig as { viewportHeight?: unknown })?.viewportHeight,
                canvas.height
            );
            adapterResult = adapter.adapt(renderObjects as RenderObject[], {
                width: logicalWidth,
                height: logicalHeight,
            });
            primitives = adapterResult.primitives;
        }

        const [r, g, b, a] = this.resolveBackgroundColor(sceneConfig);
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        let drawCalls = 0;
        const registry = this.materialRegistry;
        const cache = this.geometryCache;
        if (!registry || !cache) {
            throw new Error('WebGLRenderer caches are not initialized.');
        }

        this.logFramebufferBinding(gl);

        for (const primitive of primitives) {
            const program = registry.resolve(primitive.material);
            program.use();
            const batch = cache.resolve(primitive.geometry);
            batch.ensureUploaded();
            batch.bind();
            program.configureAttributes((attribute, location) => {
                const type = attribute.type ?? gl.FLOAT;
                gl.enableVertexAttribArray(location);
                gl.vertexAttribPointer(
                    location,
                    attribute.size,
                    type,
                    attribute.normalized ?? false,
                    attribute.stride ?? 0,
                    attribute.offset ?? 0
                );
            });
            if (primitive.uniforms) {
                for (const [name, value] of Object.entries(primitive.uniforms)) {
                    program.setUniform(name, value);
                }
            }
            if (primitive.textureHandle) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, primitive.textureHandle.texture);
            }
            const mode = primitive.mode ?? program.drawMode;
            gl.drawArrays(mode, 0, primitive.vertexCount);
            drawCalls += 1;
        }

        const diagnostics = this.computeDiagnostics(gl, canvas.width, canvas.height, drawCalls, [r, g, b, a]);
        if (adapterResult) {
            diagnostics.resources = {
                geometryBytes: adapterResult.diagnostics.geometryBytes,
                textures: adapterResult.diagnostics.textures,
                primitives: {
                    fills: adapterResult.diagnostics.fillCount,
                    strokes: adapterResult.diagnostics.strokeCount,
                    shadows: adapterResult.diagnostics.shadowCount,
                    images: adapterResult.diagnostics.imageCount,
                    texts: adapterResult.diagnostics.textCount,
                    particles: adapterResult.diagnostics.particleCount,
                    unsupported: adapterResult.diagnostics.unsupportedCount,
                },
            };
        } else if (diagnostics.resources) {
            diagnostics.resources = undefined;
        }
        this.state.diagnostics = diagnostics;
    }

    captureFrame(request: FrameCaptureRequest<WebGLRenderPrimitive | RenderObject>): RendererCaptureResult {
        const gl = this.gl;
        const canvas = this.canvas;
        if (!gl || !canvas) throw new WebGLContextError('WebGLRenderer has not been initialized.');
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const offscreenGl = acquireWebGLContext(offscreen, { preferWebGL2: this.contextType === 'webgl2' }).gl;
        const renderer = new WebGLRenderer();
        renderer.init({ canvas: offscreen, context: offscreenGl });
        renderer.renderFrame(request);
        const pixelBuffer = new Uint8Array(offscreen.width * offscreen.height * 4);
        offscreenGl.readPixels(
            0,
            0,
            offscreen.width,
            offscreen.height,
            offscreenGl.RGBA,
            offscreenGl.UNSIGNED_BYTE,
            pixelBuffer
        );
        const imageData = new ImageData(new Uint8ClampedArray(pixelBuffer), offscreen.width, offscreen.height);
        const ctx = offscreen.getContext('2d');
        if (ctx) {
            ctx.putImageData(imageData, 0, 0);
        }
        switch (request.format) {
            case 'imageData': {
                return imageData;
            }
            case 'dataURL':
                return offscreen.toDataURL();
            case 'blob':
                return new Promise<Blob | null>((resolve) => offscreen.toBlob(resolve));
            default:
                return offscreen.toDataURL();
        }
    }

    teardown(): void {
        this.detachContextListeners?.();
        this.detachContextListeners = null;
        this.materialRegistry?.dispose();
        this.materialRegistry = null;
        this.geometryCache?.dispose();
        this.geometryCache = null;
        this.adapter?.dispose();
        this.adapter = null;
        this.canvas = null;
        this.gl = null;
        this.scratchPixels = null;
        this.state = { diagnostics: null };
    }

    get diagnostics(): RendererDiagnostics | null {
        return this.state.diagnostics;
    }

    private initializeGLState(gl: WebGLRenderingContext | WebGL2RenderingContext) {
        gl.disable(gl.DITHER);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    private resolveDevicePixelRatio(): number {
        if (typeof window !== 'undefined' && window.devicePixelRatio) {
            return window.devicePixelRatio;
        }
        return 1;
    }

    private resolveBackgroundColor(sceneConfig: Record<string, unknown>): [number, number, number, number] {
        const raw = (sceneConfig?.backgroundColor as string | undefined) ?? '#000000';
        return this.parseColor(raw);
    }

    private parseColor(color: string): [number, number, number, number] {
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            const value = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;
            const int = parseInt(value, 16);
            const r = ((int >> 16) & 0xff) / 255;
            const g = ((int >> 8) & 0xff) / 255;
            const b = (int & 0xff) / 255;
            return [r, g, b, 1];
        }
        const match = /rgba?\(([^)]+)\)/.exec(color);
        if (match) {
            const parts = match[1].split(',').map((part) => Number(part.trim()));
            const [r, g, b, a = 1] = parts;
            return [r / 255, g / 255, b / 255, a];
        }
        return [0, 0, 0, 1];
    }

    private computeDiagnostics(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        width: number,
        height: number,
        drawCalls: number,
        clearColor: [number, number, number, number]
    ): RendererDiagnostics {
        try {
            if (width === 0 || height === 0) {
                throw new Error('Skipping frame hash for zero-sized surface.');
            }
            this.scratchPixels = this.ensureScratch(width, height, this.scratchPixels);
            const hashResult = hashFrame(gl, width, height, this.scratchPixels);
            return {
                frameHash: hashResult.hash,
                drawCalls,
                bytesHashed: hashResult.bytesSampled,
                contextType: this.contextType,
            };
        } catch (error) {
            const summary = `${width}x${height}|draws=${drawCalls}|clear=${clearColor.join(',')}`;
            const fallback = hashFromSummary(summary);
            return {
                frameHash: fallback.hash,
                drawCalls,
                bytesHashed: fallback.bytesSampled,
                contextType: this.contextType,
            };
        }
    }

    private ensureScratch(width: number, height: number, existing: Uint8Array | null): Uint8Array {
        const required = width * height * 4;
        if (!existing || existing.length < required) {
            return new Uint8Array(required);
        }
        return existing;
    }

    private isPrimitive(object: unknown): object is WebGLRenderPrimitive {
        if (!object || typeof object !== 'object') return false;
        const candidate = object as Partial<WebGLRenderPrimitive>;
        return Boolean(candidate.geometry && candidate.material && typeof candidate.vertexCount === 'number');
    }

    private logOnce(
        event: 'webgl-context-ready' | 'webgl-viewport-initialized' | 'webgl-framebuffer-binding',
        payload: Record<string, unknown>
    ): void {
        const flagMap: Record<typeof event, keyof typeof this.diagnosticsLogged> = {
            'webgl-context-ready': 'context',
            'webgl-viewport-initialized': 'viewport',
            'webgl-framebuffer-binding': 'framebuffer',
        };
        const key = flagMap[event];
        if (this.diagnosticsLogged[key]) {
            return;
        }
        this.diagnosticsLogged[key] = true;
        try {
            console.info(`[RendererDiagnostics] ${event}`, payload);
        } catch {}
    }

    private logFramebufferBinding(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
        if (this.diagnosticsLogged.framebuffer) {
            return;
        }
        try {
            const binding = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            this.logOnce('webgl-framebuffer-binding', {
                framebuffer: binding ?? 'default-framebuffer',
            });
        } catch {
            /* ignore */
        }
    }

    private resolveFrameDimension(viewportDimension: unknown, framebufferDimension: number): number {
        if (typeof viewportDimension === 'number' && Number.isFinite(viewportDimension) && viewportDimension > 0) {
            return viewportDimension;
        }
        const dpr = this.dpr > 0 ? this.dpr : 1;
        const logical = framebufferDimension / dpr;
        return logical > 0 ? logical : framebufferDimension;
    }
}
