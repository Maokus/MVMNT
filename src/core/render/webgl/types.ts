import type { RenderObject } from '../renderer-contract';
import type { MaterialDescriptor, UniformValue } from './material';
import type { GlyphAtlasPage } from './glyph-atlas';
import type { TextureHandle, TextureResourceDiagnostics } from './texture-cache';

export interface WebGLGeometrySource {
    id: string;
    data: Float32Array;
    attributes: readonly GeometryAttributeLayout[];
}

export interface GeometryAttributeLayout {
    name: string;
    size: number;
    type?: number;
    stride?: number;
    offset?: number;
}

export interface WebGLRenderPrimitive extends RenderObject {
    geometry: WebGLGeometrySource;
    material: MaterialDescriptor;
    uniforms?: Record<string, UniformValue>;
    vertexCount: number;
    mode?: number;
    textureSource?: CanvasImageSource | GlyphAtlasPage;
    atlasPageId?: string;
    textureHandle?: TextureHandle;
}

export interface RendererDiagnostics {
    frameHash: string;
    drawCalls: number;
    bytesHashed: number;
    contextType: 'webgl' | 'webgl2';
    resources?: {
        geometryBytes: number;
        textures: TextureResourceDiagnostics;
        primitives: {
            fills: number;
            strokes: number;
            shadows: number;
            images: number;
            texts: number;
            particles: number;
            unsupported: number;
        };
    };
}

export interface WebGLRendererState {
    diagnostics: RendererDiagnostics | null;
}
