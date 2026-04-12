import { describe, it, expect } from 'vitest';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import { AudioEngine } from '@audio/audio-engine';
import { TransportCoordinator } from '@audio/transport-coordinator';

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
    public startCalls: StartCall[] = [];
    resume = async () => {
        this.state = 'running';
    };
    createGain(): any {
        return {
            gain: {
                setValueAtTime: () => {},
                linearRampToValueAtTime: () => {},
                cancelScheduledValues: () => {},
                setTargetAtTime: () => {},
            },
            connect: () => ({ connect: () => {} }),
        };
    }
    get destination() {
        return {};
    }
    createBufferSource(): any {
        return {
            buffer: null as any,
            connect: () => ({ connect: () => {} }),
            start: (when: number, offset: number, duration?: number) => {
                this.startCalls.push({ when, offset, duration });
            },
            stop: () => {},
            onended: null as any,
            disconnect: () => {},
        };
    }
}

describe('AudioEngine with tempo map', () => {
    it('computes correct delay under variable tempo', async () => {
        const store = useTimelineStore.getState();
        const ppq = 960;

        // Set up tempo map: 120 BPM at t=0, 60 BPM at t=2s
        // At 120 BPM: 1 beat = 0.5s, so 2 seconds = 4 beats = 3840 ticks
        // At 60 BPM (after t=2s): 1 beat = 1.0s
        store.setMasterTempoMap([
            { time: 0, bpm: 120 },
            { time: 2, bpm: 60 },
        ]);

        const tm = getSharedTimingManager();

        // Place a clip at 6 beats (3840 + 2*960 = 5760 ticks)
        // First 4 beats at 120 BPM = 2.0s, then 2 beats at 60 BPM = 2.0s
        // So clip starts at 4.0s absolute
        const clipOffsetTicks = 6 * ppq; // 5760
        const clipStartSeconds = tm.ticksToSeconds(clipOffsetTicks);
        expect(clipStartSeconds).toBeCloseTo(4.0, 2);

        const buffer = makeTestAudioBuffer(5); // 5 second buffer
        const trackId = await store.addAudioTrack({ name: 'TempoClip', buffer, offsetTicks: clipOffsetTicks });
        await new Promise((r) => setTimeout(r, 0));

        const ctx = new InstrumentedAudioContext();
        const engine = new AudioEngine();
        (engine as any).ctx = ctx as any;
        const tc = new TransportCoordinator({ getAudioContext: () => ctx as any, audioEngine: engine });

        // Start playback from tick 0 (t=0s). Clip should be delayed until t=4.0s.
        tc.play(0);
        await new Promise((r) => setTimeout(r, 0));

        expect(ctx.startCalls.length).toBe(1);
        const call = ctx.startCalls[0];
        // With flat BPM (120), a naive calculation would give: 5760 / 1920 = 3.0s delay (WRONG)
        // With tempo map: 4 beats @ 0.5s + 2 beats @ 1.0s = 4.0s (CORRECT)
        expect(call.when).toBeCloseTo(4.0, 1);

        // Clean up
        store.removeTrack(trackId);
        store.setMasterTempoMap(undefined);
    });

    it('computes correct delay when starting mid-tempo-region', async () => {
        const store = useTimelineStore.getState();
        const ppq = 960;

        // 120 BPM at t=0 (0.5s/beat), 60 BPM at t=2s (1.0s/beat)
        store.setMasterTempoMap([
            { time: 0, bpm: 120 },
            { time: 2, bpm: 60 },
        ]);

        const tm = getSharedTimingManager();

        // Place clip at 8 beats = 7680 ticks
        // 4 beats @ 120BPM = 2.0s, then 4 beats @ 60BPM = 4.0s => clip starts at 6.0s
        const clipOffsetTicks = 8 * ppq;
        expect(tm.ticksToSeconds(clipOffsetTicks)).toBeCloseTo(6.0, 2);

        const buffer = makeTestAudioBuffer(3);
        const trackId = await store.addAudioTrack({ name: 'MidClip', buffer, offsetTicks: clipOffsetTicks });
        await new Promise((r) => setTimeout(r, 0));

        const ctx = new InstrumentedAudioContext();
        const engine = new AudioEngine();
        (engine as any).ctx = ctx as any;
        const tc = new TransportCoordinator({ getAudioContext: () => ctx as any, audioEngine: engine });

        // Start playback from 5 beats (4800 ticks) = 2.0s + 1 beat @ 60BPM = 3.0s
        const startTick = 5 * ppq;
        expect(tm.ticksToSeconds(startTick)).toBeCloseTo(3.0, 2);

        tc.play(startTick);
        await new Promise((r) => setTimeout(r, 0));

        expect(ctx.startCalls.length).toBe(1);
        // delay should be 6.0s - 3.0s = 3.0s
        expect(ctx.startCalls[0].when).toBeCloseTo(3.0, 1);

        // Clean up
        store.removeTrack(trackId);
        store.setMasterTempoMap(undefined);
    });
});
