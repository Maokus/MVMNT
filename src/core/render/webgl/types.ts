import type { RenderObject } from '../renderer-contract';
import type { MaterialDescriptor, UniformValue } from './material';

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
}

export interface RendererDiagnostics {
    frameHash: string;
    drawCalls: number;
    bytesHashed: number;
    contextType: 'webgl' | 'webgl2';
}

export interface WebGLRendererState {
    diagnostics: RendererDiagnostics | null;
}
