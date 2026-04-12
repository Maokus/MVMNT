import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { RULER_HEIGHT } from './constants';
import TrackEditorRow from './TrackEditorRow';
import AutomationTrackLabels from './AutomationTrackLabels';
import TempoLaneHeader from './TempoLaneHeader';

interface TrackListProps {
    trackIds: string[];
    activeTab: 'clips' | 'automation';
    setActiveTab: (tab: 'clips' | 'automation') => void;
}

const TrackList: React.FC<TrackListProps> = ({ trackIds, activeTab, setActiveTab }) => {
    const tempoEnabled = useTimelineStore((s) => !!s.timeline.tempoAutomation?.enabled);
    const tabButton = (tab: 'clips' | 'automation', label: string) => (
        <button
            type="button"
            className={`px-2 py-0.5 text-[10px] font-medium rounded ${activeTab === tab
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
                <div className="sticky top-0 z-10 bg-neutral-900/40 border-b border-neutral-800 flex items-center gap-1 px-2" style={{ height: RULER_HEIGHT }}>
                    {tabButton('clips', 'Clips')}
                    {tabButton('automation', 'Automation')}
                </div>
                <div className="empty-track-list text-sm text-neutral-400 p-3">
                    No tracks yet. Add a MIDI track using the button above or via the scene editor.
                </div>
            </div>
        );
    }
    return (
        <div className="track-list space-y-0">
            {/* Tab buttons in the sticky ruler-height spacer */}
            <div className="sticky top-0 z-10 bg-neutral-900/40 border-b border-neutral-800 flex items-center gap-1 px-2" style={{ height: RULER_HEIGHT }}>
                {tabButton('clips', 'Clips')}
                {tabButton('automation', 'Automation')}
            </div>
            {activeTab === 'clips' && trackIds.map((id) => (
                <TrackEditorRow key={id} trackId={id} />
            ))}
            {activeTab === 'automation' && <AutomationTrackLabels />}
            {activeTab === 'automation' && <TempoLaneHeader />}
        </div>
    );
};

export default TrackList;
