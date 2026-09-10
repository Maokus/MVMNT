import { createInitialTimelineSlice } from '../storeComposition';
import { createTransportSlice } from '../transportSlice';
import { createViewSlice } from '../viewSlice';
import type { TimelineState } from '../storeTypes';
import { describe, expect, it } from 'vitest';

describe('timeline capability slice creators', () => {
    it('constructs initial state without application startup wiring', () => {
        const slice = createInitialTimelineSlice();
        expect(slice.timeline).toMatchObject({ globalBpm: 120, beatsPerBar: 4 });
        expect(slice.transport).toMatchObject({ state: 'idle', isPlaying: false, rate: 1 });
        expect(slice.tracks).toEqual({});
        expect(slice.audioCache).toEqual({});
        expect(slice.timelineView.endTick).toBeGreaterThan(slice.timelineView.startTick);
    });

    it('constructs transport actions with explicit store dependencies', () => {
        let state = createInitialTimelineSlice() as TimelineState;
        const set = (updater: (current: TimelineState) => Partial<TimelineState> | TimelineState) => {
            state = { ...state, ...updater(state) };
        };
        const actions = createTransportSlice({
            set,
            get: () => state,
            markAllAudioFeatureStatuses: (status) => status,
        });
        state = { ...state, ...actions };

        actions.setCurrentTick(500, 'user');
        actions.pause();
        actions.togglePlay();

        expect(state.timeline.currentTick).toBe(500);
        expect(state.transport).toMatchObject({ isPlaying: true, state: 'playing' });
    });

    it('constructs view actions with explicit store dependencies', () => {
        let state = createInitialTimelineSlice() as TimelineState;
        const actions = createViewSlice((updater) => {
            state = { ...state, ...updater(state) };
        });

        actions.setTimelineViewTicks(200, 100);
        actions.setPlaybackRangeTicks(10, 20);
        actions.setRowHeight(1);

        expect(state.timelineView).toEqual({ startTick: 100, endTick: 200 });
        expect(state.playbackRangeUserDefined).toBe(false);
        expect(state.rowHeight).toBeGreaterThan(1);
    });
});
