import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioTrack } from '@audio/audioTypes';
import { useTimelineStore } from '@state/timelineStore';
import {
    sampleAudioFeatureRange,
    useAudioFeatureStatus,
    useAudioFeatureTrack,
} from '@state/selectors/audioFeatureSelectors';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { sharedAudioFeatureAnalysisScheduler } from '@audio/features/audioFeatureScheduler';

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
    offsetTicks: number;
    regionStartTick: number;
    regionEndTick?: number;
}

const NUMBER_EPSILON = 1e-6;

function resolveDefaultFeature(cache: any | undefined, preferredFeatureKey?: string | null): string {
    if (preferredFeatureKey) {
        return preferredFeatureKey;
    }
    const keys = cache ? Object.keys(cache.featureTracks ?? {}) : [];
    if (!keys.length) {
        return 'rms';
    }
    if (keys.includes('rms')) return 'rms';
    return keys[0];
}

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
    const autoFeatureLabel = (schema?.autoFeatureLabel as string | undefined) ?? null;

    const trackOptions = useTimelineStore(
        useCallback((state) => {
            return state.tracksOrder
                .map((trackId) => state.tracks[trackId])
                .filter((track): track is AudioTrack => Boolean(track) && track.type === 'audio')
                .map<TrackOption>((track) => ({
                    id: track.id,
                    name: track.name ?? track.id,
                    sourceId: track.audioSourceId ?? track.id,
                    offsetTicks: track.offsetTicks ?? 0,
                    regionStartTick: track.regionStartTick ?? 0,
                    regionEndTick: track.regionEndTick ?? undefined,
                }));
        }, []),
    );

    const trackLookup = useMemo(() => new Map(trackOptions.map((opt) => [opt.id, opt])), [trackOptions]);

    const selectedTrack = useMemo<TrackOption | null>(() => {
        if (!trackOptions.length) return null;
        if (bindingValue?.trackId) {
            const match = trackLookup.get(bindingValue.trackId);
            if (match) return match;
        }
        return trackOptions[0] ?? null;
    }, [bindingValue?.trackId, trackLookup, trackOptions]);

    const sourceId = selectedTrack?.sourceId ?? null;

    const status = useAudioFeatureStatus(sourceId ?? '');

    const featureCache = useTimelineStore((state) => (sourceId ? state.audioFeatureCaches[sourceId] : undefined));

    const featureOptions = useMemo(() => {
        if (!featureCache) return [] as string[];
        return Object.keys(featureCache.featureTracks ?? {});
    }, [featureCache]);

    const selectedFeatureKey = useMemo(() => {
        if (requiredFeatureKey) {
            return requiredFeatureKey;
        }
        if (bindingValue?.featureKey) {
            if (!featureOptions.length || featureOptions.includes(bindingValue.featureKey)) {
                return bindingValue.featureKey;
            }
        }
        return resolveDefaultFeature(featureCache, null);
    }, [bindingValue?.featureKey, featureCache, featureOptions, requiredFeatureKey]);

    const featureTrack = useAudioFeatureTrack(sourceId ?? '', selectedFeatureKey);

    const [isAnalyzing, setAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    useEffect(() => {
        if (disabled) return;
        if (!selectedTrack) return;
        const desiredFeature = resolveDefaultFeature(featureCache, requiredFeatureKey);
        const keepExistingChannels = bindingValue?.trackId === selectedTrack.id;
        if (
            !bindingValue ||
            bindingValue.trackId !== selectedTrack.id ||
            bindingValue.featureKey !== desiredFeature
        ) {
            const trackEntry = featureCache?.featureTracks?.[desiredFeature];
            onChange({
                type: 'audioFeature',
                trackId: selectedTrack.id,
                featureKey: desiredFeature,
                calculatorId: trackEntry?.calculatorId ?? bindingValue?.calculatorId,
                bandIndex: keepExistingChannels ? bindingValue?.bandIndex ?? null : null,
                channelIndex: keepExistingChannels ? bindingValue?.channelIndex ?? null : null,
                smoothing: bindingValue?.smoothing ?? null,
            });
        }
    }, [bindingValue, disabled, featureCache, onChange, requiredFeatureKey, selectedTrack]);

    const emitChange = useCallback(
        (patch: Partial<Omit<AudioFeatureBindingValue, 'type'>>) => {
            const baseTrackId = patch.trackId ?? bindingValue?.trackId ?? selectedTrack?.id;
            const trackInfo = baseTrackId ? trackLookup.get(baseTrackId) : undefined;
            if (!trackInfo) {
                return;
            }
            const state = useTimelineStore.getState();
            const cache = state.audioFeatureCaches[trackInfo.sourceId];
            const availableFeatures = cache ? Object.keys(cache.featureTracks ?? {}) : [];
            const nextFeatureKeyCandidate =
                patch.featureKey ??
                bindingValue?.featureKey ??
                resolveDefaultFeature(cache, requiredFeatureKey);
            let resolvedFeatureKey: string;
            if (requiredFeatureKey) {
                resolvedFeatureKey = requiredFeatureKey;
            } else if (availableFeatures.length) {
                resolvedFeatureKey = availableFeatures.includes(nextFeatureKeyCandidate)
                    ? nextFeatureKeyCandidate
                    : availableFeatures.includes('rms')
                    ? 'rms'
                    : availableFeatures[0];
            } else {
                resolvedFeatureKey = nextFeatureKeyCandidate;
            }
            const trackEntry = cache?.featureTracks?.[resolvedFeatureKey];
            const nextBandIndex =
                patch.bandIndex !== undefined ? patch.bandIndex : bindingValue?.bandIndex ?? null;
            const nextChannelIndex =
                patch.channelIndex !== undefined ? patch.channelIndex : bindingValue?.channelIndex ?? null;
            const nextSmoothing =
                patch.smoothing !== undefined ? patch.smoothing : bindingValue?.smoothing ?? null;
            const resolvedTrackId = trackInfo.id;
            onChange({
                type: 'audioFeature',
                trackId: resolvedTrackId,
                featureKey: resolvedFeatureKey,
                calculatorId: patch.calculatorId ?? trackEntry?.calculatorId ?? bindingValue?.calculatorId,
                bandIndex: nextBandIndex,
                channelIndex: nextChannelIndex,
                smoothing: nextSmoothing,
            });
        },
        [bindingValue, onChange, requiredFeatureKey, selectedTrack, trackLookup],
    );

    const handleTrackChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const nextTrackId = event.target.value;
            emitChange({ trackId: nextTrackId, bandIndex: null, channelIndex: null });
        },
        [emitChange],
    );

    const handleFeatureChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            emitChange({ featureKey: event.target.value });
        },
        [emitChange],
    );

    const handleBandChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const next = event.target.value;
            emitChange({ bandIndex: next === '' ? null : Number(next) });
        },
        [emitChange],
    );

    const handleSmoothingChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const raw = parseInt(event.target.value, 10);
            if (Number.isNaN(raw)) {
                emitChange({ smoothing: null });
            } else {
                emitChange({ smoothing: Math.max(0, raw) });
            }
        },
        [emitChange],
    );

    const previewData = useTimelineStore(
        useCallback(
            (state) => {
                if (!bindingValue?.trackId || !selectedFeatureKey || !selectedTrack) return null;
                const cache = state.audioFeatureCaches[selectedTrack.sourceId];
                if (!cache) return null;
                const totalTicks = cache.frameCount * cache.hopTicks;
                if (totalTicks <= 0) return null;
                const startTick = selectedTrack.offsetTicks;
                const endTick = startTick + totalTicks;
                const sample = sampleAudioFeatureRange(state, bindingValue.trackId, selectedFeatureKey, startTick, endTick, {
                    bandIndex: bindingValue.bandIndex ?? undefined,
                    channelIndex: bindingValue.channelIndex ?? undefined,
                });
                if (!sample) return null;
                const maxFrames = 256;
                if (sample.frameCount <= maxFrames) return sample;
                const stride = Math.ceil(sample.frameCount / maxFrames);
                const downsampled = new Float32Array(maxFrames * sample.channels);
                for (let i = 0; i < maxFrames; i += 1) {
                    const frameIndex = Math.min(sample.frameCount - 1, i * stride);
                    for (let c = 0; c < sample.channels; c += 1) {
                        downsampled[i * sample.channels + c] = sample.data[frameIndex * sample.channels + c];
                    }
                }
                return { ...sample, frameCount: maxFrames, data: downsampled };
            },
            [bindingValue?.bandIndex, bindingValue?.channelIndex, bindingValue?.trackId, selectedFeatureKey, selectedTrack],
        ),
    );

    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.clientWidth || 200;
        const height = canvas.clientHeight || 56;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, width, height);

        if (!previewData) {
            ctx.fillStyle = '#9CA3AF';
            ctx.font = '12px sans-serif';
            ctx.fillText('No preview', 8, height / 2);
            return;
        }

        const channels = previewData.channels;
        if (previewData.format === 'waveform-minmax' && channels >= 2) {
            ctx.strokeStyle = '#22D3EE';
            ctx.beginPath();
            const halfH = height / 2;
            for (let i = 0; i < previewData.frameCount; i += 1) {
                const min = previewData.data[i * channels] ?? 0;
                const max = previewData.data[i * channels + 1] ?? 0;
                const x = (i / Math.max(1, previewData.frameCount - 1)) * width;
                ctx.moveTo(x, halfH - max * halfH);
                ctx.lineTo(x, halfH - min * halfH);
            }
            ctx.stroke();
            return;
        }

        const values: number[] = [];
        for (let i = 0; i < previewData.frameCount; i += 1) {
            let sum = 0;
            for (let c = 0; c < channels; c += 1) {
                sum += previewData.data[i * channels + c] ?? 0;
            }
            values.push(sum / Math.max(1, channels));
        }
        let min = Math.min(...values);
        let max = Math.max(...values);
        if (Math.abs(max - min) < NUMBER_EPSILON) {
            max = min + 1;
        }
        ctx.strokeStyle = '#F472B6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        values.forEach((v, index) => {
            const norm = (v - min) / (max - min);
            const x = (index / Math.max(1, values.length - 1)) * width;
            const y = height - norm * height;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }, [previewData]);

    const calculators = useMemo(() => {
        const entries = audioFeatureCalculatorRegistry.list();
        const map = new Map<string, string>();
        for (const calc of entries) {
            map.set(calc.featureKey, calc.label ?? calc.featureKey);
        }
        return map;
    }, []);

    const handleAnalyze = useCallback(async () => {
        if (!selectedTrack || !sourceId) return;
        const state = useTimelineStore.getState();
        const cacheEntry = state.audioCache[sourceId];
        const audioBuffer = cacheEntry?.audioBuffer;
        if (!audioBuffer) {
            setAnalysisError('Audio buffer not available. Import audio before analyzing.');
            return;
        }
        setAnalysisError(null);
        setAnalyzing(true);
        state.setAudioFeatureCacheStatus(sourceId, 'pending', 'analysis requested');
        try {
            const handle = sharedAudioFeatureAnalysisScheduler.schedule({
                audioSourceId: sourceId,
                audioBuffer,
                globalBpm: state.timeline.globalBpm,
                beatsPerBar: state.timeline.beatsPerBar,
                tempoMap: state.timeline.masterTempoMap,
            });
            const cache = await handle.promise;
            useTimelineStore.getState().ingestAudioFeatureCache(sourceId, cache);
        } catch (error) {
            console.warn('Audio feature analysis failed', error);
            setAnalysisError('Analysis failed. Check console for details.');
            useTimelineStore.getState().setAudioFeatureCacheStatus(sourceId, 'failed', 'analysis failed');
        } finally {
            setAnalyzing(false);
        }
    }, [selectedTrack, sourceId]);

    const calculatorLabel = autoFeatureLabel ?? calculators.get(selectedFeatureKey) ?? selectedFeatureKey;

    return (
        <div className="audio-feature-binding" title={title} style={{ display: 'grid', gap: '8px' }}>
            <label htmlFor={`${id}-track`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Audio Track</span>
                <select
                    id={`${id}-track`}
                    value={bindingValue?.trackId ?? selectedTrack?.id ?? ''}
                    onChange={handleTrackChange}
                    disabled={disabled || !trackOptions.length}
                >
                    {trackOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                            {option.name}
                        </option>
                    ))}
                </select>
            </label>

            {!requiredFeatureKey ? (
                <label htmlFor={`${id}-feature`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Feature</span>
                    <select
                        id={`${id}-feature`}
                        value={selectedFeatureKey}
                        onChange={handleFeatureChange}
                        disabled={disabled || !trackOptions.length}
                    >
                        {featureOptions.length === 0 && <option value="rms">RMS (pending analysis)</option>}
                        {featureOptions.map((key) => (
                            <option key={key} value={key}>
                                {calculators.get(key) ?? key}
                            </option>
                        ))}
                    </select>
                </label>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Feature</span>
                    <div
                        style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            background: '#111827',
                            color: '#E5E7EB',
                            border: '1px solid #1F2937',
                        }}
                    >
                        {autoFeatureLabel ?? calculators.get(selectedFeatureKey) ?? selectedFeatureKey}
                    </div>
                </div>
            )}

            {featureTrack && featureTrack.channels > 1 && (
                <label htmlFor={`${id}-band`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Band</span>
                    <select
                        id={`${id}-band`}
                        value={bindingValue?.bandIndex ?? ''}
                        onChange={handleBandChange}
                        disabled={disabled}
                    >
                        <option value="">All bands</option>
                        {Array.from({ length: featureTrack.channels }).map((_, index) => (
                            <option key={index} value={index}>
                                Band {index + 1}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <label htmlFor={`${id}-smoothing`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Smoothing (frames)</span>
                <input
                    id={`${id}-smoothing`}
                    type="number"
                    min={0}
                    step={1}
                    value={bindingValue?.smoothing ?? 0}
                    onChange={handleSmoothingChange}
                    disabled={disabled}
                />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Preview</span>
                <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: '56px', borderRadius: '4px', background: '#111827' }}
                    data-track={bindingValue?.trackId ?? selectedTrack?.id ?? ''}
                />
            </div>

            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                <strong>Status:</strong>{' '}
                {status?.state ?? 'idle'}
                {status?.message ? ` – ${status.message}` : ''}
                {' · '}
                <span>Calculator: {calculatorLabel}</span>
            </div>

            {analysisError && <div style={{ color: '#F87171', fontSize: '12px' }}>{analysisError}</div>}

            <button
                type="button"
                onClick={handleAnalyze}
                disabled={disabled || isAnalyzing || !selectedTrack}
                style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid #2563EB',
                    background: isAnalyzing ? '#1D4ED8' : '#1E40AF',
                    color: '#FFFFFF',
                    cursor: disabled || isAnalyzing ? 'not-allowed' : 'pointer',
                }}
            >
                {isAnalyzing ? 'Analyzing…' : 'Generate / Refresh Analysis'}
            </button>
        </div>
    );
};

export default AudioFeatureBindingInput;
