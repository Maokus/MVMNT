import type { TimelineState } from './storeTypes';

export function createClearedTimelinePersistenceState(
    state: TimelineState
): Pick<
    TimelineState,
    | 'tracks'
    | 'tracksOrder'
    | 'midiCache'
    | 'audioCache'
    | 'audioFeatureCaches'
    | 'audioFeatureCacheStatus'
    | 'tempoAlignedDiagnostics'
    | 'midiPreviewTrackIds'
    | 'hybridCacheRollout'
> {
    return {
        tracks: {},
        tracksOrder: [],
        midiCache: {},
        audioCache: {},
        audioFeatureCaches: {},
        audioFeatureCacheStatus: {},
        tempoAlignedDiagnostics: {},
        midiPreviewTrackIds: {},
        hybridCacheRollout: { adapterEnabled: state.hybridCacheRollout.adapterEnabled, fallbackLog: [] },
    };
}
