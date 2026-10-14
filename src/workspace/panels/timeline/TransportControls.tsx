import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { FaPlay, FaPause, FaStop } from 'react-icons/fa';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { Button } from '@workspace/components/Button';

// NOTE: This component is now buttons-only (Play/Pause, Stop) for use in the centered header.

const TransportControls: React.FC = () => {
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    const togglePlay = useTimelineStore((s) => s.togglePlay);
    const view = useTimelineStore((s) => s.timelineView);
    const setCurrentTick = useTimelineStore((s) => s.setCurrentTick);
    const seekTick = useTimelineStore((s) => s.seekTick);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const startTick = playbackRange?.startTick ?? view.startTick;

    return (
        <div className="transport flex items-center gap-2 text-sm">
            <Button
                variant="transport"
                size="full"
                onClick={() => seekTick(Math.max(0, currentTick - 1))}
                aria-label="Step back one tick"
                title="Step back one tick (Ctrl/Cmd+Left)"
            >
                <FaChevronLeft />
            </Button>
            <Button
                variant="transport"
                size="full"
                onClick={() => togglePlay()}
                id="timeline-play"
                data-tutorial-target="play"
                aria-label={isPlaying ? 'Pause playback' : 'Play'}
                title={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? <FaPause /> : <FaPlay />}
            </Button>
            <Button
                variant="transport"
                size="full"
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
            </Button>
            <Button
                variant="transport"
                size="full"
                onClick={() => seekTick(currentTick + 1)}
                aria-label="Step forward one tick"
                title="Step forward one tick (Ctrl/Cmd+Right)"
            >
                <FaChevronRight />
            </Button>
        </div>
    );
};

export default TransportControls;
