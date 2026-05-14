import { useEffect } from 'react';

export type TempoImportChoice = 'skip' | 'replace' | 'merge';

interface MidiTempoImportModalProps {
    open: boolean;
    tempoChangeCount: number;
    hasExistingKeyframes: boolean;
    onChoice: (choice: TempoImportChoice) => void;
}

export function MidiTempoImportModal({
    open,
    tempoChangeCount,
    hasExistingKeyframes,
    onChoice,
}: MidiTempoImportModalProps) {
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onChoice('skip');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onChoice]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[9900] flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={() => onChoice('skip')} aria-hidden="true" />
            <div
                className="relative w-[min(90vw,440px)] max-h-[90vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/95 p-6 text-sm text-neutral-200 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="m-0 text-lg font-semibold text-white">Import Tempo Changes</h2>
                <p className="mt-3 text-[13px] leading-relaxed text-neutral-300">
                    This MIDI file contains{' '}
                    <span className="font-semibold text-white">{tempoChangeCount}</span> tempo
                    change{tempoChangeCount !== 1 ? 's' : ''}. Import them to the tempo automation
                    lane?
                </p>

                <div className="mt-5 flex flex-wrap justify-end gap-2 text-[13px]">
                    <button
                        type="button"
                        onClick={() => onChoice('skip')}
                        className="rounded border border-transparent px-3 py-1.5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        Skip
                    </button>
                    {hasExistingKeyframes && (
                        <button
                            type="button"
                            onClick={() => onChoice('merge')}
                            className="rounded border border-blue-500/70 bg-blue-600/70 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
                        >
                            Merge with existing
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => onChoice('replace')}
                        className="rounded border border-amber-500/70 bg-amber-600/70 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-amber-500"
                    >
                        {hasExistingKeyframes ? 'Replace existing' : 'Import'}
                    </button>
                </div>
            </div>
        </div>
    );
}
