export type ThrottleOptions = { leading?: boolean; trailing?: boolean };

export function throttle<T extends (...args: any[]) => any>(
    fn: T,
    intervalMs: number = 16,
    options: ThrottleOptions = { leading: true, trailing: true }
): T {
    let lastCall = 0;
    let pending: any[] | null = null;
    let timer: any = null;
    const leading = options.leading !== false;
    const trailing = options.trailing !== false;
    const invoke = (ctx: any, args: any[]) => {
        lastCall = Date.now();
        // @ts-ignore
        return fn.apply(ctx, args);
    };
    // @ts-ignore
    return function throttled(this: any, ...args: any[]) {
        const now = Date.now();
        const remaining = intervalMs - (now - lastCall);
        if (remaining <= 0) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (leading) {
                return invoke(this, args);
            } else {
                pending = args;
                if (trailing && !timer) {
                    timer = setTimeout(() => {
                        if (pending) invoke(this, pending);
                        pending = null;
                        timer = null;
                    }, intervalMs);
                }
            }
        } else if (trailing) {
            pending = args;
            if (!timer) {
                timer = setTimeout(() => {
                    if (pending) invoke(this, pending);
                    pending = null;
                    timer = null;
                }, remaining);
            }
        }
        // @ts-ignore
        return undefined;
    } as T;
}
