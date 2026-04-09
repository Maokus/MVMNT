import { describe, it, expect, vi } from 'vitest';
import type { TimelineState } from '@state/timelineStore';
import {
    createPluginHostApi,
    installPluginHostApi,
    PLUGIN_API_VERSION,
    PLUGIN_CAPABILITIES,
} from '@core/scene/plugins/host-api/plugin-api';

function makeState(): TimelineState {
    return {
        timeline: {
            id: 'timeline-1',
            name: 'Main',
            currentTick: 0,
            globalBpm: 120,
            beatsPerBar: 4,
        },
        tracks: {
            'midi-1': {
                id: 'midi-1',
                name: 'MIDI 1',
                type: 'midi',
                enabled: true,
                mute: false,
                solo: false,
                offsetTicks: 0,
            },
        },
        tracksOrder: ['midi-1'],
        transport: {
            isPlaying: false,
            loopEnabled: false,
            rate: 1,
            quantize: '1/16',
        },
        selection: { selectedTrackIds: [] },
        timelineView: { startTick: 0, endTick: 1920 },
        playbackRangeUserDefined: false,
        midiCache: {},
        audioCache: {},
        audioFeatureCaches: {},
        audioFeatureCacheStatus: {},
        hybridCacheRollout: {
            adapterEnabled: false,
            fallbackLog: [],
        },
        tempoAlignedDiagnostics: {},
        rowHeight: 56,
        addMidiTrack: vi.fn(async () => 'midi-1'),
        addAudioTrack: vi.fn(async () => 'audio-1'),
        removeTrack: vi.fn(),
        removeTracks: vi.fn(),
        updateTrack: vi.fn(async () => undefined),
        setTrackOffsetTicks: vi.fn(async () => undefined),
        setTrackRegionTicks: vi.fn(async () => undefined),
        setTrackEnabled: vi.fn(async () => undefined),
        setTrackMute: vi.fn(async () => undefined),
        setTrackSolo: vi.fn(async () => undefined),
        setTrackGain: vi.fn(async () => undefined),
        setMasterTempoMap: vi.fn(),
        setGlobalBpm: vi.fn(),
        setBeatsPerBar: vi.fn(),
        setCurrentTick: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        togglePlay: vi.fn(),
        seekTick: vi.fn(),
        scrubTick: vi.fn(),
        setRate: vi.fn(),
        setQuantize: vi.fn(),
        setLoopEnabled: vi.fn(),
        setLoopRangeTicks: vi.fn(),
        toggleLoop: vi.fn(),
        reorderTracks: vi.fn(async () => undefined),
        setTimelineViewTicks: vi.fn(),
        selectTracks: vi.fn(),
        setPlaybackRangeTicks: vi.fn(),
        setPlaybackRangeExplicitTicks: vi.fn(),
        setRowHeight: vi.fn(),
        ingestMidiToCache: vi.fn(),
        ingestAudioToCache: vi.fn(),
        ingestAudioFeatureCache: vi.fn(),
        invalidateAudioFeatureCachesByCalculator: vi.fn(),
        setAudioFeatureCacheStatus: vi.fn(),
        stopAudioFeatureAnalysis: vi.fn(),
        restartAudioFeatureAnalysis: vi.fn(),
        reanalyzeAudioFeatureCalculators: vi.fn(),
        removeAudioFeatureTracks: vi.fn(),
        clearAudioFeatureCache: vi.fn(),
        clearAllTracks: vi.fn(),
        resetTimeline: vi.fn(),
        setHybridCacheAdapterEnabled: vi.fn(),
        recordHybridCacheFallback: vi.fn(),
        recordTempoAlignedDiagnostics: vi.fn(),
        clearTempoAlignedDiagnostics: vi.fn(),
    } as unknown as TimelineState;
}

describe('plugin host api', () => {
    it('creates v1 API with timeline/audio/timing wrappers on happy path', () => {
        const state = makeState();
        const timelineStore = { getState: vi.fn(() => state) };
        const selectNotesInWindow = vi.fn(() => [
            { note: 60, channel: 0, trackId: 'midi-1', startTime: 0, endTime: 1, duration: 1 },
        ]);
        const selectTrackById: (_s: TimelineState, _id: string | undefined | null) => any = vi.fn(
            (_s: TimelineState, _id: string | undefined | null) => state.tracks['midi-1'] as any
        );
        const selectTracksByIds: (_s: TimelineState, _ids: string[]) => any[] = vi.fn(
            (_s: TimelineState, _ids: string[]) => [state.tracks['midi-1'] as any]
        );
        const getFeatureData: (...args: any[]) => any = vi.fn(() => ({
            values: [0.5],
            metadata: {
                descriptor: { featureKey: 'rms' },
                frame: { values: [0.5] },
                channels: 1,
            },
        }));

        const { api, missingCapabilities } = createPluginHostApi({
            timelineStore,
            selectNotesInWindow,
            selectTrackById,
            selectTracksByIds,
            getFeatureData,
        });

        expect(api.apiVersion).toBe(PLUGIN_API_VERSION);
        expect(missingCapabilities).toEqual([]);
        expect(api.capabilities).toContain(PLUGIN_CAPABILITIES.timelineRead);
        expect(api.capabilities).toContain(PLUGIN_CAPABILITIES.audioFeaturesRead);

        const snapshot = api.timeline.getStateSnapshot();
        expect(snapshot).toBe(state);
        api.timeline.selectNotesInWindow({ trackIds: ['midi-1'], startSec: 0, endSec: 1 });
        expect(selectNotesInWindow).toHaveBeenCalled();
        expect(api.timeline.getTrackById('midi-1')).toEqual(state.tracks['midi-1']);

        const atTime = api.audio.sampleFeatureAtTime({ trackId: 'audio-1', feature: 'rms', time: 0.25 });
        expect(atTime?.values).toEqual([0.5]);
        const sampledRange = api.audio.sampleFeatureRange({
            trackId: 'audio-1',
            feature: 'rms',
            startTime: 0,
            endTime: 0.2,
            stepSec: 0.1,
        });
        expect(sampledRange).toHaveLength(3);
        expect(api.timing.beatsToTicks(2)).toBe(1920);
        expect(api.utilities.midiNoteToName(60)).toBe('C4');
    });

    it('reports missing capabilities and graceful fallbacks when deps are unavailable', () => {
        const warn = vi.fn();
        const target: { MVMNT?: Record<string, unknown> } = { MVMNT: { state: { existing: true } } };

        const api = installPluginHostApi({
            target,
            logger: { warn },
            deps: {
                timelineStore: null,
                selectNotesInWindow: null,
                selectTrackById: null,
                selectTracksByIds: null,
                getFeatureData: null,
            },
        });

        expect(api.timeline.getStateSnapshot()).toBeNull();
        expect(api.timeline.selectNotesInWindow({ trackIds: ['midi-1'], startSec: 0, endSec: 1 })).toEqual([]);
        expect(api.audio.sampleFeatureAtTime({ trackId: 'audio-1', feature: 'rms', time: 0 })).toBeNull();
        expect(api.audio.sampleFeatureRange({ trackId: 'audio-1', feature: 'rms', startTime: 0, endTime: 1, stepSec: 0.5 })).toEqual([]);
        expect(api.timing.secondsToTicks(1)).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(target.MVMNT?.plugins).toBe(api);
        expect(target.MVMNT?.state).toEqual({ existing: true });
    });
});
