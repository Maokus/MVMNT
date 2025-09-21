import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { sharedTimingManager } from '@state/timelineStore';

// Helper to create a dummy AudioBuffer (Web Audio API not fully available in test; use minimal polyfill)
function makeTestAudioBuffer(durationSeconds: number, sampleRate = 48000, channels = 1): AudioBuffer {
    // Vitest + jsdom may not implement AudioBuffer constructor; fall back to mock object shaped similarly.
    const frameCount = Math.floor(durationSeconds * sampleRate);
    if (typeof AudioBuffer !== 'undefined') {
        try {
            // @ts-ignore
            return new AudioBuffer({ length: frameCount, numberOfChannels: channels, sampleRate });
        } catch {
            // ignore and fallback
        }
    }
    // Fallback mock implementing used fields
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

describe('Audio Track Phase 1', () => {
    it('adds audio track and computes durationTicks', async () => {
        const bpm = useTimelineStore.getState().timeline.globalBpm;
        const ppq = sharedTimingManager.ticksPerQuarter;
        const ticksPerSecond = (bpm * ppq) / 60;
        const buffer = makeTestAudioBuffer(2.5); // 2.5 seconds
        const id = await useTimelineStore.getState().addAudioTrack({ name: 'Audio One', buffer });
        // Ingest happens async microtask; give it a tick
        await new Promise((r) => setTimeout(r, 0));
        const s = useTimelineStore.getState();
        const cache = s.audioCache[id];
        expect(cache).toBeTruthy();
        const expectedTicks = Math.round(2.5 * ticksPerSecond);
        expect(cache.durationTicks).toBe(expectedTicks);
        const track = s.tracks[id] as any;
        expect(track.type).toBe('audio');
        expect(track.gain).toBe(1);
    });

    it('updates gain via setTrackGain', async () => {
        const buffer = makeTestAudioBuffer(1.0);
        const id = await useTimelineStore.getState().addAudioTrack({ name: 'Gain Track', buffer });
        await new Promise((r) => setTimeout(r, 0));
        useTimelineStore.getState().setTrackGain(id, 1.75);
        const track = useTimelineStore.getState().tracks[id] as any;
        expect(track.gain).toBeCloseTo(1.75, 5);
    });
});
