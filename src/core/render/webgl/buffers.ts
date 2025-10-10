export type WebGLContext = WebGLRenderingContext | WebGL2RenderingContext;

export class GLBuffer {
    private buffer: WebGLBuffer | null = null;
    private size = 0;

    constructor(private readonly gl: WebGLContext, private readonly target: number) {}

    bind(): void {
        this.ensure();
        this.gl.bindBuffer(this.target, this.buffer);
    }

    upload(data: ArrayBufferView | ArrayBufferLike, usage: number = this.gl.DYNAMIC_DRAW): void {
        this.ensure();
        this.bind();
        if (ArrayBuffer.isView(data)) {
            this.gl.bufferData(this.target, data, usage);
            this.size = data.byteLength;
            return;
        }
        this.gl.bufferData(this.target, data as ArrayBuffer, usage);
        this.size = (data as ArrayBufferLike).byteLength ?? 0;
    }

    subData(data: ArrayBufferView | ArrayBufferLike, offset = 0): void {
        if (!this.buffer) {
            this.upload(data);
            return;
        }
        this.bind();
        if (ArrayBuffer.isView(data)) {
            this.gl.bufferSubData(this.target, offset, data);
            return;
        }
        this.gl.bufferSubData(this.target, offset, data as ArrayBuffer);
    }

    dispose(): void {
        if (this.buffer) {
            this.gl.deleteBuffer(this.buffer);
            this.buffer = null;
            this.size = 0;
        }
    }

    get byteLength(): number {
        return this.size;
    }

    private ensure(): void {
        if (!this.buffer) {
            this.buffer = this.gl.createBuffer();
            if (!this.buffer) throw new Error('Failed to create WebGL buffer.');
        }
    }
}

export class VertexArrayObject {
    private vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null = null;

    constructor(private readonly gl: WebGLContext) {}

    bind(): void {
        if ('bindVertexArray' in this.gl) {
            const gl2 = this.gl as WebGL2RenderingContext;
            this.ensure(gl2);
            gl2.bindVertexArray(this.vao as WebGLVertexArrayObject);
            return;
        }
        const ext = this.getExtension();
        if (!ext) return;
        this.ensure(ext);
        ext.bindVertexArrayOES(this.vao as WebGLVertexArrayObjectOES);
    }

    dispose(): void {
        if (!this.vao) return;
        if ('deleteVertexArray' in this.gl) {
            (this.gl as WebGL2RenderingContext).deleteVertexArray(this.vao as WebGLVertexArrayObject);
        } else {
            const ext = this.getExtension();
            ext?.deleteVertexArrayOES(this.vao as WebGLVertexArrayObjectOES);
        }
        this.vao = null;
    }

    private ensure(gl: WebGL2RenderingContext | OES_vertex_array_object): void {
        if (!this.vao) {
            if ('createVertexArray' in gl) {
                this.vao = (gl as WebGL2RenderingContext).createVertexArray();
            } else {
                this.vao = (gl as OES_vertex_array_object).createVertexArrayOES();
            }
            if (!this.vao) throw new Error('Failed to create vertex array object.');
        }
    }

    private getExtension(): OES_vertex_array_object | null {
        return 'getExtension' in this.gl ? this.gl.getExtension('OES_vertex_array_object') : null;
    }
}
