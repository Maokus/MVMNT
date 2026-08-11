import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';

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

describe('Audio Track', () => {
    it('adds an audio track with immutable source duration metadata', async () => {
        const buffer = makeTestAudioBuffer(2.5); // 2.5 seconds
        const id = await useTimelineStore.getState().addAudioTrack({ name: 'Audio One', buffer });
        // Ingest happens async microtask; give it a tick
        await new Promise((r) => setTimeout(r, 0));
        const s = useTimelineStore.getState();
        const cache = s.audioCache[id];
        expect(cache).toBeTruthy();
        expect(cache.durationSeconds).toBeCloseTo(2.5);
        const track = s.tracks[id] as any;
        expect(track.type).toBe('audio');
        expect(track.gain).toBe(1);
    });

    it('keeps an imported file name on its clip while using the supplied numbered track name', async () => {
        const id = await useTimelineStore
            .getState()
            .addAudioTrack({ name: 'Audio Track 1', clipName: 'intro mix.wav', buffer: makeTestAudioBuffer(1) });

        const track = useTimelineStore.getState().tracks[id] as any;
        expect(track.name).toBe('Audio Track 1');
        expect(track.clips[0].name).toBe('intro mix.wav');
    });

    it('updates gain via setTrackGain', async () => {
        const buffer = makeTestAudioBuffer(1.0);
        const id = await useTimelineStore.getState().addAudioTrack({ name: 'Gain Track', buffer });
        await new Promise((r) => setTimeout(r, 0));
        await useTimelineStore.getState().setTrackGain(id, 1.75);
        const track = useTimelineStore.getState().tracks[id] as any;
        expect(track.gain).toBeCloseTo(1.75, 5);
    });
});
