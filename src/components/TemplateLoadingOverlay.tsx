import React from 'react';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { LoadingSpinner } from '@workspace/components/LoadingSpinner';
import { ProgressBar } from '@workspace/components/ProgressBar';

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
            className="pointer-events-none fixed inset-0 z-[10500] flex items-center justify-center bg-neutral-950/70"
            role="status"
            aria-live="polite"
        >
            <div className="pointer-events-auto relative flex w-[min(90vw,24rem)] flex-col items-center gap-4 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 px-7 py-6 text-center text-neutral-100 shadow-2xl">
                <LoadingSpinner size={44} />
                <div className="relative space-y-1">
                    <p className="text-sm font-semibold tracking-tight text-neutral-100">{message}</p>
                    <p className="text-xs font-normal text-neutral-400">
                        This can take a couple of seconds—thanks for your patience.
                    </p>
                </div>
                {typeof progress === 'number' && (
                    <div className="relative w-full" aria-label={`Loading progress ${Math.round(progress * 100)}%`}>
                        <ProgressBar
                            value={Math.max(0, Math.min(1, progress)) * 100}
                            label="Template loading progress"
                        />
                        <div className="mt-1 text-right text-[11px] text-neutral-400">
                            {Math.round(Math.max(0, Math.min(1, progress)) * 100)}%
                        </div>
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
