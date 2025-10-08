import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';

function makeTestAudioBuffer(durationSeconds: number, sampleRate = 8000, channels = 1): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
    if (typeof AudioBuffer !== 'undefined') {
        try {
            // @ts-ignore
            return new AudioBuffer({ length: frameCount, numberOfChannels: channels, sampleRate });
        } catch {
            /* fall through to mock */
        }
    }
    const channelData = Array.from({ length: channels }, () => new Float32Array(frameCount));
    return {
        duration: durationSeconds,
        sampleRate,
        numberOfChannels: channels,
        length: frameCount,
        getChannelData: (ch: number) => channelData[Math.min(ch, channelData.length - 1)],
        copyFromChannel: () => {},
        copyToChannel: () => {},
    } as unknown as AudioBuffer;
}

describe('timeline audio feature auto analysis', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                autoTrack: {
                    id: 'autoTrack',
                    name: 'Auto Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                },
            },
            tracksOrder: ['autoTrack'],
        }));
    });

    it('analyzes audio automatically after ingestion', async () => {
        const previous = process.env.MVMNT_ENABLE_AUDIO_AUTO_ANALYSIS;
        process.env.MVMNT_ENABLE_AUDIO_AUTO_ANALYSIS = 'true';
        const buffer = makeTestAudioBuffer(0.1);
        try {
            useTimelineStore.getState().ingestAudioToCache('autoTrack', buffer);
            const pending = useTimelineStore.getState().audioFeatureCacheStatus['autoTrack'];
            expect(pending?.state).toBe('pending');

            await new Promise<void>((resolve, reject) => {
                const start = Date.now();
                const check = () => {
                    const status = useTimelineStore.getState().audioFeatureCacheStatus['autoTrack'];
                    if (status?.state === 'ready') {
                        resolve();
                        return;
                    }
                    if (Date.now() - start > 7000) {
                        reject(new Error('analysis timeout'));
                        return;
                    }
                    setTimeout(check, 25);
                };
                check();
            });

            const cache = useTimelineStore.getState().audioFeatureCaches['autoTrack'];
            expect(cache).toBeTruthy();
            expect(cache?.frameCount).toBeGreaterThan(0);
        } finally {
            if (previous === undefined) {
                delete process.env.MVMNT_ENABLE_AUDIO_AUTO_ANALYSIS;
            } else {
                process.env.MVMNT_ENABLE_AUDIO_AUTO_ANALYSIS = previous;
            }
        }
    });
});
