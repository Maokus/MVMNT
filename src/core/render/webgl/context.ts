import type { RendererContext, RendererContextType } from '../renderer-contract';

export interface WebGLContextAcquisitionOptions {
    context?: RendererContext | null;
    attributes?: WebGLContextAttributes;
    preferWebGL2?: boolean;
}

export interface WebGLContextAcquisitionResult {
    gl: WebGLRenderingContext | WebGL2RenderingContext;
    contextType: RendererContextType;
}

export class WebGLContextError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'WebGLContextError';
    }
}

const WEBGL_CONTEXT_NAMES: ReadonlyArray<{ name: string; type: RendererContextType }> = [
    { name: 'webgl2', type: 'webgl2' },
    { name: 'webgl', type: 'webgl' },
    { name: 'experimental-webgl', type: 'webgl' },
];

function isWebGL2Context(value: unknown): value is WebGL2RenderingContext {
    if (typeof WebGL2RenderingContext === 'undefined') return false;
    return value instanceof WebGL2RenderingContext;
}

function isWebGLContext(value: unknown): value is WebGLRenderingContext | WebGL2RenderingContext {
    if (!value || typeof value !== 'object') return false;
    const ctx = value as Partial<WebGLRenderingContext>;
    return typeof ctx.getParameter === 'function' && typeof ctx.getError === 'function';
}

export function acquireWebGLContext(
    canvas: HTMLCanvasElement,
    options: WebGLContextAcquisitionOptions = {}
): WebGLContextAcquisitionResult {
    if (!canvas) {
        throw new WebGLContextError('A canvas element is required to acquire a WebGL context.');
    }

    if (options.context) {
        if (!isWebGLContext(options.context)) {
            throw new WebGLContextError('Provided context is not a WebGLRenderingContext instance.');
        }
        const contextType = isWebGL2Context(options.context) ? 'webgl2' : 'webgl';
        return {
            gl: options.context,
            contextType,
        };
    }

    const preferWebGL2 = options.preferWebGL2 ?? true;
    const orderedContexts = preferWebGL2 ? WEBGL_CONTEXT_NAMES : WEBGL_CONTEXT_NAMES.slice(1);

    for (const { name, type } of orderedContexts) {
        try {
            const context = canvas.getContext(
                name as 'webgl' | 'webgl2' | 'experimental-webgl',
                options.attributes ?? undefined
            ) as WebGLRenderingContext | WebGL2RenderingContext | null;
            if (context) {
                return { gl: context, contextType: type };
            }
        } catch (error) {
            // Continue trying other context names but remember the last error.
            if (name === orderedContexts[orderedContexts.length - 1].name) {
                throw new WebGLContextError(`Failed to acquire WebGL context using "${name}".`, error);
            }
        }
    }

    throw new WebGLContextError('Unable to acquire a WebGL context for the provided canvas.');
}

export interface WebGLContextLossHandlers {
    onLost?: (event: Event) => void;
    onRestored?: () => void;
}

export function attachContextLossHandlers(
    canvas: HTMLCanvasElement,
    handlers: WebGLContextLossHandlers
): () => void {
    const { onLost, onRestored } = handlers;

    function handleLost(event: Event) {
        if (typeof (event as WebGLContextEvent).preventDefault === 'function') {
            (event as WebGLContextEvent).preventDefault();
        }
        onLost?.(event);
    }

    function handleRestored() {
        onRestored?.();
    }

    canvas.addEventListener('webglcontextlost', handleLost, false);
    canvas.addEventListener('webglcontextrestored', handleRestored, false);

    return () => {
        canvas.removeEventListener('webglcontextlost', handleLost, false);
        canvas.removeEventListener('webglcontextrestored', handleRestored, false);
    };
}
