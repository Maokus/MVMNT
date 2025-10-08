import { TimingManager } from '@core/timing';
import {
    createTimingContext,
    beatsToTicks,
    ticksToBeats,
    secondsToTicks as timingSecondsToTicks,
    type TimelineTimingContext,
} from '../timelineTime';
import type { TimelineState } from '../timelineStore';
import type { TempoMapEntry } from '../timelineTypes';

export const sharedTimingManager = new TimingManager();

export function getSharedTimingManager(): TimingManager {
    return sharedTimingManager;
}

export const DEFAULT_TIMING_CONTEXT: TimelineTimingContext = createTimingContext(
    { globalBpm: 120, beatsPerBar: 4, masterTempoMap: undefined },
    sharedTimingManager.ticksPerQuarter,
);

export function createTimelineTimingContext(state: TimelineState): TimelineTimingContext {
    return createTimingContext(
        {
            globalBpm: state.timeline.globalBpm,
            beatsPerBar: state.timeline.beatsPerBar,
            masterTempoMap: state.timeline.masterTempoMap,
        },
        sharedTimingManager.ticksPerQuarter,
    );
}

export function makeTimelineTrackId(prefix: string = 'trk'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function computeContentEndTick(state: TimelineState): number {
    let max = 0;
    for (const id of state.tracksOrder) {
        const t = state.tracks[id] as any;
        if (!t || !t.enabled) continue;
        if (t.type === 'midi') {
            const cacheKey = t.midiSourceId ?? id;
            const cache = state.midiCache[cacheKey];
            if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
            for (const n of cache.notesRaw) {
                const endTick = n.endTick + t.offsetTicks;
                if (endTick > max) max = endTick;
            }
        } else if (t.type === 'audio') {
            const cacheKey = t.audioSourceId ?? id;
            const acache = state.audioCache[cacheKey];
            if (!acache) {
                const featureCache = (state as any).audioFeatureCaches?.[cacheKey] as
                    | import('@audio/features/audioFeatureTypes').AudioFeatureCache
                    | undefined;
                if (!featureCache) continue;
                const clipEnd = featureCache.frameCount * featureCache.hopTicks + t.offsetTicks;
                if (clipEnd > max) max = clipEnd;
                continue;
            }
            const clipEnd = (t.regionEndTick ?? acache.durationTicks) + t.offsetTicks;
            if (clipEnd > max) max = clipEnd;
        }
    }
    return max;
}

function computeContentStartTick(state: TimelineState): number {
    let min = Infinity;
    for (const id of state.tracksOrder) {
        const t = state.tracks[id] as any;
        if (!t || !t.enabled) continue;
        if (t.type === 'midi') {
            const cacheKey = t.midiSourceId ?? id;
            const cache = state.midiCache[cacheKey];
            if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
            for (const n of cache.notesRaw) {
                const startTick = n.startTick + t.offsetTicks;
                if (startTick < min) min = startTick;
            }
        } else if (t.type === 'audio') {
            const cacheKey = t.audioSourceId ?? id;
            const acache = state.audioCache[cacheKey];
            if (!acache) {
                const featureCache = (state as any).audioFeatureCaches?.[cacheKey] as
                    | import('@audio/features/audioFeatureTypes').AudioFeatureCache
                    | undefined;
                if (!featureCache) continue;
                const clipStart = t.offsetTicks;
                if (clipStart < min) min = clipStart;
                continue;
            }
            const regionStart = t.regionStartTick ?? 0;
            const clipStart = regionStart + t.offsetTicks;
            if (clipStart < min) min = clipStart;
        }
    }
    if (!isFinite(min)) return 0;
    return Math.max(0, min);
}

export function computeContentBoundsTicks(
    state: TimelineState,
): { start: number; end: number } | null {
    const end = computeContentEndTick(state);
    if (!isFinite(end) || end <= 0) return null;
    const start = computeContentStartTick(state);
    return { start, end };
}

export function autoAdjustSceneRangeIfNeeded(
    get: () => TimelineState,
    set: (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void,
): void {
    const s = get();
    if (s.playbackRangeUserDefined) return;
    const bounds = computeContentBoundsTicks(s);
    if (!bounds) return;
    const { start, end } = bounds;
    const current = s.playbackRange || {};
    const same =
        Math.abs((current.startTick ?? -1) - start) < 1 && Math.abs((current.endTick ?? -1) - end) < 1;
    if (same) return;
    const oneBarBeats = s.timeline.beatsPerBar;
    const timing = createTimelineTimingContext(s);
    const oneBarTicks = Math.round(beatsToTicks(timing, oneBarBeats));
    const maxBars = 200;
    const clippedEnd = Math.min(end, start + oneBarTicks * maxBars);
    set((prev: TimelineState) => ({
        playbackRange: { startTick: start, endTick: clippedEnd + oneBarTicks },
        timelineView: {
            startTick: Math.max(0, start - oneBarTicks),
            endTick: clippedEnd + oneBarTicks * 2,
        },
        playbackRangeUserDefined: true,
    }));
}

export function convertSecondsToTicks(seconds: number, tempoMap?: TempoMapEntry[]): number {
    const context = createTimingContext(
        { globalBpm: 120, beatsPerBar: 4, masterTempoMap: tempoMap },
        sharedTimingManager.ticksPerQuarter,
    );
    return Math.round(timingSecondsToTicks(context, seconds));
}

export function convertTicksToBeats(state: TimelineState, ticks: number): number {
    const context = createTimelineTimingContext(state);
    return ticksToBeats(context, ticks);
}
