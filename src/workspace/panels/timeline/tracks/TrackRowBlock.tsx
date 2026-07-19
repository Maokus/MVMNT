import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from '../hooks/useTickScale';
import { getMidiClipTimelineBounds, getMidiClipsForTrack } from '@state/timeline/midiClips';
import { getAudioClipTimelineBounds, getAudioClipsForTrack } from '@state/timeline/audioClips';
import { createTimelineTimingContext } from '@state/timeline/timelineShared';
import MidiClipBlock from './MidiClipBlock';
import AudioClipBlock from './AudioClipBlock';

type Props = {
    trackId: string;
    trackIndex: number;
    laneWidth: number;
    laneHeight: number;
    onHoverSnapX: (x: number | null) => void;
};

const TrackRowBlock: React.FC<Props> = ({ trackId, trackIndex, laneWidth, laneHeight, onHoverSnapX }) => {
    const track = useTimelineStore((state) => state.tracks[trackId]);
    const { view } = useTickScale();
    if (!track) return null;

    const state = useTimelineStore.getState();
    const viewportPad = Math.max(1, Math.floor((view.endTick - view.startTick) * 0.1));
    const visibleStart = view.startTick - viewportPad;
    const visibleEnd = view.endTick + viewportPad;

    if (track.type === 'midi') {
        const clips = getMidiClipsForTrack(track).filter((clip) => {
            if (clip.enabled === false) return false;
            const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
            return Boolean(bounds && bounds.endTick >= visibleStart && bounds.startTick <= visibleEnd);
        });
        return (
            <div className="relative h-full">
                {clips.map((clip) => (
                    <MidiClipBlock
                        key={clip.id}
                        trackId={trackId}
                        trackIndex={trackIndex}
                        rowHeight={laneHeight}
                        clip={clip}
                        laneWidth={laneWidth}
                        laneHeight={laneHeight}
                        onHoverSnapX={onHoverSnapX}
                    />
                ))}
            </div>
        );
    }

    const timing = createTimelineTimingContext(state);
    const clips = getAudioClipsForTrack(track).filter((clip) => {
        if (clip.enabled === false) return false;
        const bounds = getAudioClipTimelineBounds(state.audioCache, clip, timing);
        return Boolean(bounds && bounds.endTick >= visibleStart && bounds.startTick <= visibleEnd);
    });
    return (
        <div className="relative h-full">
            {clips.map((clip) => (
                <AudioClipBlock
                    key={clip.id}
                    trackId={trackId}
                    trackIndex={trackIndex}
                    rowHeight={laneHeight}
                    clip={clip}
                    laneWidth={laneWidth}
                    laneHeight={laneHeight}
                    onHoverSnapX={onHoverSnapX}
                />
            ))}
        </div>
    );
};

export default TrackRowBlock;
