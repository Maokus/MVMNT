import type { RenderConfig, Bounds } from './render-objects/base';
import type { PerspectiveElementRoot } from './render-objects/perspective-element-root';
import { PerspectiveDiagnostics } from './perspective-diagnostics';
import {
    applyAffinePoint,
    clipPerspectiveBounds,
    getProjectedBounds,
    invertAffineTransform,
    invertHomography,
    warpLocalPoint,
    type AffineTransform,
    type Homography,
    type PerspectiveBounds,
} from '@math/perspective-warp';

interface Surface {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
}

export interface PerspectiveCompositorOptions {
    createCanvas?: () => HTMLCanvasElement;
}

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_texture;
uniform mat3 u_inverseAffine;
uniform mat3 u_inverseWarp;
uniform vec4 u_baseBounds;
uniform vec4 u_sourceBounds;
uniform float u_resolution;
uniform vec2 u_textureSize;
uniform vec2 u_outputOrigin;
uniform float u_outputHeight;
void main() {
    vec2 world = vec2(u_outputOrigin.x + gl_FragCoord.x,
                      u_outputOrigin.y + u_outputHeight - gl_FragCoord.y);
    vec3 localH = u_inverseAffine * vec3(world, 1.0);
    if (abs(localH.z) < 0.0000001) discard;
    vec2 warpedLocal = localH.xy / localH.z;
    vec2 warpedNormalized = (warpedLocal - u_baseBounds.xy) / u_baseBounds.zw;
    vec3 sourceH = u_inverseWarp * vec3(warpedNormalized, 1.0);
    if (abs(sourceH.z) < 0.0000001) discard;
    vec2 sourceNormalized = sourceH.xy / sourceH.z;
    vec2 sourceLocal = u_baseBounds.xy + sourceNormalized * u_baseBounds.zw;
    vec2 sourcePixel = (sourceLocal - u_sourceBounds.xy) * u_resolution;
    vec2 logicalSize = u_sourceBounds.zw * u_resolution;
    if (sourcePixel.x < 0.0 || sourcePixel.y < 0.0 ||
        sourcePixel.x > logicalSize.x || sourcePixel.y > logicalSize.y) discard;
    gl_FragColor = texture2D(u_texture, sourcePixel / u_textureSize);
}
`;

const bucket = (value: number): number => Math.max(64, Math.ceil(value / 64) * 64);
const now = (): number => typeof performance !== 'undefined' ? performance.now() : Date.now();

function matrixForWebGL(matrix: Homography): Float32Array {
    return new Float32Array([
        matrix[0], matrix[3], matrix[6],
        matrix[1], matrix[4], matrix[7],
        matrix[2], matrix[5], matrix[8],
    ]);
}

function affineAsHomography(matrix: AffineTransform): Homography {
    return [matrix.a, matrix.c, matrix.e, matrix.b, matrix.d, matrix.f, 0, 0, 1];
}

function projectedRectBounds(root: PerspectiveElementRoot, bounds: Bounds): PerspectiveBounds | null {
    const matrix = root.warpMatrix;
    const base = root.baseBounds;
    if (!matrix || !base) return null;
    const affine = root.getAffineTransform();
    const points = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
    ].map((point) => warpLocalPoint(matrix, base, point))
     .map((point) => point ? applyAffinePoint(affine, point) : null);
    return points.some((point) => !point) ? null : getProjectedBounds(points as Array<{ x: number; y: number }>);
}

export class PerspectiveCompositor {
    readonly diagnostics = new PerspectiveDiagnostics();
    private readonly createCanvas: () => HTMLCanvasElement;
    private readonly surfaces = new Map<string, Surface[]>();
    private scratchCanvas: HTMLCanvasElement | null = null;
    private gl: WebGLRenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private buffer: WebGLBuffer | null = null;
    private texture: WebGLTexture | null = null;
    private textureWidth = 0;
    private textureHeight = 0;
    private timerExtension: any = null;
    private pendingTimerQueries: any[] = [];
    private maxTextureSize = 4096;
    private contextLost = false;
    private disposed = false;
    private warned = new Set<string>();

    constructor(options: PerspectiveCompositorOptions = {}) {
        this.createCanvas = options.createCanvas ?? (() => document.createElement('canvas'));
    }

    beginFrame(): void {
        this.diagnostics.beginFrame();
        this.pollGpuTimers();
    }

    endFrame(): void {
        this.diagnostics.endFrame();
    }

    renderElement(root: PerspectiveElementRoot, target: CanvasRenderingContext2D, config: RenderConfig, time: number): boolean {
        if (this.disposed || !root.baseBounds || !root.warpMatrix) return false;
        const canvas = config.canvas;
        if (!canvas || canvas.width <= 0 || canvas.height <= 0) return false;
        const sourceBounds = root.visualBounds ?? root.baseBounds;
        if (sourceBounds.width <= 0 || sourceBounds.height <= 0) return true;
        const projected = projectedRectBounds(root, sourceBounds);
        if (!projected) return false;
        const clipped = clipPerspectiveBounds(projected, canvas.width, canvas.height);
        if (!clipped) return true;
        if (!this.ensureWebGL()) return false;

        const bucketTextureLimit = Math.floor(this.maxTextureSize / 64) * 64;
        if (bucketTextureLimit < 64) {
            this.warnOnce('texture-limit', `Perspective compositor texture limit is too small (${this.maxTextureSize}px).`);
            return false;
        }
        const resolution = Math.min(
            this.selectResolution(root),
            bucketTextureLimit / sourceBounds.width,
            bucketTextureLimit / sourceBounds.height
        );
        const logicalWidth = Math.max(1, Math.ceil(sourceBounds.width * resolution));
        const logicalHeight = Math.max(1, Math.ceil(sourceBounds.height * resolution));
        if (bucket(logicalWidth) > this.maxTextureSize || bucket(logicalHeight) > this.maxTextureSize) {
            this.warnOnce('texture-limit', `Perspective surface exceeds the GPU texture limit (${this.maxTextureSize}px).`);
            return false;
        }
        let surface: Surface | null = null;
        try {
            surface = this.acquireSurface(bucket(logicalWidth), bucket(logicalHeight));
            const rasterStart = now();
            surface.ctx.setTransform(1, 0, 0, 1, 0, 0);
            surface.ctx.clearRect(0, 0, surface.width, surface.height);
            surface.ctx.save();
            try {
                surface.ctx.scale(resolution, resolution);
                surface.ctx.translate(-sourceBounds.x, -sourceBounds.y);
                for (const child of root.getChildren()) child.render(surface.ctx, { ...config, canvas: surface.canvas }, time);
            } finally {
                surface.ctx.restore();
            }
            this.diagnostics.add({ sourceRasterMs: now() - rasterStart, sourcePixels: logicalWidth * logicalHeight });

            const ok = this.submit(root, surface, sourceBounds, resolution, clipped, target);
            if (ok) this.diagnostics.add({ warpedElements: 1 });
            return ok;
        } catch (error) {
            this.warnOnce('source-raster', `Perspective source raster failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        } finally {
            if (surface) this.releaseSurface(surface);
        }
    }

    recordFallback(): void {
        this.diagnostics.add({ fallbackElements: 1 });
    }

    recordIdentityWarp(): void {
        this.diagnostics.add({ warpedElements: 1 });
    }

    reportFallback(code: string, message: string): void {
        this.warnOnce(code, message);
        this.recordFallback();
    }

    private selectResolution(root: PerspectiveElementRoot): number {
        const base = root.baseBounds!;
        const corners = root.getProjectedCorners();
        if (!corners || base.width <= 0 || base.height <= 0) return 1;
        const ratios = [
            Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) / base.width,
            Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y) / base.height,
            Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y) / base.width,
            Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y) / base.height,
        ];
        return Math.max(0.5, Math.min(2, Math.max(...ratios.filter(Number.isFinite), 1)));
    }

    private acquireSurface(width: number, height: number): Surface {
        const key = `${width}x${height}`;
        const pooled = this.surfaces.get(key)?.pop();
        if (pooled) return pooled;
        const canvas = this.createCanvas();
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create perspective source context');
        this.diagnostics.add({ surfaceReallocations: 1 });
        return { canvas, ctx, width, height };
    }

    private releaseSurface(surface: Surface): void {
        const key = `${surface.width}x${surface.height}`;
        const pool = this.surfaces.get(key) ?? [];
        pool.push(surface);
        if (!this.surfaces.has(key) && this.surfaces.size >= 8) {
            const oldest = this.surfaces.keys().next().value as string | undefined;
            if (oldest) this.surfaces.delete(oldest);
        }
        this.surfaces.set(key, pool);
    }

    private ensureWebGL(): boolean {
        if (this.gl && this.program && !this.contextLost) return true;
        if (this.contextLost) return false;
        if (typeof document === 'undefined') return false;
        try {
            if (!this.scratchCanvas) {
                this.scratchCanvas = this.createCanvas();
                this.scratchCanvas.addEventListener('webglcontextlost', (event) => {
                    event.preventDefault();
                    this.contextLost = true;
                    this.diagnostics.add({ contextLossEvents: 1 });
                    this.warnOnce('context-loss', 'Perspective WebGL context was lost; elements are temporarily unwarped.');
                });
                this.scratchCanvas.addEventListener('webglcontextrestored', () => {
                    this.contextLost = false;
                    this.gl = null;
                    this.program = null;
                    this.buffer = null;
                    this.texture = null;
                    this.textureWidth = 0;
                    this.textureHeight = 0;
                    this.timerExtension = null;
                    this.pendingTimerQueries = [];
                });
            }
            const gl = this.scratchCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
            if (!gl) throw new Error('WebGL is unavailable');
            this.gl = gl;
            this.maxTextureSize = Math.min(4096, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096);
            this.timerExtension = gl.getExtension('EXT_disjoint_timer_query');
            const vertex = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
            const fragment = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
            const program = gl.createProgram();
            if (!program || !vertex || !fragment) throw new Error('Could not allocate perspective shader');
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
            const buffer = gl.createBuffer();
            const texture = gl.createTexture();
            if (!buffer || !texture) throw new Error('Could not allocate perspective GPU resources');
            this.program = program;
            this.buffer = buffer;
            this.texture = texture;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            return true;
        } catch (error) {
            this.warnOnce('initialization', `Perspective compositor unavailable: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private compileShader(type: number, source: string): WebGLShader | null {
        const gl = this.gl!;
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader) || 'Shader compile failed';
            gl.deleteShader(shader);
            throw new Error(message);
        }
        return shader;
    }

    private submit(
        root: PerspectiveElementRoot,
        surface: Surface,
        sourceBounds: Bounds,
        resolution: number,
        clipped: PerspectiveBounds,
        target: CanvasRenderingContext2D
    ): boolean {
        const gl = this.gl!;
        const program = this.program!;
        const inverseWarp = invertHomography(root.warpMatrix!);
        const inverseAffine = invertAffineTransform(root.getAffineTransform());
        if (!inverseWarp || !inverseAffine || !this.scratchCanvas) return false;
        const outputWidth = bucket(Math.ceil(clipped.width));
        const outputHeight = bucket(Math.ceil(clipped.height));
        if (this.scratchCanvas.width !== outputWidth || this.scratchCanvas.height !== outputHeight) {
            this.scratchCanvas.width = outputWidth;
            this.scratchCanvas.height = outputHeight;
            this.diagnostics.add({ surfaceReallocations: 1 });
        }
        try {
            const submitStart = now();
            gl.viewport(0, 0, outputWidth, outputHeight);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            const position = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            if (this.textureWidth === surface.width && this.textureHeight === surface.height) {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, surface.canvas);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface.canvas);
                this.textureWidth = surface.width;
                this.textureHeight = surface.height;
                this.diagnostics.add({ surfaceReallocations: 1 });
            }
            const uniform = (name: string) => gl.getUniformLocation(program, name);
            gl.uniform1i(uniform('u_texture'), 0);
            gl.uniformMatrix3fv(uniform('u_inverseAffine'), false, matrixForWebGL(affineAsHomography(inverseAffine)));
            gl.uniformMatrix3fv(uniform('u_inverseWarp'), false, matrixForWebGL(inverseWarp));
            const base = root.baseBounds!;
            gl.uniform4f(uniform('u_baseBounds'), base.x, base.y, base.width, base.height);
            gl.uniform4f(uniform('u_sourceBounds'), sourceBounds.x, sourceBounds.y, sourceBounds.width, sourceBounds.height);
            gl.uniform1f(uniform('u_resolution'), resolution);
            gl.uniform2f(uniform('u_textureSize'), surface.width, surface.height);
            gl.uniform2f(uniform('u_outputOrigin'), clipped.x, clipped.y);
            gl.uniform1f(uniform('u_outputHeight'), outputHeight);
            const timerQuery = this.timerExtension?.createQueryEXT?.() ?? null;
            if (timerQuery) this.timerExtension.beginQueryEXT(this.timerExtension.TIME_ELAPSED_EXT, timerQuery);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            if (timerQuery) {
                this.timerExtension.endQueryEXT(this.timerExtension.TIME_ELAPSED_EXT);
                this.pendingTimerQueries.push(timerQuery);
                if (this.pendingTimerQueries.length > 128) {
                    const stale = this.pendingTimerQueries.shift();
                    if (stale) this.timerExtension.deleteQueryEXT(stale);
                }
            }
            if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL upload or draw failed');
            this.diagnostics.add({
                gpuSubmissionMs: now() - submitStart,
                uploadedBytes: surface.width * surface.height * 4,
                projectedPixels: Math.ceil(clipped.width) * Math.ceil(clipped.height),
            });
            const compositeStart = now();
            target.save();
            target.globalAlpha *= root.opacity;
            target.globalCompositeOperation = 'source-over';
            target.drawImage(this.scratchCanvas, 0, 0, Math.ceil(clipped.width), Math.ceil(clipped.height), clipped.x, clipped.y, Math.ceil(clipped.width), Math.ceil(clipped.height));
            target.restore();
            this.diagnostics.add({ canvasCompositeMs: now() - compositeStart });
            return true;
        } catch (error) {
            this.warnOnce('submission', `Perspective rendering failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private warnOnce(code: string, message: string): void {
        if (this.warned.has(code)) return;
        this.warned.add(code);
        console.warn(`[PerspectiveWarp] ${message}`);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mvmnt-diagnostic', { detail: { source: 'perspective-warp', code, message } }));
    }

    private pollGpuTimers(): void {
        const gl = this.gl;
        const extension = this.timerExtension;
        if (!gl || !extension || !this.pendingTimerQueries.length) return;
        const remaining: any[] = [];
        for (const query of this.pendingTimerQueries) {
            const available = extension.getQueryObjectEXT(query, extension.QUERY_RESULT_AVAILABLE_EXT);
            const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
            if (!available) {
                remaining.push(query);
                continue;
            }
            if (!disjoint) {
                const nanoseconds = extension.getQueryObjectEXT(query, extension.QUERY_RESULT_EXT);
                if (Number.isFinite(nanoseconds)) this.diagnostics.add({ gpuExecutionMs: nanoseconds / 1_000_000 });
            }
            extension.deleteQueryEXT(query);
        }
        this.pendingTimerQueries = remaining;
    }

    dispose(): void {
        if (this.disposed) return;
        const gl = this.gl;
        if (gl) {
            if (this.texture) gl.deleteTexture(this.texture);
            if (this.buffer) gl.deleteBuffer(this.buffer);
            if (this.program) gl.deleteProgram(this.program);
        }
        this.surfaces.clear();
        this.gl = null;
        this.program = null;
        this.buffer = null;
        this.texture = null;
        this.scratchCanvas = null;
        this.timerExtension = null;
        this.pendingTimerQueries = [];
        this.disposed = true;
    }
}
