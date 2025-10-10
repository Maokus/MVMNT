export interface CanvasGuardHandle {
    release(): void;
    temporarilyAllow2D<T>(reason: string, fn: () => T): T;
}

interface GuardEntry {
    label: string;
    allowDepth: number;
}

const guardedCanvases = new WeakMap<HTMLCanvasElement, GuardEntry>();
let installed = false;
let originalGetContext: HTMLCanvasElement['getContext'] | null = null;

function installPatch(): void {
    if (installed) return;
    if (typeof HTMLCanvasElement === 'undefined') return;
    installed = true;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const patched = function patchedGetContext(this: HTMLCanvasElement, contextId: string, options?: unknown) {
        if (contextId === '2d') {
            const entry = guardedCanvases.get(this);
            if (entry && entry.allowDepth === 0) {
                const message = `[CanvasContextGuard] Blocked 2d context request on guarded canvas (${entry.label}).`;
                if (process.env.NODE_ENV !== 'production') {
                    try {
                        console.warn(message, { stack: new Error().stack });
                    } catch {
                        console.warn(message);
                    }
                }
                throw new Error(message);
            }
        }
        const target = originalGetContext ?? HTMLCanvasElement.prototype.getContext;
        return target.call(this, contextId, options);
    } as HTMLCanvasElement['getContext'];
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: patched,
        configurable: true,
        writable: true,
    });
}

export function guardCanvasAgainst2D(
    canvas: HTMLCanvasElement,
    options?: { label?: string }
): CanvasGuardHandle {
    if (typeof window === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
        return {
            release() {},
            temporarilyAllow2D<T>(_reason: string, fn: () => T): T {
                return fn();
            },
        };
    }
    installPatch();
    const label = options?.label ?? 'guarded-canvas';
    guardedCanvases.set(canvas, { label, allowDepth: 0 });
    return {
        release() {
            guardedCanvases.delete(canvas);
        },
        temporarilyAllow2D<T>(_reason: string, fn: () => T): T {
            const entry = guardedCanvases.get(canvas);
            if (!entry) return fn();
            entry.allowDepth += 1;
            try {
                return fn();
            } finally {
                entry.allowDepth = Math.max(0, entry.allowDepth - 1);
            }
        },
    };
}

export function isCanvasGuarded(canvas: HTMLCanvasElement): boolean {
    return guardedCanvases.has(canvas);
}
