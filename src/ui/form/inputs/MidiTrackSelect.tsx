import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { selectMidiTracks } from '@selectors/timelineSelectors';
import type { TimelineTrack } from '@state/timelineStore';

interface Props {
    id: string;
    value: string | string[] | null;
    schema: any; // can contain allowMultiple?: boolean
    disabled?: boolean;
    title?: string;
    onChange: (value: string | string[] | null) => void;
}

const MidiTrackSelect: React.FC<Props> = ({ id, value, schema, disabled, title, onChange }) => {
    const tracks = useTimelineStore(selectMidiTracks);
    const allowMultiple = Boolean(schema?.allowMultiple);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (allowMultiple) {
            const selected: string[] = Array.from(e.target.selectedOptions).map((o) => o.value).filter(Boolean);
            onChange(selected.length ? selected : []);
        } else {
            onChange(e.target.value || null);
        }
    };

    const selectProps: any = {};
    if (allowMultiple) selectProps.multiple = true;

    const selectedValue = allowMultiple
        ? (Array.isArray(value) ? value : (value ? [value] : []))
        : (typeof value === 'string' ? value : '');

    return (
        <select id={id} disabled={disabled} title={title} onChange={handleChange} value={selectedValue as any} {...selectProps}>
            {!allowMultiple && <option value="">Select MIDI Track…</option>}
            {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                    {t.name}
                </option>
            ))}
        </select>
    );
};

export default MidiTrackSelect;
