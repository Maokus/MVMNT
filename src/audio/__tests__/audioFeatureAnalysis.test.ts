import { describe, expect, it } from 'vitest';
import {
    analyzeAudioBufferFeatures,
    deserializeAudioFeatureCache,
    serializeAudioFeatureCache,
} from '@audio/features/audioFeatureAnalysis';
import { buildFeatureTrackKey, DEFAULT_ANALYSIS_PROFILE_ID } from '@audio/features/featureTrackIdentity';
import { sharedAudioFeatureAnalysisScheduler } from '@audio/features/audioFeatureScheduler';
import { audioFeatureCalculatorRegistry, resetAudioFeatureCalculators } from '@audio/features/audioFeatureRegistry';
import { createTempoMapper } from '@core/timing';
import { getSharedTimingManager } from '@state/timelineStore';

function createSineBuffer(durationSeconds: number, sampleRate = 44100): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
    const frequency = 440;
    if (typeof AudioBuffer === 'function') {
        try {
            const buffer = new AudioBuffer({ length: frameCount, numberOfChannels: 1, sampleRate });
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < frameCount; i++) {
                channel[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
            }
            return buffer;
        } catch {}
    }
    const data = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
        data[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }
    return {
        length: frameCount,
        duration: durationSeconds,
        sampleRate,
        numberOfChannels: 1,
        copyFromChannel: () => {},
        copyToChannel: () => {},
        getChannelData: () => data,
    } as unknown as AudioBuffer;
}

describe('audio feature analysis', () => {
    it('produces spectrogram, rms, and waveform tracks with aligned metadata', async () => {
        const buffer = createSineBuffer(0.25);
        const { cache } = await analyzeAudioBufferFeatures({
            audioSourceId: 'analysis-test',
            audioBuffer: buffer,
            globalBpm: 120,
            beatsPerBar: 4,
        });
        const defaultProfile = cache.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID;
        const spectrogramKey = buildFeatureTrackKey('spectrogram', defaultProfile);
        const rmsKey = buildFeatureTrackKey('rms', defaultProfile);
        const waveformKey = buildFeatureTrackKey('waveform', defaultProfile);
        expect(cache.featureTracks[spectrogramKey]).toBeDefined();
        expect(cache.featureTracks[rmsKey]).toBeDefined();
        expect(cache.featureTracks[waveformKey]).toBeDefined();
        expect(cache.analysisParams.calculatorVersions['mvmnt.spectrogram']).toBe(3);
        expect(cache.hopTicks).toBeGreaterThan(0);
        expect(cache.version).toBe(3);
        expect(cache.startTimeSeconds).toBe(0);
        expect(cache.tempoProjection?.hopTicks).toBe(cache.hopTicks);
        const roundTrip = deserializeAudioFeatureCache(serializeAudioFeatureCache(cache));
        expect(roundTrip.version).toBe(3);
        expect(roundTrip.featureTracks[spectrogramKey]?.channels).toBe(cache.featureTracks[spectrogramKey]?.channels);
        const spectrogramTrack = cache.featureTracks[spectrogramKey]!;
        expect(spectrogramTrack.metadata?.minDecibels).toBe(-80);
        expect(spectrogramTrack.metadata?.maxDecibels).toBe(0);
        const values = Array.from((spectrogramTrack.data as Float32Array).slice(0, spectrogramTrack.channels));
        expect(values.every((value) => value >= -80 && value <= 0)).toBe(true);
    });

    it('aligns waveform hop ticks with hop seconds conversions', async () => {
        const buffer = createSineBuffer(0.3);
        const globalBpm = 128;
        const beatsPerBar = 4;
        const { cache } = await analyzeAudioBufferFeatures({
            audioSourceId: 'waveform-hop',
            audioBuffer: buffer,
            globalBpm,
            beatsPerBar,
        });
        const defaultProfile = cache.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID;
        const waveformKey = buildFeatureTrackKey('waveform', defaultProfile);
        const waveform = cache.featureTracks[waveformKey];
        expect(waveform).toBeDefined();
        if (!waveform) return;
        const tempoMapper = createTempoMapper({
            ticksPerQuarter: getSharedTimingManager().ticksPerQuarter,
            globalBpm,
            tempoMap: undefined,
        });
        const expectedTicks = Math.max(1, Math.round(tempoMapper.secondsToTicks(waveform.hopSeconds)));
        expect(waveform.hopTicks).toBe(expectedTicks);
        expect(waveform.tempoProjection?.hopTicks).toBe(expectedTicks);
    });

    it('propagates requested analysis profiles to feature tracks', async () => {
        const buffer = createSineBuffer(0.2);
        const requestedProfile = 'oddProfile';
        const { cache } = await analyzeAudioBufferFeatures({
            audioSourceId: 'profile-test',
            audioBuffer: buffer,
            globalBpm: 110,
            beatsPerBar: 4,
            analysisProfileId: requestedProfile,
        });
        const spectrogramKey = buildFeatureTrackKey('spectrogram', requestedProfile);
        const rmsKey = buildFeatureTrackKey('rms', requestedProfile);
        const waveformKey = buildFeatureTrackKey('waveform', requestedProfile);
        const spectrogram = cache.featureTracks[spectrogramKey];
        const rms = cache.featureTracks[rmsKey];
        const waveform = cache.featureTracks[waveformKey];
        expect(spectrogram?.analysisProfileId).toBe(requestedProfile);
        expect(rms?.analysisProfileId).toBe(requestedProfile);
        expect(waveform?.analysisProfileId).toBe(requestedProfile);
        expect(cache.defaultAnalysisProfileId).toBe(requestedProfile);
        expect(Object.keys(cache.analysisProfiles ?? {})).toContain(requestedProfile);
    });

    it('scheduler resolves queued jobs and supports cancellation', async () => {
        const buffer = createSineBuffer(0.2);
        const progress: Array<{ value: number; label?: string }> = [];
        const handle = sharedAudioFeatureAnalysisScheduler.schedule({
            jobId: 'sched-test',
            audioSourceId: 'sched-test',
            audioBuffer: buffer,
            globalBpm: 120,
            beatsPerBar: 4,
            onProgress: (value, label) => progress.push({ value, label }),
        });
        const cache = await handle.promise;
        const waveformKey = buildFeatureTrackKey(
            'waveform',
            cache.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID
        );
        expect(cache.featureTracks[waveformKey]).toBeDefined();
        expect(progress.length).toBeGreaterThan(1);
        const cancelHandle = sharedAudioFeatureAnalysisScheduler.schedule({
            jobId: 'cancel-test',
            audioSourceId: 'cancel-test',
            audioBuffer: buffer,
            globalBpm: 120,
            beatsPerBar: 4,
        });
        cancelHandle.cancel();
        await expect(cancelHandle.promise).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('supports registering custom calculators that participate in the shared cache', async () => {
        resetAudioFeatureCalculators();
        const calculatorId = 'test.zero-cross';
        try {
            audioFeatureCalculatorRegistry.register({
                id: calculatorId,
                version: 2,
                featureKey: 'zeroCrossing',
                label: 'Zero Crossing Rate',
                calculate: (context) => {
                    const values = new Float32Array(context.frameCount);
                    for (let frame = 0; frame < context.frameCount; frame++) {
                        values[frame] = frame / Math.max(1, context.frameCount - 1);
                    }
                    return {
                        key: 'zeroCrossing',
                        calculatorId,
                        version: 2,
                        frameCount: context.frameCount,
                        channels: 1,
                        hopTicks: context.hopTicks,
                        hopSeconds: context.hopSeconds,
                        startTimeSeconds: 0,
                        format: 'float32',
                        data: values,
                    };
                },
            });
            const buffer = createSineBuffer(0.15);
            const { cache } = await analyzeAudioBufferFeatures({
                audioSourceId: 'custom-feature',
                audioBuffer: buffer,
                globalBpm: 100,
                beatsPerBar: 4,
                calculators: [calculatorId],
            });
            const defaultProfile = cache.defaultAnalysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID;
            const zeroKey = buildFeatureTrackKey('zeroCrossing', defaultProfile);
            expect(cache.featureTracks[zeroKey]).toBeDefined();
            expect(cache.featureTracks[zeroKey]?.frameCount).toBe(cache.frameCount);
            expect(cache.featureTracks[zeroKey]?.hopTicks).toBe(cache.hopTicks);
        } finally {
            resetAudioFeatureCalculators();
        }
    });
});
