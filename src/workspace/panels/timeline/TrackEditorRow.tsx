import React, { useCallback, useState } from 'react';
import { FaEye, FaEyeSlash, FaTrash, FaPen } from 'react-icons/fa';
import { useTimelineStore } from '@state/timelineStore';
import { isErrored } from 'stream';

const TrackEditorRow: React.FC<{ trackId: string }> = ({ trackId }) => {
    const track = useTimelineStore((s) => s.tracks[trackId]);
    const setEnabled = useTimelineStore((s) => s.setTrackEnabled);
    const removeTrack = useTimelineStore((s) => s.removeTrack);
    const selected = useTimelineStore((s) => s.selection.selectedTrackIds.includes(trackId));
    const selectTracks = useTimelineStore((s) => s.selectTracks);
    const setTrackGain = useTimelineStore((s) => s.setTrackGain);
    const setTrackMute = useTimelineStore((s) => s.setTrackMute);
    const setTrackSolo = useTimelineStore((s) => s.setTrackSolo);
    const rowHeight = useTimelineStore((s) => s.rowHeight);

    if (!track) return null;

    const pillHeight = Math.max(12, Math.min(20, Math.round(rowHeight - 8)));
    const baseFontSize = Math.max(10, Math.min(13, rowHeight / 2.2));
    const smallFontSize = Math.max(9, Math.min(11, rowHeight / 2.6));

    const [isEditingName, setIsEditingName] = useState(false);
    const [trackNameDraft, setTrackNameDraft] = useState('');

    const handleStartEditingName = useCallback((trackName: string) => {
        setTrackNameDraft(trackName);
        setIsEditingName(true);
    }, []);

    const handleNameKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>, trackName: string) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                track.name = trackName;
                setIsEditingName(false);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                setIsEditingName(false);
            }
        },
        [() => setIsEditingName(false)]
    );

    return (
        <div
            className={`timeline-row flex h-full items-center justify-between gap-2 border-b border-neutral-800 px-2 ${selected ? 'bg-blue-700/25' : 'bg-neutral-900/40 hover:bg-neutral-800/40'}`}
            onClick={() => selectTracks([trackId])}
            role="button"
            title={selected ? 'Selected' : 'Click to select'}
            style={{ height: rowHeight, minHeight: rowHeight, fontSize: baseFontSize }}
        >
            <div className="flex items-center gap-2 min-w-0">
                {/* Eye toggle */}
                <button
                    className={`flex items-center justify-center rounded border ${track.enabled ? 'border-neutral-600 text-neutral-200' : 'border-neutral-700 text-neutral-500 opacity-80'}`}
                    title={track.enabled ? 'Disable track' : 'Enable track'}
                    aria-label={track.enabled ? 'Disable track' : 'Enable track'}
                    onClick={(e) => {
                        e.stopPropagation();
                        void setEnabled(trackId, !track.enabled);
                    }}
                    style={{ width: pillHeight, height: pillHeight }}
                >
                    {track.enabled ? <FaEye /> : <FaEyeSlash />}
                </button>
                {/* Name */}
                {isEditingName ? (
                    <input
                        type="text"
                        value={trackNameDraft}
                        onChange={(event) => setTrackNameDraft(event.target.value)}
                        onBlur={() => setIsEditingName(false)}
                        onKeyDown={(event) => handleNameKeyDown(event, (event.target as HTMLInputElement).value)}
                        className="flex items-center rounded border border-neutral-700 bg-neutral-800/60 px-1 focus-within:border-blue-400"
                        aria-label="Track name"
                    /> 
                ) : (
                    <div className="flex gap-1">
                        <div className="truncate text-neutral-200" title={track.name}>{track.name}</div>
                        <button
                            type="button"
                            className="bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-300 hover:bg-[color:var(--twc-border)] flex items-center"
                            onClick={() => handleStartEditingName(track.name)}
                            title="Edit track name"
                            aria-label="Edit track name"
                        >
                          <FaPen />
                        </button>
                    </div>
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
                    <div className="flex items-center shrink min-w-0" onClick={(e) => e.stopPropagation()} title={`Gain ${(track as any).gain?.toFixed?.(3)} (linear)`}>
                        {(() => {
                            // Convert current linear gain to dB for display; guard against zero.
                            const lin = (track as any).gain ?? 1;
                            const db = lin > 0 ? 20 * Math.log10(lin) : -Infinity;
                            const display = isFinite(db) ? db.toFixed(1) : '-inf';
                            return (
                                <div 
                                    className="flex items-center rounded border border-neutral-700 bg-neutral-800/60 px-1 focus-within:border-blue-400"
                                    style={{ height: pillHeight, minHeight: pillHeight }}
                                >
                                    <input
                                        aria-label="Track gain (dB)"
                                        className="w-7 bg-transparent text-neutral-200 outline-none border-none p-0"
                                        type="text"
                                        defaultValue={display}
                                        style={{ fontSize: smallFontSize }}
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
                                    <span className="opacity-50 select-none ml-0.5" style={{ fontSize: smallFontSize }}>dB</span>
                                </div>
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
                style={{ width: pillHeight, height: pillHeight }}
            >
                <FaTrash />
            </button>
        </div>
    );
};

export default TrackEditorRow;
