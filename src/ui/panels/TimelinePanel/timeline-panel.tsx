import React, { useMemo, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { selectMidiTracks, selectTimeline } from '@selectors/timelineSelectors';
import TransportControls from '../TransportControls';
import TrackList from './track-list';
import TrackLanes from './TrackLanes';

const TimelinePanel: React.FC = () => {
    const timeline = useTimelineStore(selectTimeline);
    const order = useTimelineStore((s) => s.tracksOrder);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const trackIds = useMemo(() => order.filter((id) => !!tracksMap[id]), [order, tracksMap]);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        await addMidiTrack({ name: f.name.replace(/\.[^/.]+$/, ''), file: f });
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className="timeline-panel" role="region" aria-label="Timeline panel">
            <div className="timeline-header">
                <h3 className="m-0 text-[13px] font-semibold text-neutral-300">Timeline — {timeline.name}</h3>
                <div className="flex items-center gap-2">
                    <label className="px-2 py-1 border rounded cursor-pointer text-xs font-medium">
                        Add MIDI Track
                        <input ref={fileRef} type="file" accept=".mid,.midi" className="hidden" onChange={handleAddFile} />
                    </label>
                    <TransportControls />
                </div>
            </div>
            <div className="timeline-body">
                <div className="tracklist-container max-w-full overflow-x-auto">
                    <TrackList trackIds={trackIds} />
                </div>
                <TrackLanes trackIds={trackIds} />
            </div>
        </div>
    );
};

export default TimelinePanel;
