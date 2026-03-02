import { useTimelineStore, type TimelineState } from '@state/timelineStore';
import {
    selectNotesInWindow as selectNotesInWindowSelector,
    selectTrackById as selectTrackByIdSelector,
    selectTracksByIds as selectTracksByIdsSelector,
    type TimelineNoteEvent,
} from '@state/selectors/timelineSelectors';
import {
    getFeatureData as getFeatureDataFromScene,
    type FeatureDataResult,
    type FeatureInput,
} from '@audio/features/sceneApi';
import type { AudioSamplingOptions } from '@audio/features/audioFeatureTypes';
import { createTimingContext, secondsToTicks, ticksToSeconds, secondsToBeatsContext, beatsToSecondsContext } from '@state/timelineTime';
import { beatsToTicks, ticksToBeats } from '@core/timing/ppq';

export const PLUGIN_API_VERSION = '1.0.0' as const;

export const PLUGIN_CAPABILITIES = {
    timelineRead: 'timeline.read',
    audioFeaturesRead: 'audio.features.read',
    timingConversion: 'timing.conversion',
    midiUtils: 'midi.utils',
} as const;

export type PluginHostCapability = (typeof PLUGIN_CAPABILITIES)[keyof typeof PLUGIN_CAPABILITIES];

export interface PluginTimelineApi {
    getStateSnapshot(): TimelineState | null;
    selectNotesInWindow(args: { trackIds: string[]; startSec: number; endSec: number }): TimelineNoteEvent[];
    getTrackById(trackId: string | null | undefined): TimelineState['tracks'][string] | null;
    getTracksByIds(trackIds: string[]): Array<TimelineState['tracks'][string]>;
}

export interface PluginAudioApi {
    sampleFeatureAtTime(args: {
        element?: object;
        trackId: string | null | undefined;
        feature: FeatureInput;
        time: number;
        samplingOptions?: AudioSamplingOptions | null;
    }): FeatureDataResult | null;
    sampleFeatureRange(args: {
        element?: object;
        trackId: string | null | undefined;
        feature: FeatureInput;
        startTime: number;
        endTime: number;
        stepSec: number;
        samplingOptions?: AudioSamplingOptions | null;
    }): FeatureDataResult[];
}

export interface PluginTimingApi {
    secondsToTicks(seconds: number): number | null;
    ticksToSeconds(ticks: number): number | null;
    secondsToBeats(seconds: number): number | null;
    beatsToSeconds(beats: number): number | null;
    beatsToTicks(beats: number): number;
    ticksToBeats(ticks: number): number;
}

export interface PluginUtilityApi {
    midiNoteToName(noteNumber: number): string;
}

export interface PluginHostApi {
    apiVersion: typeof PLUGIN_API_VERSION;
    capabilities: PluginHostCapability[];
    timeline: PluginTimelineApi;
    audio: PluginAudioApi;
    timing: PluginTimingApi;
    utilities: PluginUtilityApi;
}

export interface PluginHostGlobals {
    MVMNT?: {
        plugins?: PluginHostApi;
        [key: string]: unknown;
    };
}

interface TimelineStoreLike {
    getState(): TimelineState;
}

export interface CreatePluginHostApiDeps {
    timelineStore?: TimelineStoreLike | null;
    selectNotesInWindow?: typeof selectNotesInWindowSelector | null;
    selectTrackById?: typeof selectTrackByIdSelector | null;
    selectTracksByIds?: typeof selectTracksByIdsSelector | null;
    getFeatureData?: typeof getFeatureDataFromScene | null;
}

export interface CreatePluginHostApiResult {
    api: PluginHostApi;
    missingCapabilities: PluginHostCapability[];
}

const DEFAULT_AUDIO_ELEMENT_REF = Object.freeze({ __mvmntHostAudioApi: true });

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function toSafeNoteName(noteNumber: number): string {
    if (!Number.isFinite(noteNumber)) {
        return 'C-1';
    }
    const midi = Math.max(0, Math.min(127, Math.round(noteNumber)));
    const octave = Math.floor(midi / 12) - 1;
    const noteName = NOTE_NAMES[midi % 12];
    return `${noteName}${octave}`;
}

export function createPluginHostApi(deps: CreatePluginHostApiDeps = {}): CreatePluginHostApiResult {
    const timelineStore = deps.timelineStore === undefined ? useTimelineStore : deps.timelineStore;
    const selectNotesInWindow = deps.selectNotesInWindow === undefined ? selectNotesInWindowSelector : deps.selectNotesInWindow;
    const selectTrackById = deps.selectTrackById === undefined ? selectTrackByIdSelector : deps.selectTrackById;
    const selectTracksByIds = deps.selectTracksByIds === undefined ? selectTracksByIdsSelector : deps.selectTracksByIds;
    const getFeatureData = deps.getFeatureData === undefined ? getFeatureDataFromScene : deps.getFeatureData;

    const hasTimelineRead = Boolean(
        timelineStore &&
            typeof timelineStore.getState === 'function' &&
            typeof selectNotesInWindow === 'function' &&
            typeof selectTrackById === 'function' &&
            typeof selectTracksByIds === 'function'
    );
    const hasAudioFeaturesRead = typeof getFeatureData === 'function';

    const capabilities: PluginHostCapability[] = [PLUGIN_CAPABILITIES.timingConversion, PLUGIN_CAPABILITIES.midiUtils];
    if (hasTimelineRead) {
        capabilities.unshift(PLUGIN_CAPABILITIES.timelineRead);
    }
    if (hasAudioFeaturesRead) {
        capabilities.push(PLUGIN_CAPABILITIES.audioFeaturesRead);
    }

    const api: PluginHostApi = {
        apiVersion: PLUGIN_API_VERSION,
        capabilities,
        timeline: {
            getStateSnapshot() {
                if (!hasTimelineRead || !timelineStore) {
                    return null;
                }
                return timelineStore.getState();
            },
            selectNotesInWindow(args) {
                if (!hasTimelineRead || !timelineStore || !selectNotesInWindow) {
                    return [];
                }
                return selectNotesInWindow(timelineStore.getState(), args);
            },
            getTrackById(trackId) {
                if (!hasTimelineRead || !timelineStore || !selectTrackById) {
                    return null;
                }
                return selectTrackById(timelineStore.getState(), trackId) ?? null;
            },
            getTracksByIds(trackIds) {
                if (!hasTimelineRead || !timelineStore || !selectTracksByIds) {
                    return [];
                }
                return selectTracksByIds(timelineStore.getState(), trackIds);
            },
        },
        audio: {
            sampleFeatureAtTime({ element, trackId, feature, time, samplingOptions }) {
                if (!hasAudioFeaturesRead || !getFeatureData) {
                    return null;
                }
                return (
                    getFeatureData(element ?? DEFAULT_AUDIO_ELEMENT_REF, trackId, feature, time, samplingOptions ?? null) ??
                    null
                );
            },
            sampleFeatureRange({ element, trackId, feature, startTime, endTime, stepSec, samplingOptions }) {
                if (!hasAudioFeaturesRead || !getFeatureData || stepSec <= 0 || endTime < startTime) {
                    return [];
                }
                const samples: FeatureDataResult[] = [];
                const elementRef = element ?? DEFAULT_AUDIO_ELEMENT_REF;
                for (let t = startTime; t <= endTime; t += stepSec) {
                    const sample = getFeatureData(elementRef, trackId, feature, t, samplingOptions ?? null);
                    if (sample) {
                        samples.push(sample);
                    }
                }
                return samples;
            },
        },
        timing: {
            secondsToTicks(seconds) {
                if (!timelineStore || typeof timelineStore.getState !== 'function') {
                    return null;
                }
                const context = createTimingContext(timelineStore.getState().timeline);
                return secondsToTicks(context, seconds);
            },
            ticksToSeconds(ticks) {
                if (!timelineStore || typeof timelineStore.getState !== 'function') {
                    return null;
                }
                const context = createTimingContext(timelineStore.getState().timeline);
                return ticksToSeconds(context, ticks);
            },
            secondsToBeats(seconds) {
                if (!timelineStore || typeof timelineStore.getState !== 'function') {
                    return null;
                }
                const context = createTimingContext(timelineStore.getState().timeline);
                return secondsToBeatsContext(context, seconds);
            },
            beatsToSeconds(beats) {
                if (!timelineStore || typeof timelineStore.getState !== 'function') {
                    return null;
                }
                const context = createTimingContext(timelineStore.getState().timeline);
                return beatsToSecondsContext(context, beats);
            },
            beatsToTicks,
            ticksToBeats,
        },
        utilities: {
            midiNoteToName(noteNumber) {
                return toSafeNoteName(noteNumber);
            },
        },
    };

    const missingCapabilities: PluginHostCapability[] = [];
    if (!hasTimelineRead) {
        missingCapabilities.push(PLUGIN_CAPABILITIES.timelineRead);
    }
    if (!hasAudioFeaturesRead) {
        missingCapabilities.push(PLUGIN_CAPABILITIES.audioFeaturesRead);
    }

    return { api, missingCapabilities };
}

interface LoggerLike {
    warn: (...args: unknown[]) => void;
}

interface InstallPluginHostApiOptions {
    deps?: CreatePluginHostApiDeps;
    target?: PluginHostGlobals;
    logger?: LoggerLike;
}

export function installPluginHostApi(options: InstallPluginHostApiOptions = {}): PluginHostApi {
    const target = options.target ?? (globalThis as PluginHostGlobals);
    const logger = options.logger ?? console;
    const { api, missingCapabilities } = createPluginHostApi(options.deps ?? {});

    const mvmntGlobal = (target.MVMNT ??= {});
    mvmntGlobal.plugins = api;

    if (missingCapabilities.length > 0) {
        logger.warn(
            `[PluginHostApi] installed API ${api.apiVersion} with missing capabilities: ${missingCapabilities.join(', ')}`
        );
    }

    return api;
}
