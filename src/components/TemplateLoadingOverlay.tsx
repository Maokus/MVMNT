import React from 'react';
import { useTemplateStatusStore } from '@state/templateStatusStore';

export const TemplateLoadingOverlay: React.FC = () => {
    const { isTemplateLoading, message } = useTemplateStatusStore((state) => ({
        isTemplateLoading: state.isTemplateLoading,
        message: state.message,
    }));

    if (!isTemplateLoading) {
        return null;
    }

    return (
        <div
            className="pointer-events-none fixed inset-0 z-[10500] flex items-center justify-center bg-neutral-950/70 backdrop-blur"
            role="status"
            aria-live="polite"
        >
            <div className="pointer-events-auto relative flex w-[min(90vw,22rem)] flex-col items-center gap-4 overflow-hidden rounded-2xl border border-neutral-700/75 bg-neutral-900/90 px-7 py-6 text-center text-neutral-100 shadow-[0_30px_90px_-35px_rgba(79,70,229,0.6)] backdrop-blur">
                <div
                    className="pointer-events-none absolute -inset-px rounded-[1.125rem] bg-gradient-to-br from-indigo-500/35 via-fuchsia-500/20 to-sky-500/30 opacity-80 blur"
                    aria-hidden="true"
                />
                <div className="relative flex h-11 w-11 items-center justify-center">
                    <span className="absolute h-11 w-11 animate-ping rounded-full bg-indigo-400/20" aria-hidden="true" />
                    <span className="relative h-11 w-11 animate-spin rounded-full border-[3px] border-indigo-300/65 border-t-transparent" aria-hidden="true" />
                </div>
                <div className="relative space-y-1">
                    <p className="text-sm font-semibold tracking-tight text-neutral-100">{message}</p>
                    <p className="text-xs font-normal text-neutral-400">This can take a couple of seconds—thanks for your patience.</p>
                </div>
            </div>
        </div>
    );
};
