/**
 * Timeline domain: direct API proxy, convenience shortcuts, and event types.
 *
 * @module @mvmnt/plugin-sdk/timeline
 */

// Direct capability proxy — throws descriptively if capability is missing
export { timelineApi } from '@core/scene/plugins/plugin-sdk-capabilities';

// Convenience shortcuts (return safe defaults when API unavailable)
export {
    selectNotes,
    selectAllNotes,
    selectDistinctNotes,
    selectNotesByPitch,
    getNoteRange,
    getTimelineDuration,
    getMidiTracks,
    groupNotesByPitch,
    selectCC,
    getSustainState,
} from '@core/scene/plugins/plugin-sdk-shortcuts';

// Event and timing types
export type { TimelineNoteEvent, TimelineCCEvent, TempoMapEntry } from '@core/timing/types';
