import { Button } from '@workspace/components/Button';
import { ModalShell } from './ModalShell';

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
    if (!open) return null;

    return (
        <ModalShell
            shortcutId="modal.midi-tempo-import.escape"
            label="Import Tempo Changes"
            onCancel={() => onChoice('skip')}
            cardClassName="relative w-[min(90vw,440px)] max-h-[90vh] overflow-y-auto rounded border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-200 "
        >
            <h2 className="m-0 text-lg font-semibold text-white">Import Tempo Changes</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-neutral-300">
                This MIDI file contains <span className="font-semibold text-white">{tempoChangeCount}</span> tempo
                change{tempoChangeCount !== 1 ? 's' : ''}. Import them to the tempo automation lane?
            </p>

            <div className="mt-5 flex flex-wrap justify-end gap-2 text-[13px]">
                <Button variant="ghost" size="full" onClick={() => onChoice('skip')}>
                    Skip
                </Button>
                {hasExistingKeyframes && (
                    <Button variant="solid-blue" size="full" onClick={() => onChoice('merge')}>
                        Merge with existing
                    </Button>
                )}
                <Button variant="solid-amber" size="full" onClick={() => onChoice('replace')}>
                    {hasExistingKeyframes ? 'Replace existing' : 'Import'}
                </Button>
            </div>
        </ModalShell>
    );
}
