import type { TimelineState } from './storeTypes';
import { getSharedTimingManager } from './timelineShared';

export type TimelineStoreSnapshot = Pick<
    TimelineState,
    | 'timeline'
    | 'tracks'
    | 'tracksOrder'
    | 'transport'
    | 'timelineView'
    | 'playbackRange'
    | 'playbackRangeUserDefined'
    | 'midiCache'
    | 'audioCache'
    | 'audioFeatureCaches'
    | 'audioFeatureCacheStatus'
    | 'hybridCacheRollout'
    | 'tempoAlignedDiagnostics'
    | 'rowHeight'
    | 'midiPreviewTrackIds'
    | '_clipGroupDrag'
    | '_crossTrackDrag'
>;

/** Canonical data-only snapshot for rollback; Zustand action functions are never captured. */
export function createTimelineStoreSnapshot(state: TimelineState): TimelineStoreSnapshot {
    return {
        timeline: state.timeline,
        tracks: state.tracks,
        tracksOrder: state.tracksOrder,
        transport: state.transport,
        timelineView: state.timelineView,
        playbackRange: state.playbackRange,
        playbackRangeUserDefined: state.playbackRangeUserDefined,
        midiCache: state.midiCache,
        audioCache: state.audioCache,
        audioFeatureCaches: state.audioFeatureCaches,
        audioFeatureCacheStatus: state.audioFeatureCacheStatus,
        hybridCacheRollout: state.hybridCacheRollout,
        tempoAlignedDiagnostics: state.tempoAlignedDiagnostics,
        rowHeight: state.rowHeight,
        midiPreviewTrackIds: state.midiPreviewTrackIds,
        _clipGroupDrag: state._clipGroupDrag,
        _crossTrackDrag: state._crossTrackDrag,
    };
}

export function restoreTimelineStoreSnapshot(
    setState: (snapshot: TimelineStoreSnapshot) => void,
    snapshot: TimelineStoreSnapshot
): void {
    setState(snapshot);
    const manager = getSharedTimingManager();
    manager.setBPM(snapshot.timeline.globalBpm);
    manager.setTempoMap(snapshot.timeline.masterTempoMap?.length ? snapshot.timeline.masterTempoMap : null, 'seconds');
    manager.setBeatsPerBar(snapshot.timeline.beatsPerBar);
}

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
