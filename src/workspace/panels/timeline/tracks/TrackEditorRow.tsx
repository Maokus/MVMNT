import React, { useRef, useState } from 'react';
import { FaTrash, FaGripVertical } from 'react-icons/fa';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';

interface TrackEditorRowProps {
    trackId: string;
    isDragOver?: boolean;
    dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const TrackEditorRow: React.FC<TrackEditorRowProps> = ({ trackId, isDragOver, dragHandleProps }) => {
    const track = useTimelineStore((s) => s.tracks[trackId]);
    const removeTrack = useTimelineStore((s) => s.removeTrack);
    const updateTrack = useTimelineStore((s) => s.updateTrack);
    const selected = useSelectionStore((s) => s.selectedTrackIds.includes(trackId));
    const selectTracks = useSelectionStore((s) => s.selectTracks);
    const setTrackGain = useTimelineStore((s) => s.setTrackGain);
    const setTrackMute = useTimelineStore((s) => s.setTrackMute);
    const setTrackSolo = useTimelineStore((s) => s.setTrackSolo);
    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const [editingName, setEditingName] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);

    if (!track) return null;

    const commitName = () => {
        const val = nameInputRef.current?.value?.trim();
        if (val && val !== track.name) {
            void updateTrack(trackId, { name: val });
        }
        setEditingName(false);
    };

    const controlSize = Math.max(14, Math.min(24, Math.round(rowHeight - 6)));
    const pillHeight = Math.max(12, Math.min(20, Math.round(rowHeight - 8)));
    const baseFontSize = Math.max(10, Math.min(13, rowHeight / 2.2));
    const smallFontSize = Math.max(9, Math.min(11, rowHeight / 2.6));

    return (
        <div
            className={`timeline-row flex h-full items-center justify-between gap-2 border-b px-2 ${isDragOver ? 'border-t-2 border-t-blue-400 border-b-neutral-800' : 'border-b-neutral-800'} ${selected ? 'bg-blue-700/25' : 'bg-neutral-900/40 hover:bg-neutral-800/40'}`}
            onClick={() => selectTracks([trackId])}
            role="button"
            title={selected ? 'Selected' : 'Click to select'}
            style={{ height: rowHeight, minHeight: rowHeight, fontSize: baseFontSize }}
        >
            {/* Drag handle */}
            <div
                className="flex-shrink-0 text-neutral-500 hover:text-neutral-300 cursor-grab active:cursor-grabbing px-0.5"
                title="Drag to reorder"
                {...dragHandleProps}
            >
                <FaGripVertical size={10} />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Name — double-click to edit */}
                {editingName ? (
                    <input
                        ref={nameInputRef}
                        aria-label="Track name"
                        className="truncate rounded border border-blue-400 bg-neutral-800 px-1 text-neutral-100 focus:outline-none"
                        style={{ fontSize: baseFontSize, height: pillHeight, minWidth: 0, width: '100%', maxWidth: 120 }}
                        defaultValue={track.name}
                        autoFocus
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { commitName(); }
                            else if (e.key === 'Escape') { setEditingName(false); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div
                        className="truncate text-neutral-200 cursor-text"
                        title={`${track.name} (double-click to rename)`}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
                    >{track.name}</div>
                )}
                {/* Mute / Solo (audio only for now, easily extend) */}
                {track.type === 'audio' && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                            aria-label={track.mute ? 'Unmute track' : 'Mute track'}
                            className={`rounded border px-1 ${track.mute ? 'bg-red-700/40 border-red-500 text-red-200' : 'border-neutral-600 text-neutral-200 hover:bg-neutral-700/40'}`}
                            onClick={() => {
                                void setTrackMute(trackId, !track.mute);
                            }}
                            title={track.mute ? 'Muted (click to unmute)' : 'Mute track'}
                            style={{ height: pillHeight, minHeight: pillHeight, fontSize: smallFontSize }}
                        >M</button>
                        <button
                            aria-label={track.solo ? 'Unsolo track' : 'Solo track'}
                            className={`rounded border px-1 ${track.solo ? 'bg-yellow-600/40 border-yellow-400 text-yellow-200' : 'border-neutral-600 text-neutral-200 hover:bg-neutral-700/40'}`}
                            onClick={() => {
                                void setTrackSolo(trackId, !track.solo);
                            }}
                            title={track.solo ? 'Solo active (click to clear)' : 'Solo track'}
                            style={{ height: pillHeight, minHeight: pillHeight, fontSize: smallFontSize }}
                        >S</button>
                    </div>
                )}
                {/* Gain (dB) text input for audio tracks. 0.0 dB => gain 1. */}
                {track.type === 'audio' && (
                    <div className="flex items-center gap-1 ml-2 shrink min-w-0" onClick={(e) => e.stopPropagation()} title={`Gain ${(track as any).gain?.toFixed?.(3)} (linear)`}>
                        <span className="opacity-70" style={{ fontSize: smallFontSize }}>dB</span>
                        {(() => {
                            // Convert current linear gain to dB for display; guard against zero.
                            const lin = (track as any).gain ?? 1;
                            const db = lin > 0 ? 20 * Math.log10(lin) : -Infinity;
                            const display = isFinite(db) ? db.toFixed(1) : '-inf';
                            return (
                                <input
                                    aria-label="Track gain (dB)"
                                    className="w-8 rounded border border-neutral-700 bg-neutral-800/60 px-1 text-neutral-200 focus:border-blue-400 focus:outline-none"
                                    type="text"
                                    defaultValue={display}
                                    style={{ height: pillHeight, minHeight: pillHeight, fontSize: smallFontSize }}
                                    onBlur={(e) => {
                                        const raw = e.target.value.trim().toLowerCase();
                                        let valDb: number;
                                        if (raw === '-inf' || raw === 'inf' || raw === '−inf') {
                                            valDb = -120; // treat as very low floor
                                        } else {
                                            const parsed = parseFloat(raw);
                                            valDb = isFinite(parsed) ? parsed : 0;
                                        }
                                        // Clamp dB range: -60dB (near silent) to +6dB (~2x)
                                        valDb = Math.max(-60, Math.min(6, valDb));
                                        const linNew = Math.pow(10, valDb / 20);
                                        void setTrackGain(trackId, linNew);
                                        // Normalize formatting after commit
                                        e.target.value = valDb.toFixed(1);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            (e.target as HTMLInputElement).blur();
                                        } else if (e.key === 'Escape') {
                                            (e.target as HTMLInputElement).value = display;
                                            (e.target as HTMLInputElement).blur();
                                        }
                                    }}
                                />
                            );
                        })()}
                    </div>
                )}
            </div>
            {/* Delete */}
            <button
                className="flex items-center justify-center rounded border border-neutral-700 text-neutral-300 hover:border-red-500 hover:text-red-300"
                title="Delete track"
                aria-label="Delete track"
                onClick={(e) => { e.stopPropagation(); removeTrack(trackId); }}
                style={{ width: controlSize, height: pillHeight }}
            >
                <FaTrash />
            </button>
        </div>
    );
};

export default TrackEditorRow;
