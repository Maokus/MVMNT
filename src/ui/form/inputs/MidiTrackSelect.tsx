import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { selectMidiTracks } from '@selectors/timelineSelectors';
import type { TimelineTrack } from '@state/timelineStore';

interface Props {
    id: string;
    value: string | null;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string | null) => void;
}

const MidiTrackSelect: React.FC<Props> = ({ id, value, schema, disabled, title, onChange }) => {
    const tracks = useTimelineStore(selectMidiTracks);
    return (
        <select id={id} value={value || ''} disabled={disabled} title={title} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">Select MIDI Track…</option>
            {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                    {t.name}
                </option>
            ))}
        </select>
    );
};

export default MidiTrackSelect;
