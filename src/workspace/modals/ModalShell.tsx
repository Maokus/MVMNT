import type { MouseEventHandler, ReactNode } from 'react';
import { useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';

export interface ModalShellProps {
    shortcutId: string;
    label: string;
    onCancel: () => void;
    children: ReactNode;
    widthClass?: string;
}

export function ModalShell({ shortcutId, label, onCancel, children, widthClass }: ModalShellProps) {
    useGlobalShortcut({
        id: shortcutId,
        domain: 'modal',
        matches: (event) => event.key === 'Escape',
        handle: (event) => {
            event.preventDefault();
            onCancel();
            return true;
        },
    });

    const handleCardClick: MouseEventHandler<HTMLDivElement> = (event) => {
        event.stopPropagation();
    };

    return (
        <div
            className="fixed inset-0 z-[9900] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={label}
        >
            <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
            <div
                className={`relative ${widthClass ?? 'w-[380px] max-w-[90vw]'} rounded-lg border border-neutral-700 bg-neutral-900/95 p-5 text-sm text-neutral-200 shadow-2xl`}
                onClick={handleCardClick}
            >
                {children}
            </div>
        </div>
    );
}
