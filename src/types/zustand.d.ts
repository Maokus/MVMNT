declare module 'zustand' {
    export type StateCreator<T> = (
        set: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void,
        get: () => T,
        api?: unknown
    ) => T;

    export type StoreApi<T> = {
        getState: () => T;
        setState: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void;
        subscribe: (listener: (state: T, prevState: T) => void) => () => void;
    };

    export type UseBoundStore<T> = StoreApi<T> &
        (<S>(selector: (state: T) => S, equalityFn?: (a: S, b: S) => boolean) => S);

    export function create<T>(init: StateCreator<T>): UseBoundStore<T>;

    export default create;
}

declare module 'zustand/shallow' {
    export const shallow: <T>(a: T, b: T) => boolean;
    export default shallow;
}

declare module 'zustand/traditional' {
    import type { StateCreator, UseBoundStore } from 'zustand';

    export function useStoreWithEqualityFn<T>(api: UseBoundStore<T>): T;
    export function useStoreWithEqualityFn<T, S>(
        api: UseBoundStore<T>,
        selector: (state: T) => S,
        equalityFn?: (a: S, b: S) => boolean
    ): S;

    export function createWithEqualityFn<T>(
        initializer: StateCreator<T>,
        defaultEqualityFn?: (a: unknown, b: unknown) => boolean
    ): UseBoundStore<T>;
}
