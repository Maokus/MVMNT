import { createWithEqualityFn } from 'zustand/traditional';

export type DocumentSavePhase = 'idle' | 'saving' | 'saved' | 'warning' | 'error';

interface DocumentSaveStatusState {
    phase: DocumentSavePhase;
    progress: number | null;
    message: string;
    details: string[];
    queued: boolean;
    setSaving: (progress: number, message: string) => void;
    setQueued: (queued: boolean) => void;
    setResult: (phase: 'saved' | 'warning' | 'error', message: string, details?: string[]) => void;
    clear: () => void;
}

const initialStatus = {
    phase: 'idle' as const,
    progress: null,
    message: '',
    details: [] as string[],
    queued: false,
};

export const useDocumentSaveStatusStore = createWithEqualityFn<DocumentSaveStatusState>((set) => ({
    ...initialStatus,
    setSaving: (progress, message) =>
        set((state) => ({
            phase: 'saving',
            progress: Math.max(0, Math.min(1, progress)),
            message: message.trim() || 'Saving…',
            details: [],
            queued: state.queued,
        })),
    setQueued: (queued) => set({ queued }),
    setResult: (phase, message, details = []) =>
        set({
            phase,
            progress: phase === 'saved' || phase === 'warning' ? 1 : null,
            message,
            details,
            queued: false,
        }),
    clear: () => set(initialStatus),
}));
