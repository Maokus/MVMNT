import React, { useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { RULER_HEIGHT } from '../constants';
import TrackEditorRow from './TrackEditorRow';
import AutomationTrackLabels from '../automation/AutomationTrackLabels';
import TempoLaneHeader from '../automation/TempoLaneHeader';

interface TrackListProps {
    trackIds: string[];
    activeTab: 'clips' | 'automation';
    setActiveTab: (tab: 'clips' | 'automation') => void;
}

const TrackList: React.FC<TrackListProps> = ({ trackIds, activeTab, setActiveTab }) => {
    const tempoEnabled = useTimelineStore((s) => !!s.timeline.tempoAutomation?.enabled);
    const reorderTracks = useTimelineStore((s) => s.reorderTracks);

    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleDragEnd = () => {
        if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
            const newOrder = [...trackIds];
            const [removed] = newOrder.splice(draggedIndex, 1);
            newOrder.splice(dragOverIndex, 0, removed);
            reorderTracks(newOrder);
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const tabButton = (tab: 'clips' | 'automation', label: string) => (
        <button
            type="button"
            className={`timeline-track-tab ${
                activeTab === tab
                    ? 'bg-blue-600/70 text-white'
                    : 'bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/60'
            }`}
            onClick={() => setActiveTab(tab)}
        >
            {label}
        </button>
    );

    if (trackIds.length === 0 && activeTab === 'clips') {
        return (
            <div className="track-list space-y-0">
                <div className="timeline-track-tabs" style={{ height: RULER_HEIGHT }}>
                    {tabButton('clips', 'Clips')}
                    {tabButton('automation', 'Automation')}
                </div>
                <div className="empty-track-list text-sm text-neutral-400 p-3">
                    No tracks yet. Add a MIDI track using the button above.
                </div>
            </div>
        );
    }
    return (
        <div className="track-list space-y-0">
            {/* Tab buttons in the sticky ruler-height spacer */}
            <div className="timeline-track-tabs" style={{ height: RULER_HEIGHT }}>
                {tabButton('clips', 'Clips')}
                {tabButton('automation', 'Automation')}
            </div>
            {activeTab === 'clips' &&
                trackIds.map((id, index) => (
                    <div
                        key={id}
                        draggable
                        onDragStart={() => setDraggedIndex(index)}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverIndex(index);
                        }}
                        onDragEnd={handleDragEnd}
                        style={{ opacity: draggedIndex === index ? 0.4 : 1 }}
                    >
                        <TrackEditorRow
                            trackId={id}
                            isDragOver={dragOverIndex === index && draggedIndex !== index}
                            dragHandleProps={{ onMouseDown: (e) => e.stopPropagation() }}
                        />
                    </div>
                ))}
            {activeTab === 'automation' && <AutomationTrackLabels />}
            {activeTab === 'automation' && <TempoLaneHeader />}
        </div>
    );
};

export default TrackList;
