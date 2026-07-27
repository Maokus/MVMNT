import { createWithEqualityFn } from 'zustand/traditional';

interface TemplateStatusState {
    isTemplateLoading: boolean;
    message: string;
    progress: number | null;
    pendingCount: number;
    onAbort: (() => void) | null;
    startLoading: (message?: string, options?: { progress?: number | null; onAbort?: (() => void) | null }) => void;
    updateLoading: (update: { message?: string; progress?: number | null; onAbort?: (() => void) | null }) => void;
    finishLoading: () => void;
}

const DEFAULT_MESSAGE = 'Loading template…';

export const useTemplateStatusStore = createWithEqualityFn<TemplateStatusState>((set, get) => ({
    isTemplateLoading: false,
    message: DEFAULT_MESSAGE,
    progress: null,
    pendingCount: 0,
    onAbort: null,
    startLoading: (message, options) => {
        const state = get();
        const nextCount = state.pendingCount + 1;
        const nextMessage = message?.trim() || state.message || DEFAULT_MESSAGE;
        set({
            pendingCount: nextCount,
            isTemplateLoading: true,
            message: nextMessage,
            progress: options && 'progress' in options ? (options.progress ?? null) : state.progress,
            onAbort: options && 'onAbort' in options ? (options.onAbort ?? null) : state.onAbort,
        });
    },
    updateLoading: (update) => {
        const state = get();
        if (!state.isTemplateLoading) return;
        set({
            message: update.message?.trim() || state.message,
            progress: 'progress' in update ? (update.progress ?? null) : state.progress,
            onAbort: 'onAbort' in update ? (update.onAbort ?? null) : state.onAbort,
        });
    },
    finishLoading: () => {
        const state = get();
        const nextCount = Math.max(0, state.pendingCount - 1);
        set({
            pendingCount: nextCount,
            isTemplateLoading: nextCount > 0,
            message: nextCount > 0 ? state.message : DEFAULT_MESSAGE,
            progress: nextCount > 0 ? state.progress : null,
            onAbort: nextCount > 0 ? state.onAbort : null,
        });
    },
}));
