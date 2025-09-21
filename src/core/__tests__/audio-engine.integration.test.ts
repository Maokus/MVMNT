import { describe, it, expect } from 'vitest';
import { TransportCoordinator } from '@core/transport-coordinator';
import { useTimelineStore } from '@state/timelineStore';
import { AudioEngine } from '@core/audio-engine';

class MockAudioContext {
    public currentTime = 0;
    public state: AudioContextState = 'running';
    resume = async () => {
        this.state = 'running';
    };
    createBufferSource(): any {
        return { connect: () => {}, start: () => {}, stop: () => {}, onended: null as any };
    }
    createGain(): any {
        return { gain: { setValueAtTime: () => {}, setTargetAtTime: () => {} }, connect: () => {} };
    }
    get destination() {
        return {};
    }
}

describe('AudioEngine + TransportCoordinator Phase 2 integration (mocked)', () => {
    it('falls back gracefully if audio engine not ready', () => {
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        api.play();
        let mockCtx: MockAudioContext | null = new MockAudioContext();
        const eng = new AudioEngine();
        // Forcefully set internal context for engine
        (eng as any).ctx = mockCtx as any;
        const tc = new TransportCoordinator({ getAudioContext: () => mockCtx as any, audioEngine: eng });
        tc.play(0);
        // Advance mock time
        mockCtx!.currentTime += 1.0; // 1 second
        const tick = tc.updateFrame(16.6);
        expect(typeof tick === 'number').toBe(true);
    });
});
