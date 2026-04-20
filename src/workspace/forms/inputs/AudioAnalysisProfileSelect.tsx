import React, { useMemo } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureAnalysisProfileDescriptor } from '@audio/features/audioFeatureTypes';

interface AudioAnalysisProfileSelectSchema {
    trackId?: string | string[] | null;
    glossaryTerms?: {
        analysisProfile?: string;
    };
}

interface AudioAnalysisProfileSelectProps {
    id: string;
    value: string | null;
    schema: AudioAnalysisProfileSelectSchema;
    disabled?: boolean;
    title?: string;
    onChange: (value: string | null) => void;
}

const normalizeTrackId = (
    trackId: AudioAnalysisProfileSelectSchema['trackId'],
): string | null => {
    if (!trackId) return null;
    if (Array.isArray(trackId)) {
        return trackId.find((entry) => typeof entry === 'string' && entry.length > 0) ?? null;
    }
    return typeof trackId === 'string' && trackId.length > 0 ? trackId : null;
};

const buildGlossaryTitle = (term: string | undefined): string | undefined => {
    if (!term) return undefined;
    return `Analysis profile. See docs/audio-feature-bindings.md#${term}`;
};

export const AudioAnalysisProfileSelect: React.FC<AudioAnalysisProfileSelectProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange,
}) => {
    const trackId = normalizeTrackId(schema?.trackId);
    const trackKey = trackId ?? '';

    const { profiles, defaultProfileId } = useTimelineStore(
        React.useCallback(
            (state): {
                profiles: Record<string, AudioFeatureAnalysisProfileDescriptor>;
                defaultProfileId: string | null;
            } => {
                if (!trackId) {
                    return { profiles: {}, defaultProfileId: null };
                }
                const track = state.tracks[trackId];
                if (!track || track.type !== 'audio') {
                    return { profiles: {}, defaultProfileId: null };
                }
                const sourceId = track.audioSourceId ?? track.id;
                const cache = state.audioFeatureCaches[sourceId];
                return {
                    profiles: cache?.analysisProfiles ?? {},
                    defaultProfileId: cache?.defaultAnalysisProfileId ?? null,
                };
            },
            [trackKey],
        ),
    );

    const options = useMemo(() => {
        return Object.values(profiles).sort((a, b) => a.id.localeCompare(b.id));
    }, [profiles]);

    const effectiveValue = value ?? defaultProfileId ?? '';
    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const next = event.target.value;
        onChange(next ? next : null);
    };

    const glossaryTitle = buildGlossaryTitle(schema?.glossaryTerms?.analysisProfile);
    const hasProfiles = options.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <select
                id={id}
                value={effectiveValue}
                onChange={handleChange}
                disabled={disabled || !hasProfiles}
                title={glossaryTitle ?? title}
            >
                {!hasProfiles && <option value="">No profiles available</option>}
                {hasProfiles && (
                    <option value="">Default ({defaultProfileId ?? 'cache'})</option>
                )}
                {options.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                        {profile.id}
                    </option>
                ))}
            </select>
            {!hasProfiles && (
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                    Select an analysed track to choose a profile.
                </span>
            )}
        </div>
    );
};
