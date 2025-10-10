import type { RenderObject } from '../renderer-contract';
import { Rectangle } from '../render-objects/rectangle';
import { Line } from '../render-objects/line';
import { Image as ImageObject } from '../render-objects/image';
import { Text } from '../render-objects/text';
import { ParticleSystem } from '../render-objects/particle-system';
import { matrixFromTransform, multiplyMatrices, Matrix3, IDENTITY_MATRIX, applyMatrix } from './math';
import { parseCssColor, multiplyColorAlpha } from './color';
import type { WebGLContext } from './buffers';
import type { WebGLGeometrySource, WebGLRenderPrimitive, AtlasDiagnostics } from './types';
import { TextureCache, type TextureResourceDiagnostics, type TextureHandle } from './texture-cache';
import { GlyphAtlas } from './glyph-atlas';
import {
    SOLID_ROUNDED_MATERIAL,
    IMAGE_MATERIAL,
    TEXT_MATERIAL,
    SHADOW_MATERIAL,
    SOLID_COLOR_MATERIAL,
} from './material-library';

export interface FrameDimensions {
    width: number;
    height: number;
}

export interface AdapterDiagnostics {
    fillCount: number;
    strokeCount: number;
    shadowCount: number;
    imageCount: number;
    textCount: number;
    particleCount: number;
    unsupportedCount: number;
    geometryBytes: number;
    textures: TextureResourceDiagnostics;
    atlas: AtlasDiagnostics;
}

interface AdaptResult {
    primitives: WebGLRenderPrimitive[];
    diagnostics: AdapterDiagnostics;
}

interface TraversalState {
    matrix: Matrix3;
    opacity: number;
}

interface RectangleShadowParams {
    color: [number, number, number, number];
    blur: number;
    offsetX: number;
    offsetY: number;
    radius: number;
}

interface ImagePrimitiveEntry {
    primitive: WebGLRenderPrimitive;
    textureSource: CanvasImageSource;
    handle: TextureHandle;
}

export class WebGLRenderAdapter {
    private readonly textureCache: TextureCache;
    private readonly glyphAtlas = new GlyphAtlas();
    private atlasUploadsThisFrame = 0;
    private atlasUploadArea = 0;

    private fillVertices: number[] = [];
    private fillVertexCount = 0;
    private strokeVertices: number[] = [];
    private strokeVertexCount = 0;
    private shadowVertices: number[] = [];
    private shadowVertexCount = 0;
    private fillPrimitiveCount = 0;
    private strokePrimitiveCount = 0;
    private shadowPrimitiveCount = 0;
    private imageEntries: ImagePrimitiveEntry[] = [];
    private textPrimitives: WebGLRenderPrimitive[] = [];
    private particleCount = 0;
    private unsupportedCount = 0;
    private geometryBytes = 0;
    private frameWidth = 0;
    private frameHeight = 0;

    constructor(private readonly gl: WebGLContext) {
        this.textureCache = new TextureCache(gl);
    }

    adapt(renderObjects: readonly RenderObject[], frame: FrameDimensions): AdaptResult {
        this.reset(frame);
        const state: TraversalState = { matrix: IDENTITY_MATRIX, opacity: 1 };
        this.traverse(renderObjects, state);
        const primitives: WebGLRenderPrimitive[] = [];
        if (this.fillVertexCount > 0) primitives.push(this.buildFillPrimitive());
        if (this.strokeVertexCount > 0) primitives.push(this.buildStrokePrimitive());
        if (this.shadowVertexCount > 0) primitives.push(this.buildShadowPrimitive());
        for (const entry of this.imageEntries) {
            primitives.push(entry.primitive);
        }
        for (const primitive of this.textPrimitives) primitives.push(primitive);
        this.uploadGlyphAtlases();
        const diagnostics: AdapterDiagnostics = {
            fillCount: this.fillPrimitiveCount,
            strokeCount: this.strokePrimitiveCount,
            shadowCount: this.shadowPrimitiveCount,
            imageCount: this.imageEntries.length,
            textCount: this.textPrimitives.length,
            particleCount: this.particleCount,
            unsupportedCount: this.unsupportedCount,
            geometryBytes: this.geometryBytes,
            textures: this.textureCache.diagnostics,
            atlas: this.buildAtlasDiagnostics(),
        };
        return { primitives, diagnostics };
    }

    dispose(): void {
        this.textureCache.dispose();
        this.fillVertices = [];
        this.strokeVertices = [];
        this.shadowVertices = [];
        this.imageEntries = [];
        this.textPrimitives = [];
        this.geometryBytes = 0;
        this.particleCount = 0;
    }

    private reset(frame: FrameDimensions): void {
        this.fillVertices.length = 0;
        this.fillVertexCount = 0;
        this.strokeVertices.length = 0;
        this.strokeVertexCount = 0;
        this.shadowVertices.length = 0;
        this.shadowVertexCount = 0;
        this.fillPrimitiveCount = 0;
        this.strokePrimitiveCount = 0;
        this.shadowPrimitiveCount = 0;
        this.imageEntries.length = 0;
        this.textPrimitives.length = 0;
        this.particleCount = 0;
        this.unsupportedCount = 0;
        this.geometryBytes = 0;
        this.frameWidth = frame.width;
        this.frameHeight = frame.height;
        this.atlasUploadsThisFrame = 0;
        this.atlasUploadArea = 0;
    }

    private traverse(objects: readonly RenderObject[], parent: TraversalState): void {
        for (const object of objects) {
            if (!object) continue;
            const visibility = (object as { visible?: boolean }).visible;
            if (visibility === false) continue;
            const opacity = (object as { opacity?: number }).opacity ?? 1;
            if (opacity <= 0) continue;
            const matrix = multiplyMatrices(
                parent.matrix,
                matrixFromTransform(
                    (object as { x?: number }).x ?? 0,
                    (object as { y?: number }).y ?? 0,
                    (object as { rotation?: number }).rotation ?? 0,
                    (object as { scaleX?: number }).scaleX ?? 1,
                    (object as { scaleY?: number }).scaleY ?? 1,
                    (object as { skewX?: number }).skewX ?? 0,
                    (object as { skewY?: number }).skewY ?? 0
                )
            );
            const cumulativeOpacity = parent.opacity * opacity;
            this.dispatchObject(object, { matrix, opacity: cumulativeOpacity });
            const children = (object as { children?: RenderObject[] }).children;
            if (children && children.length) {
                this.traverse(children, { matrix, opacity: cumulativeOpacity });
            }
        }
    }

    private dispatchObject(object: RenderObject, state: TraversalState): void {
        if (object instanceof Rectangle) {
            this.addRectangle(object, state);
        } else if (object instanceof ImageObject) {
            this.addImage(object, state);
        } else if (object instanceof Text) {
            this.addText(object, state);
        } else if (object instanceof ParticleSystem) {
            this.addParticles(object, state);
        } else if (object instanceof Line) {
            this.addLine(object, state);
        } else {
            this.unsupportedCount += 1;
        }
    }

    private addRectangle(rect: Rectangle, state: TraversalState): void {
        const width = rect.width;
        const height = rect.height;
        if (width <= 0 || height <= 0) return;
        const baseColor = parseCssColor(rect.fillColor);
        const fillOpacity = (rect as { globalAlpha?: number }).globalAlpha ?? 1;
        const fillColor = multiplyColorAlpha(baseColor, state.opacity * fillOpacity);
        if (fillColor && fillColor[3] > 0) {
            this.pushRoundedRect(state.matrix, width, height, rect.cornerRadius ?? 0, -1, fillColor);
            this.fillPrimitiveCount += 1;
        }
        const strokeColor = rect.strokeColor ? parseCssColor(rect.strokeColor) : null;
        const strokeOpacity = multiplyColorAlpha(strokeColor, state.opacity);
        if (strokeOpacity && strokeOpacity[3] > 0 && rect.strokeWidth > 0) {
            this.pushRoundedRect(state.matrix, width, height, rect.cornerRadius ?? 0, rect.strokeWidth, strokeOpacity);
            this.strokePrimitiveCount += 1;
        }
        if (rect.shadowColor && rect.shadowBlur > 0) {
            const shadowColor = parseCssColor(rect.shadowColor);
            if (shadowColor) {
                const shadowOpacity = multiplyColorAlpha(shadowColor, state.opacity);
                if (shadowOpacity) {
                    this.pushShadowRect(state.matrix, width, height, {
                        color: shadowOpacity,
                        blur: rect.shadowBlur,
                        offsetX: rect.shadowOffsetX ?? 0,
                        offsetY: rect.shadowOffsetY ?? 0,
                        radius: rect.cornerRadius ?? 0,
                    });
                    this.shadowPrimitiveCount += 1;
                }
            }
        }
    }

    private addImage(image: ImageObject, state: TraversalState): void {
        const element = image.imageElement;
        if (!element) return;
        const params = this.resolveImageDrawParams(image);
        const opacity = state.opacity * (image.opacity ?? 1);
        const vertices: number[] = [];
        const corners = [
            { local: [params.drawX, params.drawY], uv: [0, 0] },
            { local: [params.drawX + params.drawWidth, params.drawY], uv: [1, 0] },
            { local: [params.drawX + params.drawWidth, params.drawY + params.drawHeight], uv: [1, 1] },
            { local: [params.drawX, params.drawY + params.drawHeight], uv: [0, 1] },
        ];
        const world = corners.map((corner) => ({
            world: applyMatrix(state.matrix, corner.local[0], corner.local[1]),
            uv: corner.uv,
        }));
        const order = [0, 1, 2, 0, 2, 3];
        for (const index of order) {
            const { world: point, uv } = world[index];
            vertices.push(point.x, point.y, uv[0], uv[1], opacity);
        }
        const data = new Float32Array(vertices);
        const geometry: WebGLGeometrySource = {
            id: `image:${this.imageEntries.length}`,
            data,
            attributes: [
                { name: 'a_position', size: 2, stride: 5 * 4, offset: 0 },
                { name: 'a_texCoord', size: 2, stride: 5 * 4, offset: 2 * 4 },
                { name: 'a_opacity', size: 1, stride: 5 * 4, offset: 4 * 4 },
            ],
        };
        const handle = this.textureCache.resolveImageTexture(element);
        if (handle.dirty) {
            this.textureCache.uploadImage(handle, element);
        }
        const primitive: WebGLRenderPrimitive = {
            geometry,
            material: IMAGE_MATERIAL,
            vertexCount: 6,
            uniforms: {
                u_resolution: [this.frameWidth, this.frameHeight],
                u_sampler: 0,
            },
            textureSource: element,
            textureHandle: handle,
        } as WebGLRenderPrimitive;
        this.imageEntries.push({ primitive, textureSource: element, handle });
        this.geometryBytes += data.byteLength;
    }

    private addText(text: Text, state: TraversalState): void {
        const layout = this.glyphAtlas.layout({
            text: text.text ?? '',
            font: text.font ?? '16px sans-serif',
            color: text.color ?? '#ffffff',
            align: text.align ?? 'left',
            baseline: text.baseline ?? 'alphabetic',
            transform: state.matrix,
            opacity: state.opacity,
        });
        if (!layout) return;
        const vertices: number[] = [];
        const order = [0, 1, 2];
        for (const quad of layout.quads) {
            for (let i = 0; i < 3; i += 1) {
                const px = quad.position[i * 2];
                const py = quad.position[i * 2 + 1];
                const tu = quad.uv[i * 2];
                const tv = quad.uv[i * 2 + 1];
                vertices.push(px, py, tu, tv);
            }
        }
        const data = new Float32Array(vertices);
        const geometry: WebGLGeometrySource = {
            id: `text:${this.textPrimitives.length}`,
            data,
            attributes: [
                { name: 'a_position', size: 2, stride: 4 * 4, offset: 0 },
                { name: 'a_texCoord', size: 2, stride: 4 * 4, offset: 2 * 4 },
            ],
        };
        const handle = this.textureCache.resolveAtlasTexture(layout.page.id);
        const primitive: WebGLRenderPrimitive = {
            geometry,
            material: TEXT_MATERIAL,
            vertexCount: layout.vertexCount,
            uniforms: {
                u_resolution: [this.frameWidth, this.frameHeight],
                u_sampler: 0,
                u_color: layout.color,
            },
            textureSource: layout.page.canvas ?? layout.page,
            atlasPageId: layout.page.id,
            textureHandle: handle,
        } as WebGLRenderPrimitive;
        this.textPrimitives.push(primitive);
        this.geometryBytes += data.byteLength;
    }

    private addParticles(system: ParticleSystem, state: TraversalState): void {
        for (const particle of system.getParticles()) {
            this.particleCount += 1;
            const color = parseCssColor(particle.color) ?? [1, 1, 1, 1];
        const finalColor = multiplyColorAlpha(color, state.opacity * particle.opacity) ?? [1, 1, 1, 0];
            if (finalColor[3] <= 0) continue;
            const size = particle.size;
            const matrix = multiplyMatrices(state.matrix, matrixFromTransform(particle.x, particle.y, particle.rotation ?? 0, 1, 1, 0, 0));
            this.pushRoundedRect(matrix, size, size, size / 2, -1, finalColor);
        }
    }

    private addLine(line: Line, state: TraversalState): void {
        const color = parseCssColor(line.color) ?? [1, 1, 1, 1];
        const finalColor = multiplyColorAlpha(color, state.opacity) ?? [1, 1, 1, 0];
        if (finalColor[3] <= 0) return;
        const half = line.lineWidth / 2;
        const dx = line.deltaX;
        const dy = line.deltaY;
        const length = Math.hypot(dx, dy);
        if (length <= 0) return;
        const nx = -dy / length;
        const ny = dx / length;
        const p0 = applyMatrix(state.matrix, 0 - nx * half, 0 - ny * half);
        const p1 = applyMatrix(state.matrix, dx - nx * half, dy - ny * half);
        const p2 = applyMatrix(state.matrix, dx + nx * half, dy + ny * half);
        const p3 = applyMatrix(state.matrix, 0 + nx * half, 0 + ny * half);
        this.pushColorQuad(p0, p1, p2, p3, finalColor);
    }

    private pushRoundedRect(
        matrix: Matrix3,
        width: number,
        height: number,
        radius: number,
        strokeWidth: number,
        color: [number, number, number, number]
    ): void {
        const corners = [
            { local: [0, 0] },
            { local: [width, 0] },
            { local: [width, height] },
            { local: [0, height] },
        ].map((corner) => ({
            local: corner.local,
            world: applyMatrix(matrix, corner.local[0], corner.local[1]),
        }));
        const order = [0, 1, 2, 0, 2, 3];
        for (const index of order) {
            const { local, world } = corners[index];
            this.fillVertices.push(
                world.x,
                world.y,
                local[0],
                local[1],
                width,
                height,
                Math.max(0, Math.min(radius, Math.min(width, height) / 2)),
                strokeWidth,
                color[0],
                color[1],
                color[2],
                color[3]
            );
        }
        this.fillVertexCount += order.length;
        this.geometryBytes += order.length * 12 * 4;
    }

    private pushShadowRect(matrix: Matrix3, width: number, height: number, params: RectangleShadowParams): void {
        const expand = params.blur * 1.5;
        const corners = [
            { local: [-expand, -expand] },
            { local: [width + expand, -expand] },
            { local: [width + expand, height + expand] },
            { local: [-expand, height + expand] },
        ].map((corner) => ({
            local: corner.local,
            world: applyMatrix(matrix, corner.local[0], corner.local[1]),
        }));
        const order = [0, 1, 2, 0, 2, 3];
        for (const index of order) {
            const { local, world } = corners[index];
            this.shadowVertices.push(
                world.x,
                world.y,
                local[0],
                local[1],
                width + expand * 2,
                height + expand * 2,
                params.radius,
                params.blur,
                params.offsetX,
                params.offsetY,
                params.color[0],
                params.color[1],
                params.color[2],
                params.color[3]
            );
        }
        this.shadowVertexCount += order.length;
        this.geometryBytes += order.length * 14 * 4;
    }

    private pushColorQuad(
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number },
        color: [number, number, number, number]
    ): void {
        const triangles = [
            [p0, p1, p2],
            [p0, p2, p3],
        ];
        for (const triangle of triangles) {
            for (const point of triangle) {
                this.strokeVertices.push(point.x, point.y, color[0], color[1], color[2], color[3]);
            }
            this.strokeVertexCount += 3;
        }
        this.geometryBytes += triangles.length * 3 * 6 * 4;
        this.strokePrimitiveCount += 1;
    }

    private buildFillPrimitive(): WebGLRenderPrimitive {
        const data = new Float32Array(this.fillVertices);
        const geometry: WebGLGeometrySource = {
            id: 'rect-fill',
            data,
            attributes: [
                { name: 'a_position', size: 2, stride: 12 * 4, offset: 0 },
                { name: 'a_local', size: 2, stride: 12 * 4, offset: 2 * 4 },
                { name: 'a_size', size: 2, stride: 12 * 4, offset: 4 * 4 },
                { name: 'a_params', size: 2, stride: 12 * 4, offset: 6 * 4 },
                { name: 'a_color', size: 4, stride: 12 * 4, offset: 8 * 4 },
            ],
        };
        return {
            geometry,
            material: SOLID_ROUNDED_MATERIAL,
            vertexCount: this.fillVertexCount,
            uniforms: { u_resolution: [this.frameWidth, this.frameHeight] },
        };
    }

    private buildStrokePrimitive(): WebGLRenderPrimitive {
        const data = new Float32Array(this.strokeVertices);
        const geometry: WebGLGeometrySource = {
            id: 'line-fill',
            data,
            attributes: [
                { name: 'a_position', size: 2, stride: 6 * 4, offset: 0 },
                { name: 'a_color', size: 4, stride: 6 * 4, offset: 2 * 4 },
            ],
        };
        return {
            geometry,
            material: SOLID_COLOR_MATERIAL,
            vertexCount: this.strokeVertexCount,
            uniforms: { u_resolution: [this.frameWidth, this.frameHeight] },
        };
    }

    private buildShadowPrimitive(): WebGLRenderPrimitive {
        const data = new Float32Array(this.shadowVertices);
        const geometry: WebGLGeometrySource = {
            id: 'rect-shadow',
            data,
            attributes: [
                { name: 'a_position', size: 2, stride: 14 * 4, offset: 0 },
                { name: 'a_local', size: 2, stride: 14 * 4, offset: 2 * 4 },
                { name: 'a_size', size: 2, stride: 14 * 4, offset: 4 * 4 },
                { name: 'a_shadow', size: 4, stride: 14 * 4, offset: 6 * 4 },
                { name: 'a_color', size: 4, stride: 14 * 4, offset: 10 * 4 },
            ],
        };
        return {
            geometry,
            material: SHADOW_MATERIAL,
            vertexCount: this.shadowVertexCount,
            uniforms: { u_resolution: [this.frameWidth, this.frameHeight] },
        };
    }

    private uploadGlyphAtlases(): void {
        const uploads = this.glyphAtlas.prepareUploads(1);
        this.atlasUploadsThisFrame = uploads.length;
        this.atlasUploadArea = 0;
        for (const upload of uploads) {
            const handle = this.textureCache.resolveAtlasTexture(upload.pageId);
            this.textureCache.uploadAtlasRegion(handle, {
                pageWidth: upload.pageWidth,
                pageHeight: upload.pageHeight,
                x: upload.rect.x,
                y: upload.rect.y,
                width: upload.rect.width,
                height: upload.rect.height,
                data: upload.data,
            });
            this.glyphAtlas.completeUpload(upload.pageId, upload.rect);
            this.atlasUploadArea += upload.rect.width * upload.rect.height;
        }
    }

    private buildAtlasDiagnostics(): AtlasDiagnostics {
        const glyphDiagnostics = this.glyphAtlas.getDiagnostics();
        const textureDiagnostics = this.textureCache.atlasDiagnostics;
        const textureMap = new Map(
            textureDiagnostics.entries.map((entry) => [entry.id, { width: entry.width, height: entry.height, bytes: entry.bytes }])
        );
        return {
            totalGlyphs: glyphDiagnostics.totalGlyphs,
            queueLength: glyphDiagnostics.pendingUploads,
            pendingArea: glyphDiagnostics.pendingArea,
            uploadsThisFrame: this.atlasUploadsThisFrame,
            uploadedArea: this.atlasUploadArea,
            textureBytes: textureDiagnostics.totalBytes,
            pages: glyphDiagnostics.pages.map((page) => {
                const textureInfo = textureMap.get(page.id);
                return {
                    id: page.id,
                    width: page.width,
                    height: page.height,
                    glyphCount: page.glyphCount,
                    occupancy: page.occupancy,
                    evictions: page.evictions,
                    pendingArea: page.pendingArea,
                    version: page.version,
                    lastUploadArea: page.lastUploadArea,
                    lastUploadAt: page.lastUploadAt,
                    textureBytes: textureInfo?.bytes ?? 0,
                    lastUploadWallClock: page.lastUploadWallClock,
                };
            }),
        };
    }

    private resolveImageDrawParams(image: ImageObject): {
        drawX: number;
        drawY: number;
        drawWidth: number;
        drawHeight: number;
    } {
        const width = image.width;
        const height = image.height;
        const element = image.imageElement;
        if (!element) return { drawX: 0, drawY: 0, drawWidth: width, drawHeight: height };
        const intrinsicWidth = (element as { naturalWidth?: number }).naturalWidth ?? (element as { width?: number }).width ?? 0;
        const intrinsicHeight =
            (element as { naturalHeight?: number }).naturalHeight ?? (element as { height?: number }).height ?? 0;
        if (!image.preserveAspectRatio || image.fitMode === 'fill' || !intrinsicWidth || !intrinsicHeight) {
            return { drawX: 0, drawY: 0, drawWidth: width, drawHeight: height };
        }
        const containerAspect = width / height;
        const imageAspect = intrinsicWidth / intrinsicHeight;
        if (image.fitMode === 'contain') {
            if (imageAspect > containerAspect) {
                const drawWidth = width;
                const drawHeight = width / imageAspect;
                return { drawX: 0, drawY: (height - drawHeight) / 2, drawWidth, drawHeight };
            }
            const drawHeight = height;
            const drawWidth = height * imageAspect;
            return { drawX: (width - drawWidth) / 2, drawY: 0, drawWidth, drawHeight };
        }
        if (image.fitMode === 'cover') {
            if (imageAspect > containerAspect) {
                const drawHeight = height;
                const drawWidth = height * imageAspect;
                return { drawX: (width - drawWidth) / 2, drawY: 0, drawWidth, drawHeight };
            }
            const drawWidth = width;
            const drawHeight = width / imageAspect;
            return { drawX: 0, drawY: (height - drawHeight) / 2, drawWidth, drawHeight };
        }
        // none
        const drawWidth = Math.min(intrinsicWidth, width);
        const drawHeight = Math.min(intrinsicHeight, height);
        return { drawX: (width - drawWidth) / 2, drawY: (height - drawHeight) / 2, drawWidth, drawHeight };
    }
}

export type { AdaptResult };
