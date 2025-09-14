import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { FaPlay, FaPause, FaStop } from 'react-icons/fa';

// NOTE: This component is now buttons-only (Play/Pause, Stop) for use in the centered header.

const TransportControls: React.FC = () => {
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    const togglePlay = useTimelineStore((s) => s.togglePlay);
    const view = useTimelineStore((s) => s.timelineView);
    const setCurrentTick = useTimelineStore((s) => s.setCurrentTick);
    const seekTick = useTimelineStore((s) => s.seekTick);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const TICKS_PER_QUARTER = 960; // constant for now; unify later
    const startTick = playbackRange?.startTick ?? view.startTick;

    return (
        <div className="transport flex items-center gap-2 text-sm">
            <button
                className="px-2 py-1 border border-neutral-700 rounded bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1"
                onClick={() => togglePlay()}
                aria-label={isPlaying ? 'Pause playback' : 'Play'}
                title={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? <FaPause /> : <FaPlay />}
            </button>
            <button
                className="px-2 py-1 border border-neutral-700 rounded bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1"
                onClick={() => {
                    // Stop = pause + seek to playback range start (or view start)
                    if (isPlaying) togglePlay();
                    setCurrentTick(startTick);
                    seekTick(startTick);
                }}
                aria-label="Stop and return to range start"
                title="Stop"
            >
                <FaStop />
            </button>
        </div>
    );
};

export default TransportControls;
