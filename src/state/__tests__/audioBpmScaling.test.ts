import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { sharedTimingManager } from '@state/timelineStore';

function makeTestAudioBuffer(durationSeconds: number, sampleRate = 48000, channels = 1): AudioBuffer {
    const frameCount = Math.floor(durationSeconds * sampleRate);
    if (typeof AudioBuffer !== 'undefined') {
        try {
            // @ts-ignore
            return new AudioBuffer({ length: frameCount, numberOfChannels: channels, sampleRate });
        } catch {
            /* fallthrough */
        }
    }
    const data = Array.from({ length: channels }, () => new Float32Array(frameCount));
    return {
        duration: durationSeconds,
        sampleRate,
        numberOfChannels: channels,
        length: frameCount,
        getChannelData: (ch: number) => data[ch],
        copyFromChannel: () => {},
        copyToChannel: () => {},
    } as unknown as AudioBuffer;
}

describe('Audio BPM scaling', () => {
    it('recomputes durationTicks when BPM changes', async () => {
        const initialBpm = useTimelineStore.getState().timeline.globalBpm;
        const ppq = sharedTimingManager.ticksPerQuarter;
        const buffer = makeTestAudioBuffer(3.0);
        const id = await useTimelineStore.getState().addAudioTrack({ name: 'Tempo Clip', buffer });
        await new Promise((r) => setTimeout(r, 0));
        const st1 = useTimelineStore.getState();
        const cache1 = st1.audioCache[id];
        const expected1 = Math.round((buffer.duration * (initialBpm * ppq)) / 60);
        expect(cache1.durationTicks).toBe(expected1);

        // Double BPM -> durationTicks should double (more ticks per real second)
        const newBpm = initialBpm * 2;
        useTimelineStore.getState().setGlobalBpm(newBpm);
        const st2 = useTimelineStore.getState();
        const cache2 = st2.audioCache[id];
        const expected2 = Math.round((buffer.duration * (newBpm * ppq)) / 60);
        expect(cache2.durationTicks).toBe(expected2);

        // Half BPM -> durationTicks should halve relative to original if we go back
        useTimelineStore.getState().setGlobalBpm(initialBpm / 2);
        const st3 = useTimelineStore.getState();
        const cache3 = st3.audioCache[id];
        const expected3 = Math.round((buffer.duration * ((initialBpm / 2) * ppq)) / 60);
        expect(cache3.durationTicks).toBe(expected3);
    });
});
