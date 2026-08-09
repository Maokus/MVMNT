import { beatsToTicks, secondsToTicks } from '../timelineTime';
import { DEFAULT_TIMING_CONTEXT } from './timelineShared';
import type { TimelineState } from './storeTypes';

export function createInitialTimelineSlice(): Pick<
    TimelineState,
    | 'timeline'
    | 'tracks'
    | 'tracksOrder'
    | 'transport'
    | 'midiCache'
    | 'audioCache'
    | 'audioFeatureCaches'
    | 'audioFeatureCacheStatus'
    | 'timelineView'
    | 'playbackRange'
    | 'playbackRangeUserDefined'
    | 'rowHeight'
    | 'midiPreviewTrackIds'
    | 'hybridCacheRollout'
    | 'tempoAlignedDiagnostics'
    | '_clipGroupDrag'
    | '_crossTrackDrag'
> {
    return {
        timeline: {
            id: 'tl_1',
            name: 'Main Timeline',
            currentTick: 0,
            globalBpm: 120,
            beatsPerBar: 4,
            playheadAuthority: 'tick',
            tempoAutomation: {
                enabled: false,
                keyframes: [],
            },
        },
        tracks: {},
        tracksOrder: [],
        audioCache: {},
        audioFeatureCaches: {},
        audioFeatureCacheStatus: {},
        transport: {
            state: 'idle',
            isPlaying: false,
            loopEnabled: false,
            rate: 1.0,
            // Quantize enabled by default (bar snapping)
            quantize: 'bar',
            adaptiveSnap: true,
            arbitrarySnapN: 8,
            autoKeying: false,
            loopStartTick: Math.round(secondsToTicks(DEFAULT_TIMING_CONTEXT, 2)),
            loopEndTick: Math.round(secondsToTicks(DEFAULT_TIMING_CONTEXT, 5)),
        },
        _clipGroupDrag: null,
        _crossTrackDrag: null,
        midiCache: {},
        timelineView: { startTick: 0, endTick: Math.round(beatsToTicks(DEFAULT_TIMING_CONTEXT, 120)) },
        playbackRange: undefined,
        playbackRangeUserDefined: false,
        rowHeight: 64,
        midiPreviewTrackIds: {},
        hybridCacheRollout: {
            adapterEnabled: true,
            fallbackLog: [],
        },
        tempoAlignedDiagnostics: {},
    };
}
