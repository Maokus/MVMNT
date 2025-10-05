import React from 'react';
import { RULER_HEIGHT } from './constants';
import TrackEditorRow from './TrackEditorRow';

const TrackList: React.FC<{ trackIds: string[] }> = ({ trackIds }) => {
    if (trackIds.length === 0) {
        return (
            <div className="empty-track-list text-sm text-neutral-400 p-3">
                No tracks yet. Add a MIDI track using the button above or via the scene editor.
            </div>
        );
    }
    return (
        <div className="track-list space-y-0">
            {/* Sticky spacer to align rows with the lanes below the sticky ruler */}
            <div className="sticky top-0 z-10 bg-neutral-900/40 border-b border-neutral-800" style={{ height: RULER_HEIGHT }} />
            {trackIds.map((id) => (
                <TrackEditorRow key={id} trackId={id} />
            ))}
        </div>
    );
};

export default TrackList;
