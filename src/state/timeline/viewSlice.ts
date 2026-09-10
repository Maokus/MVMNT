import type { TimelineState } from './storeTypes';
import { normalizePlaybackRange, normalizeTimelineRowHeight, normalizeTimelineView } from './viewState';

type ViewSlice = Pick<
    TimelineState,
    'setTimelineViewTicks' | 'setPlaybackRangeTicks' | 'setRowHeight' | '_setClipGroupDrag' | '_setCrossTrackDrag'
>;

type TimelineSet = (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void;

/** Creates view-only and transient drag actions without application wiring. */
export function createViewSlice(set: TimelineSet): ViewSlice {
    return {
        setTimelineViewTicks(startTick, endTick) {
            set(() => ({ timelineView: normalizeTimelineView(startTick, endTick) }));
        },
        setPlaybackRangeTicks(startTick, endTick) {
            set(() => ({ playbackRange: normalizePlaybackRange(startTick, endTick) }));
        },
        setRowHeight(rowHeight) {
            set(() => ({ rowHeight: normalizeTimelineRowHeight(rowHeight) }));
        },
        _setClipGroupDrag(drag) {
            set(() => ({ _clipGroupDrag: drag }));
        },
        _setCrossTrackDrag(drag) {
            set(() => ({ _crossTrackDrag: drag }));
        },
    };
}
