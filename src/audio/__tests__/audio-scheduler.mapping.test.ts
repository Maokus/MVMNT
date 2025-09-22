import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { AudioEngine } from '@audio/audio-engine';
import { TransportCoordinator } from '@audio/transport-coordinator';

// Helper to create a dummy AudioBuffer (mirrors existing AudioTrack tests)
function makeTestAudioBuffer(durationSeconds: number, sampleRate = 48000, channels = 1): AudioBuffer {
    const frameCount = Math.floor(durationSeconds * sampleRate);
    if (typeof AudioBuffer !== 'undefined') {
        try {
            // @ts-ignore
            return new AudioBuffer({ length: frameCount, numberOfChannels: channels, sampleRate });
        } catch {}
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

interface StartCall {
    when: number;
    offset: number;
    duration?: number;
}

class InstrumentedAudioContext {
    public currentTime = 0;
    public state: AudioContextState = 'running';
    public startCalls: Record<string, StartCall[]> = {};
    private idCounter = 0;
    resume = async () => {
        this.state = 'running';
    };
    createGain(): any {
        return { gain: { setValueAtTime: () => {}, setTargetAtTime: () => {} }, connect: () => {} };
    }
    get destination() {
        return {};
    }
    createBufferSource(): any {
        const id = `src_${this.idCounter++}`;
        const rec: StartCall[] = [];
        this.startCalls[id] = rec;
        return {
            id,
            buffer: null as any,
            connect: () => ({ connect: () => {} }),
            start: (when: number, offset: number, duration?: number) => {
                rec.push({ when, offset, duration });
            },
            stop: () => {},
            onended: null as any,
            disconnect: () => {},
        };
    }
}

describe('AudioEngine scheduling mapping', () => {
    it('computes correct buffer offset within trimmed region and reschedules on seek', async () => {
        const store = useTimelineStore.getState();
        const bpm = store.timeline.globalBpm; // default 120
        const ppq = 960;
        const ticksPerSecond = (bpm * ppq) / 60; // 1920
        const buffer = makeTestAudioBuffer(5); // 5 seconds (enough)
        const trackId = await store.addAudioTrack({ name: 'Clip', buffer, offsetTicks: 0 });
        // Ingestion is async; allow microtask flush
        await new Promise((r) => setTimeout(r, 0));
        // Region from 1s to 3s (2 seconds long)
        const regionStartTick = Math.round(1 * ticksPerSecond);
        const regionEndTick = Math.round(3 * ticksPerSecond);
        store.setTrackRegionTicks(trackId, regionStartTick, regionEndTick);

        const ctx = new InstrumentedAudioContext();
        const engine = new AudioEngine();
        (engine as any).ctx = ctx as any; // inject mock context
        const tc = new TransportCoordinator({ getAudioContext: () => ctx as any, audioEngine: engine });

        // Play from 1.5s into overall timeline -> 0.5s into region (region starts at 1s)
        const playFromTick = Math.round(1.5 * ticksPerSecond); // 1.5s
        tc.play(playFromTick);
        // Allow scheduling to run (playTick async ensureContext path)
        await new Promise((r) => setTimeout(r, 0));
        expect(Object.values(ctx.startCalls).length).toBeGreaterThan(0);
        const firstCall = Object.values(ctx.startCalls)[0][0];
        // Expected playback buffer offset = regionStartSeconds (1s) + 0.5s = 1.5s
        expect(firstCall.offset).toBeGreaterThanOrEqual(1.49);
        expect(firstCall.offset).toBeLessThanOrEqual(1.51);

        // Seek to 2.25s (1.25s into region) -> new offset = 1s + 1.25s = 2.25s
        const seekTick = Math.round(2.25 * ticksPerSecond);
        tc.seek(seekTick);
        // Engine should have restarted sources; capture latest start call
        const allCalls = Object.values(ctx.startCalls).flat();
        const lastCall = allCalls[allCalls.length - 1];
        expect(lastCall.offset).toBeGreaterThanOrEqual(2.24);
        expect(lastCall.offset).toBeLessThanOrEqual(2.26);
    });
});
