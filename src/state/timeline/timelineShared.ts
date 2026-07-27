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
import { getMidiClipTimelineBounds, getMidiClipsForTrack } from './midiClips';
import { getAudioClipTimelineBounds, getAudioClipsForTrack } from './audioClips';

export const sharedTimingManager = new TimingManager();

export function getSharedTimingManager(): TimingManager {
    return sharedTimingManager;
}

export const DEFAULT_TIMING_CONTEXT: TimelineTimingContext = createTimingContext(
    { globalBpm: 120, beatsPerBar: 4, masterTempoMap: undefined },
    sharedTimingManager.ticksPerQuarter
);

export function createTimelineTimingContext(state: TimelineState): TimelineTimingContext {
    return createTimingContext(
        {
            globalBpm: state.timeline.globalBpm,
            beatsPerBar: state.timeline.beatsPerBar,
            masterTempoMap: state.timeline.masterTempoMap,
        },
        sharedTimingManager.ticksPerQuarter
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
            for (const clip of getMidiClipsForTrack(t)) {
                if (clip.enabled === false) continue;
                const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
                if (bounds && bounds.endTick > max) {
                    max = bounds.endTick;
                }
            }
        } else if (t.type === 'audio') {
            const timing = createTimelineTimingContext(state);
            for (const clip of getAudioClipsForTrack(t)) {
                if (clip.enabled === false) continue;
                const featureCache = state.audioFeatureCaches[clip.sourceId];
                const sourceCache = state.audioCache[clip.sourceId]
                    ? state.audioCache
                    : featureCache
                      ? {
                            ...state.audioCache,
                            [clip.sourceId]: {
                                sampleRate: featureCache.analysisParams.sampleRate,
                                channels: 1,
                                durationSeconds:
                                    featureCache.startTimeSeconds + featureCache.frameCount * featureCache.hopSeconds,
                                durationSamples: 0,
                            },
                        }
                      : state.audioCache;
                const bounds = getAudioClipTimelineBounds(sourceCache, clip, timing);
                if (bounds && bounds.endTick > max) max = bounds.endTick;
            }
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
            for (const clip of getMidiClipsForTrack(t)) {
                if (clip.enabled === false) continue;
                const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
                if (bounds && bounds.startTick < min) {
                    min = bounds.startTick;
                }
            }
        } else if (t.type === 'audio') {
            const timing = createTimelineTimingContext(state);
            for (const clip of getAudioClipsForTrack(t)) {
                if (clip.enabled === false) continue;
                const featureCache = state.audioFeatureCaches[clip.sourceId];
                const sourceCache = state.audioCache[clip.sourceId]
                    ? state.audioCache
                    : featureCache
                      ? {
                            ...state.audioCache,
                            [clip.sourceId]: {
                                sampleRate: featureCache.analysisParams.sampleRate,
                                channels: 1,
                                durationSeconds:
                                    featureCache.startTimeSeconds + featureCache.frameCount * featureCache.hopSeconds,
                                durationSamples: 0,
                            },
                        }
                      : state.audioCache;
                const bounds = getAudioClipTimelineBounds(sourceCache, clip, timing);
                if (bounds && bounds.startTick < min) min = bounds.startTick;
            }
        }
    }
    if (!isFinite(min)) return 0;
    return Math.max(0, min);
}

export function computeContentBoundsTicks(state: TimelineState): { start: number; end: number } | null {
    const end = computeContentEndTick(state);
    if (!isFinite(end) || end <= 0) return null;
    const start = computeContentStartTick(state);
    return { start, end };
}

export function autoAdjustSceneRangeIfNeeded(
    get: () => TimelineState,
    set: (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void
): void {
    const s = get();
    if (s.playbackRangeUserDefined) return;
    const bounds = computeContentBoundsTicks(s);
    if (!bounds) return;
    const { start, end } = bounds;
    const current = s.playbackRange || {};
    const same = Math.abs((current.startTick ?? -1) - start) < 1 && Math.abs((current.endTick ?? -1) - end) < 1;
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
        sharedTimingManager.ticksPerQuarter
    );
    return Math.round(timingSecondsToTicks(context, seconds));
}

export function convertTicksToBeats(state: TimelineState, ticks: number): number {
    const context = createTimelineTimingContext(state);
    return ticksToBeats(context, ticks);
}
