declare module 'zustand' {
    export type StateCreator<T> = (
        set: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void,
        get: () => T,
        api?: unknown
    ) => T;

    export function create<T>(init: StateCreator<T>): {
        getState: () => T;
        setState: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void;
        subscribe: (listener: (state: T, prevState: T) => void) => () => void;
    } & (<S>(selector: (s: T) => S, equalityFn?: (a: S, b: S) => boolean) => S);

    export default create;
}

declare module 'zustand/shallow' {
    export const shallow: <T>(a: T, b: T) => boolean;
    export default shallow;
}
