import { create } from 'zustand';

interface TemplateStatusState {
    isTemplateLoading: boolean;
    message: string;
    pendingCount: number;
    startLoading: (message?: string) => void;
    finishLoading: () => void;
}

const DEFAULT_MESSAGE = 'Loading template…';

export const useTemplateStatusStore = create<TemplateStatusState>((set, get) => ({
    isTemplateLoading: false,
    message: DEFAULT_MESSAGE,
    pendingCount: 0,
    startLoading: (message) => {
        const state = get();
        const nextCount = state.pendingCount + 1;
        const nextMessage = message?.trim() || state.message || DEFAULT_MESSAGE;
        set({
            pendingCount: nextCount,
            isTemplateLoading: true,
            message: nextMessage,
        });
    },
    finishLoading: () => {
        const state = get();
        const nextCount = Math.max(0, state.pendingCount - 1);
        set({
            pendingCount: nextCount,
            isTemplateLoading: nextCount > 0,
            message: nextCount > 0 ? state.message : DEFAULT_MESSAGE,
        });
    },
}));
