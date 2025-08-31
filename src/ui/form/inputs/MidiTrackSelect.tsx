import React, { useEffect, useState } from 'react';
import type { TimelineTrack } from '@core/timing';

interface Props {
    id: string;
    value: string | null;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string | null) => void;
}

const MidiTrackSelect: React.FC<Props> = ({ id, value, schema, disabled, title, onChange }) => {
    const [tracks, setTracks] = useState<TimelineTrack[]>([]);

    useEffect(() => {
        const fetchTracks = () => {
            try {
                const svc = (window as any).mvmntTimelineService;
                if (svc && typeof svc.getTracks === 'function') {
                    const all = svc.getTracks() as TimelineTrack[];
                    setTracks(all.filter((t: any) => t.type === 'midi'));
                }
            } catch { }
        };
        fetchTracks();
        const i = setInterval(fetchTracks, 500);
        return () => clearInterval(i);
    }, []);

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
