import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { AudioEngine } from '@core/audio-engine';
import { TransportCoordinator } from '@core/transport-coordinator';

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

class InstrumentedAudioContextDelayed {
    public currentTime = 0;
    public state: AudioContextState = 'running';
    public startCalls: StartCall[] = [];
    resume = async () => {
        this.state = 'running';
    };
    advance(dt: number) {
        this.currentTime += dt;
    }
    createGain(): any {
        return {
            gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
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

describe('AudioEngine future start scheduling', () => {
    it('delays playback when starting before region', async () => {
        const store = useTimelineStore.getState();
        const bpm = store.timeline.globalBpm; // default 120
        const ppq = 960;
        const ticksPerSecond = (bpm * ppq) / 60; // 1920
        const buffer = makeTestAudioBuffer(10);
        const clipOffsetBeats = 4; // clip starts at bar 3 (assuming 4/4) ~ 4 beats example; using beats for clarity
        const clipOffsetTicks = clipOffsetBeats * ppq;
        const trackId = await store.addAudioTrack({ name: 'Clip', buffer, offsetTicks: clipOffsetTicks });
        await new Promise((r) => setTimeout(r, 0)); // allow ingestion

        // Region is entire buffer implicitly; ensure no custom region limits
        const ctx = new InstrumentedAudioContextDelayed();
        const engine = new AudioEngine();
        (engine as any).ctx = ctx as any;
        const tc = new TransportCoordinator({ getAudioContext: () => ctx as any, audioEngine: engine });

        // Start 2 beats BEFORE clip offset
        const startTick = clipOffsetTicks - 2 * ppq; // before clip begins
        tc.play(startTick);
        await new Promise((r) => setTimeout(r, 0));

        expect(ctx.startCalls.length).toBe(1);
        const call = ctx.startCalls[0];
        // Expect scheduled in future (> currentTime by roughly 2 beats duration)
        const expectedDelaySeconds = (2 * ppq) / ticksPerSecond; // seconds for 2 beats
        expect(call.when).toBeGreaterThan(0); // scheduled (future or now)
        // Because currentTime was 0, when should equal delaySeconds (allow small float error)
        expect(call.when).toBeGreaterThanOrEqual(expectedDelaySeconds - 0.005);
        expect(call.when).toBeLessThanOrEqual(expectedDelaySeconds + 0.005);
        // Offset into buffer should be 0 because region starts at buffer start (track offset only affects timeline alignment).
        expect(call.offset).toBeGreaterThanOrEqual(-0.001);
        expect(call.offset).toBeLessThanOrEqual(0.005);
    });
});
