import { useTimelineStore, type TimelineState } from '@state/timelineStore';
import {
    selectNotesInWindow as selectNotesInWindowSelector,
    selectTrackById as selectTrackByIdSelector,
    selectTracksByIds as selectTracksByIdsSelector,
    selectMidiTracks as selectMidiTracksSelector,
    selectCCInWindow as selectCCInWindowSelector,
    selectSustainStateAtTime as selectSustainStateAtTimeSelector,
} from '@state/selectors/timelineSelectors';
import type { TimelineNoteEvent } from '@core/timing/types';
import type { TimelineCCEvent } from '@core/timing/types';
import {
    getFeatureData as getFeatureDataFromScene,
    type FeatureDataResult,
    type FeatureInput,
} from '@audio/features/sceneApi';
import type {
    AudioSamplingOptions,
    AudioFeatureCalculator as InternalAudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
} from '@audio/features/audioFeatureTypes';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import {
    createTimingContext,
    secondsToTicks,
    ticksToSeconds,
    secondsToBeatsContext,
    beatsToSecondsContext,
} from '@state/timelineTime';
import { beatsToTicks, ticksToBeats } from '@core/timing/ppq';

export const PLUGIN_API_VERSION = '1.0.0' as const;

export const PLUGIN_CAPABILITIES = {
    timelineRead: 'timeline.read',
    audioFeaturesRead: 'audio.features.read',
    timingConversion: 'timing.conversion',
    midiUtils: 'midi.utils',
    audioCalculatorsRegister: 'audio.calculators.register',
} as const;

export type PluginHostCapability = (typeof PLUGIN_CAPABILITIES)[keyof typeof PLUGIN_CAPABILITIES];

export type PluginCapabilityMap = Record<keyof typeof PLUGIN_CAPABILITIES, boolean>;

export interface PluginTimelineApi {
    getStateSnapshot(): TimelineState | null;
    /** Notes from specific tracks within a time window. */
    selectNotesInWindow(args: { trackIds: string[]; startSec: number; endSec: number }): TimelineNoteEvent[];
    /** Notes from ALL MIDI tracks within a time window. Equivalent to selectNotesInWindow with every track. */
    selectAllNotesInWindow(args: { startSec: number; endSec: number }): TimelineNoteEvent[];
    /** Sorted array of unique MIDI note numbers (0–127) from the given tracks/window. Omit args to query all tracks, all time. */
    selectDistinctNoteNumbers(args?: { trackIds?: string[]; startSec?: number; endSec?: number }): number[];
    /** All events for a single MIDI note number. Omit trackIds/window to query all tracks and all time. */
    selectNotesByPitch(
        note: number,
        args?: { trackIds?: string[]; startSec?: number; endSec?: number }
    ): TimelineNoteEvent[];
    /** Min/max MIDI note numbers used in the given tracks/window. Returns null if there are no notes. */
    getNoteRange(args?: {
        trackIds?: string[];
        startSec?: number;
        endSec?: number;
    }): { min: number; max: number } | null;
    /** Total scene duration in seconds, derived from the playback range end (or timeline view end as fallback). */
    getTimelineDuration(): number;
    getTrackById(trackId: string | null | undefined): TimelineState['tracks'][string] | null;
    getTracksByIds(trackIds: string[]): Array<TimelineState['tracks'][string]>;
    /** All MIDI tracks on the timeline. */
    getMidiTracks(): Array<TimelineState['tracks'][string]>;
    /** Returns CC events in the given time window, optionally filtered by controller number. */
    selectCCInWindow(args: {
        trackIds?: string[];
        controller?: number;
        startSec: number;
        endSec: number;
    }): TimelineCCEvent[];
    /** Returns true if sustain pedal (CC 64) is held at the given time. */
    getSustainStateAtTime(args: { trackIds?: string[]; timeSec: number }): boolean;
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

// ============================================================================
// Audio Calculator public API types
// ============================================================================

/** Narrowed context passed to plugin calculator `calculate()` functions. */
export interface PluginAudioCalculatorContext {
    audioBuffer: AudioBuffer;
    hopTicks: number;
    hopSeconds: number;
    frameCount: number;
    analysisParams: {
        windowSize: number;
        hopSize: number;
        sampleRate: number;
        fftSize: number | null;
    };
    analysisProfileId: string;
    signal?: AbortSignal;
    reportProgress?: (processed: number, total: number) => void;
}

/** Return value from a plugin calculator. Subset of the internal AudioFeatureTrack shape. */
export interface PluginAudioCalculatorResult {
    frameCount: number;
    channels: number;
    format: 'float32' | 'uint8';
    data: Float32Array | Uint8Array;
    channelLayout?: { aliases: string[] };
}

/** Public calculator contract for plugin authors. */
export interface PluginAudioCalculator {
    /** Namespaced identifier, e.g. `'myplugin.loudness'`. Must be unique across all registered calculators. */
    id: string;
    /** Increment to bust existing caches when output format or algorithm changes. */
    version: number;
    /** Feature key elements request via `registerFeatureRequirements`. */
    featureKey: string;
    /** Optional friendly label for UI display. */
    label?: string;
    calculate(
        context: PluginAudioCalculatorContext
    ): Promise<PluginAudioCalculatorResult> | PluginAudioCalculatorResult;
}

/** Descriptor returned by `audioCalculatorsApi.list()`. */
export interface PluginAudioCalculatorInfo {
    id: string;
    version: number;
    featureKey: string;
    label?: string;
}

/** Public API surface for registering and managing custom audio feature calculators. */
export interface PluginAudioCalculatorApi {
    /** Register a calculator. Call at module scope so it is ready before audio analysis runs. */
    register(calculator: PluginAudioCalculator): void;
    /** Unregister a calculator by id. */
    unregister(id: string): void;
    /** List all currently registered calculators (built-in and plugin). */
    list(): PluginAudioCalculatorInfo[];
}

export interface PluginHostApi {
    apiVersion: typeof PLUGIN_API_VERSION;
    capabilities: PluginHostCapability[];
    timeline: PluginTimelineApi;
    audio: PluginAudioApi;
    timing: PluginTimingApi;
    utilities: PluginUtilityApi;
    audioCalculators: PluginAudioCalculatorApi;
    getAvailableCapabilities(): PluginCapabilityMap;
    onError(callback: (error: Error, capability: string) => void): void;
    emitError(error: Error, capability: string): void;
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
    selectMidiTracks?: typeof selectMidiTracksSelector | null;
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

/** Bridges a public PluginAudioCalculator to the internal AudioFeatureCalculator shape. */
function adaptPluginCalculator(plugin: PluginAudioCalculator): InternalAudioFeatureCalculator {
    return {
        id: plugin.id,
        version: plugin.version,
        featureKey: plugin.featureKey,
        label: plugin.label,
        async calculate(ctx: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const result = await plugin.calculate({
                audioBuffer: ctx.audioBuffer,
                hopTicks: ctx.hopTicks,
                hopSeconds: ctx.hopSeconds,
                frameCount: ctx.frameCount,
                analysisParams: {
                    windowSize: ctx.analysisParams.windowSize,
                    hopSize: ctx.analysisParams.hopSize,
                    sampleRate: ctx.analysisParams.sampleRate,
                    fftSize: ctx.analysisParams.fftSize ?? null,
                },
                analysisProfileId: ctx.analysisProfileId,
                signal: ctx.signal,
                reportProgress: ctx.reportProgress,
            });
            return {
                key: plugin.featureKey,
                calculatorId: plugin.id,
                version: plugin.version,
                frameCount: result.frameCount,
                channels: result.channels,
                hopTicks: ctx.hopTicks,
                hopSeconds: ctx.hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: ctx.tempoProjection,
                format: result.format,
                data: result.data,
                channelLayout: result.channelLayout ?? null,
                channelAliases: result.channelLayout?.aliases ?? null,
                analysisProfileId: ctx.analysisProfileId,
            };
        },
    };
}

export function createPluginHostApi(deps: CreatePluginHostApiDeps = {}): CreatePluginHostApiResult {
    const timelineStore = deps.timelineStore === undefined ? useTimelineStore : deps.timelineStore;
    const selectNotesInWindow =
        deps.selectNotesInWindow === undefined ? selectNotesInWindowSelector : deps.selectNotesInWindow;
    const selectTrackById = deps.selectTrackById === undefined ? selectTrackByIdSelector : deps.selectTrackById;
    const selectTracksByIds = deps.selectTracksByIds === undefined ? selectTracksByIdsSelector : deps.selectTracksByIds;
    const selectMidiTracks = deps.selectMidiTracks === undefined ? selectMidiTracksSelector : deps.selectMidiTracks;
    const getFeatureData = deps.getFeatureData === undefined ? getFeatureDataFromScene : deps.getFeatureData;

    const hasTimelineRead = Boolean(
        timelineStore &&
        typeof timelineStore.getState === 'function' &&
        typeof selectNotesInWindow === 'function' &&
        typeof selectTrackById === 'function' &&
        typeof selectTracksByIds === 'function' &&
        typeof selectMidiTracks === 'function'
    );
    const hasAudioFeaturesRead = typeof getFeatureData === 'function';

    const capabilities: PluginHostCapability[] = [
        PLUGIN_CAPABILITIES.timingConversion,
        PLUGIN_CAPABILITIES.midiUtils,
        PLUGIN_CAPABILITIES.audioCalculatorsRegister,
    ];
    if (hasTimelineRead) {
        capabilities.unshift(PLUGIN_CAPABILITIES.timelineRead);
    }
    if (hasAudioFeaturesRead) {
        capabilities.push(PLUGIN_CAPABILITIES.audioFeaturesRead);
    }

    const errorCallbacks: Array<(error: Error, capability: string) => void> = [];

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
            selectAllNotesInWindow(args) {
                if (!hasTimelineRead || !timelineStore || !selectNotesInWindow || !selectMidiTracks) {
                    return [];
                }
                const state = timelineStore.getState();
                const trackIds = selectMidiTracks(state).map((t) => t.id);
                return selectNotesInWindow(state, { trackIds, startSec: args.startSec, endSec: args.endSec });
            },
            selectDistinctNoteNumbers(args) {
                if (!hasTimelineRead || !timelineStore || !selectNotesInWindow || !selectMidiTracks) {
                    return [];
                }
                const state = timelineStore.getState();
                const trackIds = args?.trackIds ?? selectMidiTracks(state).map((t) => t.id);
                const startSec = args?.startSec ?? -Infinity;
                const endSec = args?.endSec ?? Infinity;
                const events = selectNotesInWindow(state, { trackIds, startSec, endSec });
                const seen = new Set<number>();
                for (const e of events) seen.add(e.note);
                return Array.from(seen).sort((a, b) => a - b);
            },
            selectNotesByPitch(note, args) {
                if (!hasTimelineRead || !timelineStore || !selectNotesInWindow || !selectMidiTracks) {
                    return [];
                }
                const state = timelineStore.getState();
                const trackIds = args?.trackIds ?? selectMidiTracks(state).map((t) => t.id);
                const startSec = args?.startSec ?? -Infinity;
                const endSec = args?.endSec ?? Infinity;
                const events = selectNotesInWindow(state, { trackIds, startSec, endSec });
                return events.filter((e) => e.note === note);
            },
            getNoteRange(args) {
                if (!hasTimelineRead || !timelineStore || !selectNotesInWindow || !selectMidiTracks) {
                    return null;
                }
                const state = timelineStore.getState();
                const trackIds = args?.trackIds ?? selectMidiTracks(state).map((t) => t.id);
                const startSec = args?.startSec ?? -Infinity;
                const endSec = args?.endSec ?? Infinity;
                const events = selectNotesInWindow(state, { trackIds, startSec, endSec });
                if (events.length === 0) return null;
                let min = 127,
                    max = 0;
                for (const e of events) {
                    if (e.note < min) min = e.note;
                    if (e.note > max) max = e.note;
                }
                return { min, max };
            },
            getTimelineDuration() {
                if (!hasTimelineRead || !timelineStore) return 0;
                const state = timelineStore.getState();
                const endTick = state.playbackRange?.endTick ?? state.timelineView.endTick;
                const context = createTimingContext(state.timeline);
                return ticksToSeconds(context, endTick) ?? 0;
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
            getMidiTracks() {
                if (!hasTimelineRead || !timelineStore || !selectMidiTracks) {
                    return [];
                }
                return selectMidiTracks(timelineStore.getState());
            },
            selectCCInWindow(args) {
                if (!hasTimelineRead || !timelineStore) {
                    return [];
                }
                return selectCCInWindowSelector(timelineStore.getState(), args);
            },
            getSustainStateAtTime(args) {
                if (!hasTimelineRead || !timelineStore) {
                    return false;
                }
                return selectSustainStateAtTimeSelector(timelineStore.getState(), args);
            },
        },
        audio: {
            sampleFeatureAtTime({ element, trackId, feature, time, samplingOptions }) {
                if (!hasAudioFeaturesRead || !getFeatureData) {
                    return null;
                }
                return (
                    getFeatureData(
                        element ?? DEFAULT_AUDIO_ELEMENT_REF,
                        trackId,
                        feature,
                        time,
                        samplingOptions ?? null
                    ) ?? null
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
        audioCalculators: {
            register(calculator: PluginAudioCalculator): void {
                audioFeatureCalculatorRegistry.register(adaptPluginCalculator(calculator));
            },
            unregister(id: string): void {
                audioFeatureCalculatorRegistry.unregister(id);
            },
            list(): PluginAudioCalculatorInfo[] {
                return audioFeatureCalculatorRegistry.list().map((c) => ({
                    id: c.id,
                    version: c.version,
                    featureKey: c.featureKey,
                    label: c.label,
                }));
            },
        },
        getAvailableCapabilities() {
            return {
                timelineRead: capabilities.includes(PLUGIN_CAPABILITIES.timelineRead),
                audioFeaturesRead: capabilities.includes(PLUGIN_CAPABILITIES.audioFeaturesRead),
                timingConversion: capabilities.includes(PLUGIN_CAPABILITIES.timingConversion),
                midiUtils: capabilities.includes(PLUGIN_CAPABILITIES.midiUtils),
                audioCalculatorsRegister: capabilities.includes(PLUGIN_CAPABILITIES.audioCalculatorsRegister),
            };
        },
        onError(callback: (error: Error, capability: string) => void) {
            errorCallbacks.push(callback);
        },
        emitError(error: Error, capability: string) {
            errorCallbacks.forEach((cb) => cb(error, capability));
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
