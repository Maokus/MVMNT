import type { MIDITrackDetails } from '@core/types';
import { Button } from '@workspace/components/Button';
import { ModalShell } from './ModalShell';

interface MidiImportModeModalProps {
    open: boolean;
    fileName: string;
    tracks: MIDITrackDetails[];
    onImportSingle: () => void;
    onImportSplit: () => void;
    onCancel: () => void;
}

export function MidiImportModeModal({
    open,
    fileName,
    tracks,
    onImportSingle,
    onImportSplit,
    onCancel,
}: MidiImportModeModalProps) {
    if (!open) return null;

    const playableCount = tracks.length;

    return (
        <ModalShell
            shortcutId="modal.midi-import-mode.escape"
            label="Import MIDI Tracks"
            onCancel={onCancel}
            cardClassName="relative w-[min(90vw,520px)] max-h-[90vh] overflow-y-auto rounded border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-200 "
        >
            <h2 className="m-0 text-lg font-semibold text-white">Import MIDI Tracks</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-neutral-300">
                <span className="font-medium text-white">{fileName}</span> contains{' '}
                <span className="font-semibold text-white">{playableCount}</span> playable MIDI tracks. Choose how you
                would like to import them.
            </p>
            <ul className="mt-4 flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-800 p-3 text-[12px] text-neutral-200">
                {tracks.map((track, index) => {
                    const label = track.name?.trim().length ? track.name.trim() : `Track ${index + 1}`;
                    const channels = track.channels.length
                        ? track.channels.map((channel) => `Ch ${channel + 1}`).join(', ')
                        : 'Channels unknown';
                    const notesLabel = `${track.noteCount} note${track.noteCount === 1 ? '' : 's'}`;
                    return (
                        <li
                            key={`${track.trackIndex}-${label}`}
                            className="flex flex-col gap-1 rounded bg-neutral-900 px-3 py-2"
                        >
                            <span className="text-[13px] font-medium text-white">{label}</span>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-300">
                                <span>{notesLabel}</span>
                                <span>{channels}</span>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-5 flex flex-wrap justify-end gap-2 text-[13px]">
                <Button variant="ghost" size="full" onClick={onCancel}>
                    Cancel
                </Button>
                <Button variant="solid-blue" size="full" onClick={onImportSingle}>
                    Import as single track
                </Button>
                <Button variant="solid-emerald" size="full" onClick={onImportSplit}>
                    Split into {playableCount} tracks
                </Button>
            </div>
        </ModalShell>
    );
}
