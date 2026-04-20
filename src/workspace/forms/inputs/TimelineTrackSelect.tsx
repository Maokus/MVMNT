import React, { useCallback, useMemo } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import type { TimelineTrack } from '@state/timelineStore';
import type { AudioTrack } from '@audio/audioTypes';

interface Props {
    id: string;
    value: string | string[] | null;
    schema: {
        allowMultiple?: boolean;
        allowedTrackTypes?: Array<'midi' | 'audio'>;
    };
    disabled?: boolean;
    title?: string;
    onChange: (value: string | string[] | null) => void;
}

const DEFAULT_ALLOWED_TYPES: Array<'midi' | 'audio'> = ['midi'];

const TimelineTrackSelect: React.FC<Props> = ({ id, value, schema, disabled, title, onChange }) => {
    const allowMultiple = Boolean(schema?.allowMultiple);
    const allowedTypes = schema?.allowedTrackTypes?.length ? schema.allowedTrackTypes : DEFAULT_ALLOWED_TYPES;
    const allowedKey = allowedTypes.slice().sort().join('|');
    const allowedSet = useMemo(() => new Set(allowedTypes), [allowedKey]);

    const tracks = useTimelineStore(
        useCallback((state) => {
            const options: Array<{ id: string; name: string; type: 'midi' | 'audio' }> = [];
            for (const trackId of state.tracksOrder) {
                const entry = state.tracks[trackId] as TimelineTrack | AudioTrack | undefined;
                if (!entry || (entry.type !== 'midi' && entry.type !== 'audio')) continue;
                if (!allowedSet.has(entry.type)) continue;
                options.push({
                    id: entry.id,
                    name: entry.name ?? entry.id,
                    type: entry.type,
                });
            }
            return options;
        }, [allowedKey, allowedSet]),
    );

    const placeholder = useMemo(() => {
        if (allowedTypes.length === 1) {
            return allowedTypes[0] === 'audio' ? 'Select Audio Track…' : 'Select MIDI Track…';
        }
        return 'Select Track…';
    }, [allowedTypes]);

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
            {!allowMultiple && <option value="">{placeholder}</option>}
            {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                    {t.type === 'audio' ? `Audio · ${t.name}` : `MIDI · ${t.name}`}
                </option>
            ))}
        </select>
    );
};

export default TimelineTrackSelect;
