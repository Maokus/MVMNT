import { describe, expect, it } from 'vitest';
import {
    analyzeAudioBufferFeatures,
    deserializeAudioFeatureCache,
    serializeAudioFeatureCache,
} from '@audio/features/audioFeatureAnalysis';
import { sharedAudioFeatureAnalysisScheduler } from '@audio/features/audioFeatureScheduler';
import {
    audioFeatureCalculatorRegistry,
    resetAudioFeatureCalculators,
} from '@audio/features/audioFeatureRegistry';

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
        expect(cache.featureTracks.spectrogram).toBeDefined();
        expect(cache.featureTracks.rms).toBeDefined();
        expect(cache.featureTracks.waveform).toBeDefined();
        expect(cache.analysisParams.calculatorVersions['mvmnt.spectrogram']).toBe(2);
        expect(cache.hopTicks).toBeGreaterThan(0);
        const roundTrip = deserializeAudioFeatureCache(serializeAudioFeatureCache(cache));
        expect(roundTrip.featureTracks.spectrogram.channels).toBe(
            cache.featureTracks.spectrogram.channels,
        );
        const spectrogramTrack = cache.featureTracks.spectrogram;
        expect(spectrogramTrack.metadata?.minDecibels).toBe(-80);
        expect(spectrogramTrack.metadata?.maxDecibels).toBe(0);
        const values = Array.from((spectrogramTrack.data as Float32Array).slice(0, spectrogramTrack.channels));
        expect(values.every((value) => value >= -80 && value <= 0)).toBe(true);
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
        expect(cache.featureTracks.waveform).toBeDefined();
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
            expect(cache.featureTracks.zeroCrossing).toBeDefined();
            expect(cache.featureTracks.zeroCrossing?.frameCount).toBe(cache.frameCount);
            expect(cache.featureTracks.zeroCrossing?.hopTicks).toBe(cache.hopTicks);
        } finally {
            resetAudioFeatureCalculators();
        }
    });
});
