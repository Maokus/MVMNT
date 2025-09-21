import React from 'react';
import { FaEye, FaEyeSlash, FaTrash } from 'react-icons/fa';
import { useTimelineStore } from '@state/timelineStore';

const TrackEditorRow: React.FC<{ trackId: string }> = ({ trackId }) => {
    const track = useTimelineStore((s) => s.tracks[trackId]);
    const setEnabled = useTimelineStore((s) => s.setTrackEnabled);
    const removeTrack = useTimelineStore((s) => s.removeTrack);
    const selected = useTimelineStore((s) => s.selection.selectedTrackIds.includes(trackId));
    const selectTracks = useTimelineStore((s) => s.selectTracks);
    const setTrackGain = useTimelineStore((s) => s.setTrackGain);
    const setTrackMute = useTimelineStore((s) => s.setTrackMute);
    const setTrackSolo = useTimelineStore((s) => s.setTrackSolo);

    if (!track) return null;

    return (
        <div
            className={`timeline-row flex items-center justify-between gap-2 py-1 px-2 border-b border-neutral-800 text-xs ${selected ? 'bg-blue-700/25' : 'bg-neutral-900/40 hover:bg-neutral-800/40'}`}
            onClick={() => selectTracks([trackId])}
            role="button"
            title={selected ? 'Selected' : 'Click to select'}
        >
            <div className="flex items-center gap-2 min-w-0">
                {/* Eye toggle */}
                <button
                    className={`w-6 h-6 rounded flex items-center justify-center border ${track.enabled ? 'border-neutral-600 text-neutral-200' : 'border-neutral-700 text-neutral-500 opacity-80'}`}
                    title={track.enabled ? 'Disable track' : 'Enable track'}
                    aria-label={track.enabled ? 'Disable track' : 'Enable track'}
                    onClick={(e) => { e.stopPropagation(); setEnabled(trackId, !track.enabled); }}
                >
                    {track.enabled ? <FaEye /> : <FaEyeSlash />}
                </button>
                {/* Name */}
                <div className="truncate text-neutral-200" title={track.name}>{track.name}</div>
                {/* Mute / Solo (audio only for now, easily extend) */}
                {track.type === 'audio' && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                            aria-label={track.mute ? 'Unmute track' : 'Mute track'}
                            className={`px-1 h-5 rounded border text-[10px] ${track.mute ? 'bg-red-700/40 border-red-500 text-red-200' : 'border-neutral-600 text-neutral-200 hover:bg-neutral-700/40'}`}
                            onClick={() => setTrackMute(trackId, !track.mute)}
                            title={track.mute ? 'Muted (click to unmute)' : 'Mute track'}
                        >M</button>
                        <button
                            aria-label={track.solo ? 'Unsolo track' : 'Solo track'}
                            className={`px-1 h-5 rounded border text-[10px] ${track.solo ? 'bg-yellow-600/40 border-yellow-400 text-yellow-200' : 'border-neutral-600 text-neutral-200 hover:bg-neutral-700/40'}`}
                            onClick={() => setTrackSolo(trackId, !track.solo)}
                            title={track.solo ? 'Solo active (click to clear)' : 'Solo track'}
                        >S</button>
                    </div>
                )}
                {/* Gain slider for audio tracks */}
                {track.type === 'audio' && (
                    <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()} title={`Gain ${(track as any).gain?.toFixed?.(2)}`}>
                        <span className="text-[10px] opacity-70">G</span>
                        <input
                            aria-label="Track gain"
                            className="h-2 max-w-4"
                            type="range"
                            min={0}
                            max={2}
                            step={0.01}
                            value={(track as any).gain ?? 1}
                            onChange={(e) => setTrackGain(trackId, parseFloat(e.target.value))}
                        />
                    </div>
                )}
            </div>
            {/* Delete */}
            <button
                className="w-6 h-6 rounded flex items-center justify-center border border-neutral-700 text-neutral-300 hover:text-red-300 hover:border-red-500"
                title="Delete track"
                aria-label="Delete track"
                onClick={(e) => { e.stopPropagation(); removeTrack(trackId); }}
            >
                <FaTrash />
            </button>
        </div>
    );
};

export default TrackEditorRow;
