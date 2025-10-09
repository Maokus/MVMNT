import React, { useCallback, useEffect, useMemo } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';

type DescriptorValue = AudioFeatureDescriptor | null;

type DescriptorSchema = {
    requiredFeatureKey?: string;
    autoFeatureLabel?: string;
    trackId?: string | string[] | null;
};

interface AudioFeatureDescriptorInputProps {
    id: string;
    value: DescriptorValue;
    schema: DescriptorSchema;
    disabled?: boolean;
    title?: string;
    onChange: (value: DescriptorValue) => void;
}

type FeatureOption = {
    key: string;
    label: string;
    channels: number;
    format?: string;
    calculatorId?: string;
};

type TrackFeatureState = {
    options: FeatureOption[];
    featureTracks: Record<string, { calculatorId?: string; channels: number; format?: string }>;
    statusLabel: string;
    statusMessage?: string;
};

const clampSmoothing = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(64, Math.round(value)));
};

const normalizeTrackId = (trackId: DescriptorSchema['trackId']): string | null => {
    if (!trackId) return null;
    if (Array.isArray(trackId)) {
        return trackId.find((entry) => typeof entry === 'string' && entry.length > 0) ?? null;
    }
    return typeof trackId === 'string' && trackId.length > 0 ? trackId : null;
};

const AudioFeatureDescriptorInput: React.FC<AudioFeatureDescriptorInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange,
}) => {
    const trackId = normalizeTrackId(schema?.trackId);
    const trackKey = trackId ?? '';

    const { options, featureTracks, statusLabel, statusMessage } = useTimelineStore(
        useCallback((state): TrackFeatureState => {
            if (!trackId) {
                return { options: [], featureTracks: {}, statusLabel: 'unbound' };
            }
            const track = state.tracks[trackId];
            if (!track || track.type !== 'audio') {
                return { options: [], featureTracks: {}, statusLabel: 'unavailable' };
            }
            const sourceId = track.audioSourceId ?? track.id;
            const cache = state.audioFeatureCaches[sourceId];
            const status = state.audioFeatureCacheStatus[sourceId];
            const featureTracks = cache?.featureTracks ?? {};
            const options: FeatureOption[] = Object.values(featureTracks).map((feature) => ({
                key: feature.key,
                label: String((feature.metadata as Record<string, unknown> | undefined)?.label ?? feature.key),
                channels: Math.max(1, feature.channels || 1),
                format: feature.format,
                calculatorId: feature.calculatorId,
            }));
            options.sort((a, b) => a.label.localeCompare(b.label));
            return {
                options,
                featureTracks: Object.fromEntries(
                    Object.values(featureTracks).map((feature) => [feature.key, {
                        calculatorId: feature.calculatorId,
                        channels: Math.max(1, feature.channels || 1),
                        format: feature.format,
                    }]),
                ),
                statusLabel: status?.state ?? (cache ? 'ready' : 'idle'),
                statusMessage: status?.message,
            };
        }, [trackKey]),
    );

    const descriptor = value ?? null;
    const selectedFeatureKey = descriptor?.featureKey ?? null;
    const selectedFeature = selectedFeatureKey ? featureTracks[selectedFeatureKey] : undefined;
    const smoothingValue = descriptor?.smoothing ?? 0;
    const requiredFeatureKey = schema?.requiredFeatureKey;

    const ensureDescriptor = useCallback(
        (
            patch: Partial<AudioFeatureDescriptor> & { featureKey?: string },
            fallbackKey?: string | null,
        ) => {
            if (disabled) return;
            const nextKey = patch.featureKey ?? descriptor?.featureKey ?? fallbackKey ?? null;
            if (!nextKey) {
                onChange(null);
                return;
            }
            const trackInfo = featureTracks[nextKey];
            onChange({
                featureKey: nextKey,
                calculatorId: trackInfo?.calculatorId ?? descriptor?.calculatorId ?? null,
                bandIndex: patch.bandIndex ?? descriptor?.bandIndex ?? null,
                channelIndex: patch.channelIndex ?? descriptor?.channelIndex ?? null,
                smoothing: patch.smoothing ?? descriptor?.smoothing ?? 0,
            });
        },
        [descriptor, disabled, featureTracks, onChange],
    );

    useEffect(() => {
        if (disabled) return;
        if (!trackId) {
            if (descriptor) onChange(null);
            return;
        }
        if (!options.length) {
            if (descriptor) onChange(null);
            return;
        }
        const preferredKey =
            (requiredFeatureKey && featureTracks[requiredFeatureKey] ? requiredFeatureKey : null) ??
            (descriptor && featureTracks[descriptor.featureKey] ? descriptor.featureKey : null) ??
            options[0]?.key ??
            null;
        if (!preferredKey) {
            if (descriptor) onChange(null);
            return;
        }
        if (!descriptor || descriptor.featureKey !== preferredKey) {
            ensureDescriptor({ featureKey: preferredKey }, preferredKey);
        } else if (!descriptor.calculatorId) {
            ensureDescriptor({ featureKey: preferredKey }, preferredKey);
        }
    }, [
        disabled,
        trackId,
        descriptor,
        options,
        featureTracks,
        requiredFeatureKey,
        ensureDescriptor,
        onChange,
    ]);

    const channelOptions = useMemo(() => {
        if (!selectedFeature) return [];
        const channels = Math.max(1, selectedFeature.channels);
        if (channels <= 1) return [];
        const opts = [{ value: 'auto', label: 'Auto (mix)' }];
        for (let index = 0; index < channels; index += 1) {
            opts.push({ value: String(index), label: `Channel ${index + 1}` });
        }
        return opts;
    }, [selectedFeature]);

    const handleFeatureChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextKey = event.target.value || null;
        if (!nextKey) {
            onChange(null);
            return;
        }
        ensureDescriptor({ featureKey: nextKey }, nextKey);
    };

    const handleSmoothingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = clampSmoothing(Number(event.target.value));
        ensureDescriptor({ smoothing: next });
    };

    const handleChannelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        ensureDescriptor({ channelIndex: value === 'auto' ? null : Number(value) });
    };

    const smoothingDisplay = clampSmoothing(smoothingValue);
    const featureLabel = useMemo(() => {
        if (!selectedFeatureKey) return 'Select feature';
        const option = options.find((opt) => opt.key === selectedFeatureKey);
        if (option) return option.label;
        if (requiredFeatureKey === selectedFeatureKey && schema?.autoFeatureLabel) {
            return schema.autoFeatureLabel;
        }
        return selectedFeatureKey;
    }, [options, requiredFeatureKey, schema?.autoFeatureLabel, selectedFeatureKey]);

    const disableInputs = disabled || !trackId || !options.length;

    return (
        <div
            className="audio-feature-descriptor"
            title={title}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor={`${id}-feature`}>Feature</label>
                <select
                    id={`${id}-feature`}
                    value={selectedFeatureKey ?? ''}
                    onChange={handleFeatureChange}
                    disabled={disableInputs || Boolean(requiredFeatureKey)}
                >
                    {!options.length && <option value="">No analyzed features</option>}
                    {options.map((option) => (
                        <option key={option.key} value={option.key}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {requiredFeatureKey && (
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        {schema?.autoFeatureLabel ?? featureLabel}
                    </span>
                )}
            </div>

            <label htmlFor={`${id}-smoothing`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Smoothing (frames): {smoothingDisplay}</span>
                <input
                    id={`${id}-smoothing`}
                    type="range"
                    min={0}
                    max={64}
                    step={1}
                    value={smoothingDisplay}
                    onChange={handleSmoothingChange}
                    disabled={disableInputs}
                />
            </label>

            {channelOptions.length > 0 && (
                <label htmlFor={`${id}-channel`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Channel</span>
                    <select
                        id={`${id}-channel`}
                        value={descriptor?.channelIndex != null ? String(descriptor.channelIndex) : 'auto'}
                        onChange={handleChannelChange}
                        disabled={disableInputs}
                    >
                        {channelOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                <strong>{`Status: ${statusLabel || 'idle'}`}</strong>
                {statusMessage ? ` – ${statusMessage}` : ''}
            </div>
            {!trackId && (
                <div style={{ fontSize: '12px', color: '#fbbf24' }}>
                    Select an audio track to configure feature options.
                </div>
            )}
        </div>
    );
};

export default AudioFeatureDescriptorInput;
