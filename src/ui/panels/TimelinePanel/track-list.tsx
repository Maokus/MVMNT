import React from 'react';
import TrackEditorRow from './track-editor-row';

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
            {trackIds.map((id) => (
                <TrackEditorRow key={id} trackId={id} />
            ))}
        </div>
    );
};

export default TrackList;
