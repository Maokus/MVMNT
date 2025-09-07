import React from 'react';
import { useTimelineStore } from '@state/timelineStore';

const TrackEditorRow: React.FC<{ trackId: string }> = ({ trackId }) => {
    const track = useTimelineStore((s) => s.tracks[trackId]);
    const setEnabled = useTimelineStore((s) => s.setTrackEnabled);
    const removeTrack = useTimelineStore((s) => s.removeTrack);

    if (!track) return null;

    return (
        <div className="timeline-row flex items-center justify-between gap-2 py-1 px-2 border-b border-neutral-800 bg-neutral-900/40 text-xs">
            <div className="flex items-center gap-2 min-w-0">
                {/* Eye toggle */}
                <button
                    className={`w-6 h-6 rounded flex items-center justify-center border ${track.enabled ? 'border-neutral-600 text-neutral-200' : 'border-neutral-700 text-neutral-500 opacity-80'}`}
                    title={track.enabled ? 'Disable track' : 'Enable track'}
                    onClick={() => setEnabled(trackId, !track.enabled)}
                >
                    {track.enabled ? '👁' : '🙈'}
                </button>
                {/* Name (read-only) */}
                <div className="truncate text-neutral-200" title={track.name}>{track.name}</div>
            </div>
            {/* Delete */}
            <button
                className="w-6 h-6 rounded flex items-center justify-center border border-neutral-700 text-neutral-300 hover:text-red-300 hover:border-red-500"
                title="Delete track"
                onClick={() => removeTrack(trackId)}
            >
                🗑️
            </button>
        </div>
    );
};

export default TrackEditorRow;
