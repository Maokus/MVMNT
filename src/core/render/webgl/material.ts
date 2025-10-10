import type { WebGLContext } from './buffers';
import { createProgram } from './shaders';

function isArrayBufferLikeValue(value: unknown): value is ArrayBufferLike {
    if (!value || typeof value !== 'object') return false;
    return 'byteLength' in (value as { byteLength?: unknown });
}

export type UniformScalar = number | boolean;
export type UniformArray = readonly number[] | Float32Array | Int32Array | Uint32Array;
export type UniformValue = UniformScalar | UniformArray | Float32Array | Int32Array | Uint32Array;

type UniformSetter = (value: UniformValue) => void;

type UniformKind =
    | 'float'
    | 'vec2'
    | 'vec3'
    | 'vec4'
    | 'int'
    | 'ivec2'
    | 'ivec3'
    | 'ivec4'
    | 'mat3'
    | 'mat4';

export interface MaterialUniformDescriptor {
    name: string;
    kind: UniformKind;
}

export interface MaterialAttributeDescriptor {
    name: string;
    size: number;
    type?: number;
    stride?: number;
    offset?: number;
    normalized?: boolean;
}

export interface MaterialDescriptor {
    id: string;
    vertexSource: string;
    fragmentSource: string;
    attributes: MaterialAttributeDescriptor[];
    uniforms?: MaterialUniformDescriptor[];
    mode?: number;
}

export class MaterialProgram {
    private readonly uniformSetters = new Map<string, UniformSetter>();
    private readonly attributeLocations = new Map<string, number>();

    constructor(
        private readonly gl: WebGLContext,
        private readonly descriptor: MaterialDescriptor,
        private readonly program: WebGLProgram
    ) {
        this.bootstrapAttributes();
        this.bootstrapUniforms();
    }

    static fromDescriptor(gl: WebGLContext, descriptor: MaterialDescriptor): MaterialProgram {
        const program = createProgram(gl, descriptor.vertexSource, descriptor.fragmentSource);
        return new MaterialProgram(gl, descriptor, program);
    }

    use(): void {
        this.gl.useProgram(this.program);
    }

    configureAttributes(
        attributeBinder: (attribute: MaterialAttributeDescriptor, location: number) => void
    ): void {
        for (const attribute of this.descriptor.attributes) {
            const location = this.attributeLocations.get(attribute.name);
            if (location === undefined || location < 0) continue;
            attributeBinder(attribute, location);
        }
    }

    setUniform(name: string, value: UniformValue): void {
        const setter = this.uniformSetters.get(name);
        if (!setter) return;
        setter(value);
    }

    dispose(): void {
        this.gl.deleteProgram(this.program);
    }

    get drawMode(): number {
        return this.descriptor.mode ?? this.gl.TRIANGLES;
    }

    private bootstrapUniforms(): void {
        if (!this.descriptor.uniforms?.length) return;
        for (const uniform of this.descriptor.uniforms) {
            const location = this.gl.getUniformLocation(this.program, uniform.name);
            if (!location) continue;
            this.uniformSetters.set(uniform.name, this.createSetter(location, uniform.kind));
        }
    }

    private bootstrapAttributes(): void {
        for (const attribute of this.descriptor.attributes) {
            const location = this.gl.getAttribLocation(this.program, attribute.name);
            this.attributeLocations.set(attribute.name, location);
        }
    }

    private createSetter(location: WebGLUniformLocation, kind: UniformKind): UniformSetter {
        const gl = this.gl;
        switch (kind) {
            case 'float':
                return (value) => gl.uniform1f(location, Number(value));
            case 'vec2':
                return (value) => gl.uniform2fv(location, this.toFloatArray(value));
            case 'vec3':
                return (value) => gl.uniform3fv(location, this.toFloatArray(value));
            case 'vec4':
                return (value) => gl.uniform4fv(location, this.toFloatArray(value));
            case 'int':
                return (value) => gl.uniform1i(location, Number(value));
            case 'ivec2':
                return (value) => gl.uniform2iv(location, this.toIntArray(value));
            case 'ivec3':
                return (value) => gl.uniform3iv(location, this.toIntArray(value));
            case 'ivec4':
                return (value) => gl.uniform4iv(location, this.toIntArray(value));
            case 'mat3':
                return (value) => gl.uniformMatrix3fv(location, false, this.toFloatArray(value));
            case 'mat4':
                return (value) => gl.uniformMatrix4fv(location, false, this.toFloatArray(value));
            default:
                return () => {};
        }
    }

    private toFloatArray(value: UniformValue): Float32Array | number[] {
        if (value instanceof Float32Array) return value;
        if (Array.isArray(value)) return value.map((entry) => Number(entry));
        if (typeof value === 'number') return [value];
        if (typeof value === 'boolean') return [value ? 1 : 0];
        if (value instanceof Int32Array || value instanceof Uint32Array) {
            return Array.from(value, (entry) => Number(entry));
        }
        if (ArrayBuffer.isView(value)) {
            return Array.from(value as ArrayLike<number>, (entry) => Number(entry));
        }
        if (isArrayBufferLikeValue(value)) {
            return new Float32Array(value);
        }
        return [];
    }

    private toIntArray(value: UniformValue): Int32Array | number[] {
        if (value instanceof Int32Array) return value;
        if (Array.isArray(value)) return value.map((entry) => Number(entry));
        if (typeof value === 'number') return [Number(value)];
        if (typeof value === 'boolean') return [value ? 1 : 0];
        if (value instanceof Float32Array) return Array.from(value, (entry) => Math.trunc(entry));
        if (value instanceof Uint32Array) return Int32Array.from(value, (entry) => Number(entry));
        if (ArrayBuffer.isView(value)) {
            return Array.from(value as ArrayLike<number>, (entry) => Number(entry));
        }
        if (isArrayBufferLikeValue(value)) {
            return new Int32Array(value);
        }
        return [];
    }
}

export class MaterialRegistry {
    private readonly programs = new Map<string, MaterialProgram>();

    constructor(private readonly gl: WebGLContext) {}

    resolve(descriptor: MaterialDescriptor): MaterialProgram {
        const existing = this.programs.get(descriptor.id);
        if (existing) return existing;
        const program = MaterialProgram.fromDescriptor(this.gl, descriptor);
        this.programs.set(descriptor.id, program);
        return program;
    }

    dispose(): void {
        for (const program of this.programs.values()) {
            program.dispose();
        }
        this.programs.clear();
    }
}
