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
            className="pointer-events-none fixed inset-0 z-[10500] flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm"
            role="status"
            aria-live="polite"
        >
            <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-neutral-700/80 bg-neutral-900/95 px-5 py-3 text-sm font-medium text-neutral-100 shadow-2xl">
                <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-500 border-t-white"
                    aria-hidden="true"
                />
                <span>{message}</span>
            </div>
        </div>
    );
};
