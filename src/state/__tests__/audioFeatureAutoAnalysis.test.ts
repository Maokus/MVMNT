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

describe('timeline audio feature analysis scheduling', () => {
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

    it('does not analyze audio automatically after ingestion', async () => {
        const buffer = makeTestAudioBuffer(0.1);
        useTimelineStore.getState().ingestAudioToCache('autoTrack', buffer);
        const status = useTimelineStore.getState().audioFeatureCacheStatus['autoTrack'];
        expect(status?.state).toBe('idle');
        expect(status?.message).toBe('analysis not started');

        await new Promise((resolve) => setTimeout(resolve, 50));

        const cache = useTimelineStore.getState().audioFeatureCaches['autoTrack'];
        expect(cache).toBeUndefined();
    });
});
