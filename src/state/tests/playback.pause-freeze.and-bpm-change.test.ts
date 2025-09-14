import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../timelineStore';
import { getSharedTimingManager } from '../timelineStore';
import { createSharedPlaybackClock } from '@core/playback-clock';

// These tests validate that:
// 1. Pausing freezes tick advancement even if clock.update() is called (store does not advance when isPlaying=false)
// 2. BPM change mid-play immediately affects tick delta scaling (higher BPM -> more ticks per real second)

describe('Playback pause freeze & BPM change propagation', () => {
    beforeEach(() => {
        const tm = getSharedTimingManager();
        tm.setBPM(120);
        useTimelineStore.setState((s) => ({
            timeline: { ...s.timeline, currentTick: 0 },
            transport: { ...s.transport, isPlaying: false, state: 'paused', rate: 1 },
        }));
    });

    it('does not advance ticks while paused (internal clock frozen)', () => {
        const tm = getSharedTimingManager();
        const clock = createSharedPlaybackClock(0, 1);
        const startTick = useTimelineStore.getState().timeline.currentTick;
        // Simulate several updates while paused
        const base = performance.now();
        for (let i = 1; i <= 5; i++) {
            clock.update(base + i * 16); // 16ms frame
            // Not writing to store deliberately; VisualizerContext loop would skip due to isPlaying=false
        }
        const endTick = useTimelineStore.getState().timeline.currentTick;
        expect(endTick).toBe(startTick);
        // NEW behavior: internal clock also frozen while paused
        expect(clock.currentTick).toBe(startTick);
    });

    it('BPM change mid-play affects subsequent tick delta', () => {
        const tm = getSharedTimingManager();
        tm.setBPM(120);
        // Start playing
        useTimelineStore.setState((s) => ({ transport: { ...s.transport, isPlaying: true, state: 'playing' } }));
        const clock = createSharedPlaybackClock(0, 1);
        const base = performance.now();
        // Advance 500ms at 120 BPM
        clock.update(base); // init
        clock.update(base + 500);
        const tickAfter500ms120 = clock.currentTick;
        expect(tickAfter500ms120).toBeGreaterThan(0);
        // Change BPM to 240 (double) mid-play
        useTimelineStore.getState().setGlobalBpm(240);
        // The shared timing manager now has BPM 240
        const beforeSecondSpanTick = clock.currentTick;
        clock.update(base + 1000); // another 500ms elapsed (total 1000ms)
        const tickAfterAnother500ms = clock.currentTick;
        const deltaHigh = tickAfterAnother500ms - beforeSecondSpanTick;
        const deltaLow = tickAfter500ms120; // first span delta
        // With doubled BPM, tick advancement for equal wall time should approximately double
        expect(deltaHigh).toBeGreaterThan(deltaLow * 1.7); // allow tolerance (< perfect 2x due to approximation)
    });

    it('resume after pause excludes paused wall duration (no jump)', () => {
        const tm = getSharedTimingManager();
        tm.setBPM(120);
        // Start playing
        useTimelineStore.setState((s) => ({ transport: { ...s.transport, isPlaying: true, state: 'playing' } }));
        const clock = createSharedPlaybackClock(0, 1);
        const base = performance.now();
        clock.update(base); // init anchor
        clock.update(base + 100); // advance 100ms
        const beforePauseTick = clock.currentTick;
        // Pause
        clock.pause(base + 100);
        // Simulate large gap (e.g., user paused for 5s)
        clock.update(base + 5100); // should not advance
        expect(clock.currentTick).toBe(beforePauseTick);
        // Resume and advance one frame (16ms)
        clock.resume(base + 5100);
        clock.update(base + 5116);
        // Only a small advancement expected, certainly far less than if 5s had accumulated
        expect(clock.currentTick - beforePauseTick).toBeGreaterThanOrEqual(1); // at least some ticks
        expect(clock.currentTick - beforePauseTick).toBeLessThan(500); // arbitrary upper bound << 5s worth of ticks
    });
});
