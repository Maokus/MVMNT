import React, { useCallback, useEffect, useMemo } from 'react';
import type { AudioTrack } from '@audio/audioTypes';
import { useTimelineStore } from '@state/timelineStore';

interface AudioFeatureBindingValue {
    type: 'audioFeature';
    trackId: string;
    featureKey: string;
    calculatorId?: string;
    bandIndex?: number | null;
    channelIndex?: number | null;
    smoothing?: number | null;
}

interface AudioFeatureBindingInputProps {
    id: string;
    value: AudioFeatureBindingValue | null;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: AudioFeatureBindingValue | null) => void;
}

interface TrackOption {
    id: string;
    name: string;
    sourceId: string;
}

const DEFAULT_FEATURE_KEY = 'rms';

const AudioFeatureBindingInput: React.FC<AudioFeatureBindingInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange,
}) => {
    const bindingValue = value && value.type === 'audioFeature' ? value : null;
    const requiredFeatureKey = (schema?.requiredFeatureKey as string | undefined) ?? null;

    const trackOptions = useTimelineStore(
        useCallback((state) => {
            return state.tracksOrder
                .map((trackId) => state.tracks[trackId])
                .filter((track): track is AudioTrack => Boolean(track) && track.type === 'audio')
                .map<TrackOption>((track) => ({
                    id: track.id,
                    name: track.name ?? track.id,
                    sourceId: track.audioSourceId ?? track.id,
                }));
        }, []),
    );

    const trackLookup = useMemo(() => new Map(trackOptions.map((opt) => [opt.id, opt])), [trackOptions]);
    const hasValidBinding = !!(bindingValue?.trackId && trackLookup.has(bindingValue.trackId));

    useEffect(() => {
        if (disabled) return;
        if (!trackOptions.length) return;
        if (hasValidBinding) return;
        const fallback = trackOptions[0];
        if (!fallback) return;
        const nextFeature = bindingValue?.featureKey ?? requiredFeatureKey ?? DEFAULT_FEATURE_KEY;
        if (bindingValue?.trackId === fallback.id && bindingValue.featureKey === nextFeature) {
            return;
        }
        onChange({
            type: 'audioFeature',
            trackId: fallback.id,
            featureKey: nextFeature,
            calculatorId: bindingValue?.calculatorId,
            bandIndex: bindingValue?.bandIndex ?? null,
            channelIndex: bindingValue?.channelIndex ?? null,
            smoothing: bindingValue?.smoothing ?? null,
        });
    }, [
        bindingValue?.bandIndex,
        bindingValue?.calculatorId,
        bindingValue?.channelIndex,
        bindingValue?.featureKey,
        bindingValue?.smoothing,
        bindingValue?.trackId,
        disabled,
        hasValidBinding,
        onChange,
        requiredFeatureKey,
        trackOptions,
    ]);

    const selectedTrackId = hasValidBinding ? bindingValue!.trackId : trackOptions[0]?.id ?? '';
    const selectedOption = selectedTrackId ? trackLookup.get(selectedTrackId) : undefined;
    const selectedSourceId = selectedOption?.sourceId ?? '';

    const status = useTimelineStore((state) =>
        selectedSourceId ? state.audioFeatureCacheStatus[selectedSourceId] : undefined,
    );

    const handleTrackChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const nextTrackId = event.target.value;
            if (!nextTrackId) {
                onChange(null);
                return;
            }
            const option = trackLookup.get(nextTrackId);
            if (!option) {
                return;
            }
            if (bindingValue?.trackId === option.id) {
                return;
            }
            const nextFeature = bindingValue?.featureKey ?? requiredFeatureKey ?? DEFAULT_FEATURE_KEY;
            onChange({
                type: 'audioFeature',
                trackId: option.id,
                featureKey: nextFeature,
                calculatorId: bindingValue?.calculatorId,
                bandIndex: bindingValue?.bandIndex ?? null,
                channelIndex: bindingValue?.channelIndex ?? null,
                smoothing: bindingValue?.smoothing ?? null,
            });
        },
        [
            bindingValue?.bandIndex,
            bindingValue?.calculatorId,
            bindingValue?.channelIndex,
            bindingValue?.featureKey,
            bindingValue?.smoothing,
            bindingValue?.trackId,
            onChange,
            requiredFeatureKey,
            trackLookup,
        ],
    );

    const statusLabel = status?.state ?? 'idle';
    const statusMessage = status?.message ? ` – ${status.message}` : '';

    return (
        <div className="audio-feature-binding" title={title} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor={`${id}-track`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Audio Track</span>
                <select
                    id={`${id}-track`}
                    value={selectedTrackId}
                    onChange={handleTrackChange}
                    disabled={disabled || !trackOptions.length}
                >
                    {trackOptions.length === 0 ? (
                        <option value="">No audio tracks available</option>
                    ) : (
                        trackOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.name}
                            </option>
                        ))
                    )}
                </select>
            </label>

            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                <strong>Status:</strong> {statusLabel}
                {statusMessage}
            </div>
        </div>
    );
};

export default AudioFeatureBindingInput;
