import type { WebGLContext } from './buffers';

export class ShaderCompilationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ShaderCompilationError';
    }
}

export class ProgramLinkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProgramLinkError';
    }
}

export function compileShader(gl: WebGLContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new ShaderCompilationError('Unable to create shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
        gl.deleteShader(shader);
        throw new ShaderCompilationError(info.trim());
    }
    return shader;
}

export function createProgram(gl: WebGLContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    const program = gl.createProgram();
    if (!program) throw new ProgramLinkError('Unable to create shader program.');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) ?? 'Unknown program error';
        gl.deleteProgram(program);
        throw new ProgramLinkError(info.trim());
    }
    return program;
}
