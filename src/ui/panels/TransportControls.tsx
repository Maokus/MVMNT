import React from 'react';
import { useTimelineStore } from '@state/timelineStore';

// NOTE: This component is now buttons-only (Play/Pause, Stop) for use in the centered header.

const TransportControls: React.FC = () => {
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    const togglePlay = useTimelineStore((s) => s.togglePlay);
    const view = useTimelineStore((s) => s.timelineView);
    const setCurrent = useTimelineStore((s) => s.setCurrentTimeSec);

    return (
        <div className="transport flex items-center gap-2 text-sm">
            <button className="px-2 py-1 border border-neutral-700 rounded bg-neutral-900/50 hover:bg-neutral-800/60"
                onClick={() => togglePlay()}>{isPlaying ? 'Pause' : 'Play'}</button>
            <button className="px-2 py-1 border border-neutral-700 rounded bg-neutral-900/50 hover:bg-neutral-800/60"
                onClick={() => { setCurrent(view.startSec); }}>Stop</button>
        </div>
    );
};

export default TransportControls;
