import React from 'react';
import TrackEditorRow from './track-editor-row';

const RULER_HEIGHT = 28; // keep in sync with TimelineRuler height

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
            {/* Spacer to align rows with the lanes below the ruler */}
            <div style={{ height: RULER_HEIGHT }} />
            {trackIds.map((id) => (
                <TrackEditorRow key={id} trackId={id} />
            ))}
        </div>
    );
};

export default TrackList;
