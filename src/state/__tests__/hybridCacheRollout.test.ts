import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TempoAlignedAdapterDiagnostics } from '@audio/features/tempoAlignedViewAdapter';
import { useTimelineStore } from '@state/timelineStore';

describe('hybrid cache rollout state', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-02-24T00:00:00Z'));
        useTimelineStore.getState().resetTimeline();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('toggles the adapter flag and logs disable reasons', () => {
        const store = useTimelineStore.getState();
        store.setHybridCacheAdapterEnabled(false, 'maintenance-window');
        let state = useTimelineStore.getState();
        expect(state.hybridCacheRollout.adapterEnabled).toBe(false);
        expect(state.hybridCacheRollout.fallbackLog).toHaveLength(1);
        expect(state.hybridCacheRollout.fallbackLog[0]).toMatchObject({
            trackId: '__system__',
            featureKey: '__toggle__',
            reason: 'maintenance-window',
        });

        store.setHybridCacheAdapterEnabled(true);
        state = useTimelineStore.getState();
        expect(state.hybridCacheRollout.adapterEnabled).toBe(true);
        expect(state.hybridCacheRollout.fallbackLog).toHaveLength(1);
    });

    it('bounds the fallback log length and preserves the newest events', () => {
        const store = useTimelineStore.getState();
        for (let index = 0; index < 60; index += 1) {
            store.recordHybridCacheFallback({
                trackId: `track-${index}`,
                featureKey: 'rms',
                reason: `fallback-${index}`,
            });
            vi.advanceTimersByTime(1);
        }
        const state = useTimelineStore.getState();
        expect(state.hybridCacheRollout.fallbackLog.length).toBe(50);
        const firstEntry = state.hybridCacheRollout.fallbackLog[0];
        const lastEntry = state.hybridCacheRollout.fallbackLog[49];
        expect(firstEntry.trackId).toBe('track-10');
        expect(firstEntry.reason).toBe('fallback-10');
        expect(lastEntry.trackId).toBe('track-59');
        expect(lastEntry.reason).toBe('fallback-59');
    });

    it('stores tempo-aligned diagnostics and supports clearing them', () => {
        const diagnostics: TempoAlignedAdapterDiagnostics = {
            trackId: 'audioTrack',
            sourceId: 'audioTrack',
            featureKey: 'rms',
            cacheHit: true,
            interpolation: 'linear',
            mapperDurationNs: 2500,
            frameCount: 1,
            requestStartTick: 120,
            timestamp: Date.now(),
        };
        const store = useTimelineStore.getState();
        store.recordTempoAlignedDiagnostics('audioTrack', diagnostics);
        let state = useTimelineStore.getState();
        expect(state.tempoAlignedDiagnostics.audioTrack).toEqual(diagnostics);

        const updatedDiagnostics = { ...diagnostics, mapperDurationNs: 5000 };
        store.recordTempoAlignedDiagnostics('audioTrack', updatedDiagnostics);
        state = useTimelineStore.getState();
        expect(state.tempoAlignedDiagnostics.audioTrack).toEqual(updatedDiagnostics);

        store.clearTempoAlignedDiagnostics('audioTrack');
        state = useTimelineStore.getState();
        expect(state.tempoAlignedDiagnostics.audioTrack).toBeUndefined();

        store.recordTempoAlignedDiagnostics('audioTrack', diagnostics);
        store.clearTempoAlignedDiagnostics();
        state = useTimelineStore.getState();
        expect(state.tempoAlignedDiagnostics).toEqual({});
    });
});
