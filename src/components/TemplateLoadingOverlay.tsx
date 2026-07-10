import React from 'react';
import { useTemplateStatusStore } from '@state/templateStatusStore';

export const TemplateLoadingOverlay: React.FC = () => {
    const { isTemplateLoading, message, progress, onAbort } = useTemplateStatusStore((state) => ({
        isTemplateLoading: state.isTemplateLoading,
        message: state.message,
        progress: state.progress,
        onAbort: state.onAbort,
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
            <div className="pointer-events-auto relative flex w-[min(90vw,24rem)] flex-col items-center gap-4 overflow-hidden rounded-2xl border border-neutral-700/75 bg-neutral-900/90 px-7 py-6 text-center text-neutral-100 shadow-[0_30px_90px_-35px_rgba(79,70,229,0.6)] backdrop-blur">
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
                {typeof progress === 'number' && (
                    <div className="relative w-full" aria-label={`Loading progress ${Math.round(progress * 100)}%`}>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                            <div
                                className="h-full rounded-full bg-indigo-300 transition-[width] duration-150 ease-out"
                                style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
                            />
                        </div>
                        <div className="mt-1 text-right text-[11px] text-neutral-400">{Math.round(Math.max(0, Math.min(1, progress)) * 100)}%</div>
                    </div>
                )}
                {onAbort && (
                    <button
                        type="button"
                        className="relative rounded-md border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-700"
                        onClick={onAbort}
                    >
                        Abort
                    </button>
                )}
            </div>
        </div>
    );
};
