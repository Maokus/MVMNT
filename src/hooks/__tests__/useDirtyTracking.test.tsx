import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDirtyTracking } from '../useDirtyTracking';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';

describe('document dirty tracking', () => {
    beforeEach(() => {
        useDocumentRevisionStore.getState().reset();
        useTimelineStore.setState((state) => ({
            timeline: {
                ...state.timeline,
                globalBpm: 120,
                beatsPerBar: 4,
                masterTempoMap: undefined,
                tempoAutomation: { enabled: false, keyframes: [] },
            },
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));
    });

    it('tracks authored timing and metadata commits from one revision authority', async () => {
        const { result } = renderHook(() => useDirtyTracking());
        act(() => result.current.markClean());
        expect(result.current.isDirty).toBe(false);

        await act(() => timelineCommandGateway.dispatchById('timeline.setGlobalBpm', { bpm: 132 }));
        expect(result.current.isDirty).toBe(true);
        expect(result.current.dirtyRevision).toBe(1);

        act(() => result.current.markClean());
        act(() => useSceneMetadataStore.getState().setAttribution('Based on Example'));
        expect(result.current.isDirty).toBe(true);
        expect(useSceneMetadataStore.getState().metadata.attribution).toBe('Based on Example');
    });

    it('does not mark derived cache or runtime-only changes as authored edits', () => {
        const { result } = renderHook(() => useDirtyTracking());
        act(() => result.current.markClean());

        act(() => {
            useTimelineStore.setState((state) => ({
                timeline: { ...state.timeline, currentTick: 42 },
                audioFeatureCaches: { ...state.audioFeatureCaches },
            }));
        });

        expect(result.current.isDirty).toBe(false);
        expect(result.current.dirtyRevision).toBe(0);
    });

    it('does not advance the revision for a no-op timing command', async () => {
        await timelineCommandGateway.dispatchById('timeline.setGlobalBpm', { bpm: 120 });
        expect(useDocumentRevisionStore.getState().revision).toBe(0);
    });
});
