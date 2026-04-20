import { useEffect } from 'react';
import type { MIDITrackDetails } from '@core/types';

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
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onCancel]);

    if (!open) return null;

    const playableCount = tracks.length;

    return (
        <div className="fixed inset-0 z-[9900] flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
            <div
                className="relative w-[min(90vw,520px)] max-h-[90vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/95 p-6 text-sm text-neutral-200 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="m-0 text-lg font-semibold text-white">Import MIDI Tracks</h2>
                <p className="mt-3 text-[13px] leading-relaxed text-neutral-300">
                    <span className="font-medium text-white">{fileName}</span> contains{' '}
                    <span className="font-semibold text-white">{playableCount}</span> playable MIDI tracks. Choose how you would
                    like to import them.
                </p>
                <ul className="mt-4 flex flex-col gap-2 rounded border border-neutral-700/70 bg-neutral-800/40 p-3 text-[12px] text-neutral-200">
                    {tracks.map((track, index) => {
                        const label = track.name?.trim().length ? track.name.trim() : `Track ${index + 1}`;
                        const channels = track.channels.length
                            ? track.channels
                                  .map((channel) => `Ch ${channel + 1}`)
                                  .join(', ')
                            : 'Channels unknown';
                        const notesLabel = `${track.noteCount} note${track.noteCount === 1 ? '' : 's'}`;
                        return (
                            <li key={`${track.trackIndex}-${label}`} className="flex flex-col gap-1 rounded bg-neutral-900/60 px-3 py-2">
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
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded border border-transparent px-3 py-1.5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onImportSingle}
                        className="rounded border border-blue-500/70 bg-blue-600/70 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
                    >
                        Import as single track
                    </button>
                    <button
                        type="button"
                        onClick={onImportSplit}
                        className="rounded border border-emerald-500/70 bg-emerald-600/70 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
                    >
                        Split into {playableCount} tracks
                    </button>
                </div>
            </div>
        </div>
    );
}
