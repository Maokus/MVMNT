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
    getFeatureDataRange as getFeatureDataRangeFromScene,
    type FeatureDataResult,
    type FeatureDataRangeResult,
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
import { getAudioClipSegmentsInSeconds, getAudioClipTimelineSegments } from '@state/timeline/audioClips';
import type { AudioTrack } from '@audio/audioTypes';
import { PLUGIN_CAPABILITIES, type PluginCapability } from '../../../../../packages/plugin-sdk/src/api';
import {
    readAudioFeatureMatrix,
    type AudioFeatureMatrix,
} from '@audio/features/audioFeatureMatrix';
export { PLUGIN_CAPABILITIES } from '../../../../../packages/plugin-sdk/src/api';

const CLIP_RAW_FALLBACK_SAMPLE_RATE = 48_000;

function isModernAudioClipTrack(track: unknown): track is AudioTrack & { clips: NonNullable<AudioTrack['clips']> } {
    return Boolean(track && (track as AudioTrack).type === 'audio' && Array.isArray((track as AudioTrack).clips));
}

function getClipRawSampleRate(state: TimelineState, trackId: string): number | null {
    const track = state.tracks[trackId];
    if (!isModernAudioClipTrack(track)) return null;
    const timing = createTimingContext(state.timeline);
    const rates = getAudioClipTimelineSegments(state, trackId, timing)
        .map((segment) => state.audioCache[segment.sourceId]?.audioBuffer?.sampleRate)
        .filter((rate): rate is number => typeof rate === 'number' && rate > 0);
    if (!rates.length) return null;
    return rates.every((rate) => rate === rates[0]) ? rates[0] : CLIP_RAW_FALLBACK_SAMPLE_RATE;
}

function readBufferSample(buffer: AudioBuffer, position: number, channel: 'mono' | 'left' | 'right' | number): number {
    const index = Math.max(0, Math.min(buffer.length - 1, position));
    const left = Math.floor(index);
    const right = Math.min(buffer.length - 1, left + 1);
    const fraction = index - left;
    const readChannel = (channelIndex: number) => {
        const data = buffer.getChannelData(Math.max(0, Math.min(buffer.numberOfChannels - 1, channelIndex)));
        const a = data[left] ?? 0;
        const b = data[right] ?? 0;
        return a + (b - a) * fraction;
    };
    if (channel === 'mono') {
        let sum = 0;
        for (let i = 0; i < buffer.numberOfChannels; i += 1) sum += readChannel(i);
        return sum / Math.max(1, buffer.numberOfChannels);
    }
    const channelIndex = channel === 'left' ? 0 : channel === 'right' ? 1 : channel;
    return readChannel(channelIndex);
}

function getClipRawSamples(
    state: TimelineState,
    trackId: string,
    startSec: number,
    endSec: number,
    channel: 'mono' | 'left' | 'right' | number,
    signal?: AbortSignal
): Float32Array | null {
    if (signal?.aborted) return null;
    const sampleRate = getClipRawSampleRate(state, trackId);
    if (!sampleRate) return null;
    const count = Math.ceil((endSec - startSec) * sampleRate);
    if (count <= 0) return null;
    const timing = createTimingContext(state.timeline);
    const segments = getAudioClipSegmentsInSeconds(state, trackId, startSec, endSec, timing);
    const result = new Float32Array(count);
    for (const segment of segments) {
        const buffer = state.audioCache[segment.sourceId]?.audioBuffer;
        if (!buffer) continue;
        const overlapStart = Math.max(startSec, segment.startSeconds);
        const overlapEnd = Math.min(endSec, segment.endSeconds);
        const placementSeconds = ticksToSeconds(timing, segment.clip.offsetTicks);
        const first = Math.max(0, Math.floor((overlapStart - startSec) * sampleRate));
        const last = Math.min(count, Math.ceil((overlapEnd - startSec) * sampleRate));
        for (let i = first; i < last; i += 1) {
            if ((i & 0x3fff) === 0 && signal?.aborted) return null;
            const timelineSeconds = startSec + i / sampleRate;
            const sourceSeconds = timelineSeconds - placementSeconds;
            if (sourceSeconds < segment.sourceStartSeconds || sourceSeconds >= segment.sourceEndSeconds) continue;
            result[i] = readBufferSample(buffer, sourceSeconds * buffer.sampleRate, channel);
        }
    }
    return result;
}

function getClipRmsInWindow(
    state: TimelineState,
    trackId: string,
    startSec: number,
    endSec: number
): Float32Array | null {
    const track = state.tracks[trackId] as AudioTrack | undefined;
    if (!track || !isModernAudioClipTrack(track)) return null;
    const timing = createTimingContext(state.timeline);
    const segments = getAudioClipSegmentsInSeconds(state, trackId, startSec, endSec, timing);
    const channels = Math.max(
        1,
        ...segments.map((segment) => state.audioCache[segment.sourceId]?.audioBuffer?.numberOfChannels ?? 0)
    );
    const result = new Float32Array(channels);
    for (let channel = 0; channel < channels; channel += 1) {
        const samples = getClipRawSamples(state, trackId, startSec, endSec, channel);
        if (!samples) return null;
        let sumSquares = 0;
        for (const sample of samples) sumSquares += sample * sample;
        result[channel] = Math.sqrt(sumSquares / Math.max(1, samples.length));
    }
    return result;
}

export type PluginHostCapability = PluginCapability;

export type PluginCapabilityMap = Record<keyof typeof PLUGIN_CAPABILITIES, boolean>;

export interface PluginTimelineApi {
    getStateSnapshot(): TimelineState | null;
    /** Notes from specific tracks within a time window. */
    /** Notes from the requested MIDI tracks. Multi-clip tracks aggregate all enabled clips; events may include clipId/sourceId. */
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
    /** Returns CC events in the given time window, optionally filtered by controller number. Events may include clipId/sourceId. */
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
    }): FeatureDataRangeResult[];
    sampleFeatureMatrix(args: {
        trackId: string;
        featureKey: string;
        startSeconds: number;
        stepSeconds: number;
        frameCount: number;
        interpolation?: 'linear' | 'nearest';
        analysisProfileId?: string | null;
    }): AudioFeatureMatrix | null;

    /**
     * Return a copy of the decoded PCM samples for a time window on a specific channel.
     * Returns null if the track is not loaded, the window is invalid, or the sample
     * decoded sample count for the requested window. Large windows allocate a correspondingly
     * large result, so use getRmsInWindow or the feature pipeline when PCM detail is unnecessary.
     *
     * channel: 'left' = channel 0, 'right' = channel 1 (falls back to 0 for mono),
     *          'mono' (default) = average of all channels, number = explicit index.
     */
    getRawSamples(opts: {
        trackId: string;
        startSec: number;
        endSec: number;
        channel?: 'mono' | 'left' | 'right' | number;
        signal?: AbortSignal;
    }): Float32Array | null;

    /**
     * Compute RMS amplitude over a time window without a pre-computed feature track.
     * Returns a Float32Array with one value per channel: [rmsL, rmsR] for stereo,
     * [rms] for mono. Returns null if the track is not loaded or the window is invalid.
     */
    getRmsInWindow(opts: { trackId: string; startSec: number; endSec: number }): Float32Array | null;

    /**
     * Return the sample rate of the decoded audio buffer for a track.
     * Returns null if the track is not loaded or is not an audio track.
     */
    getSampleRate(opts: { trackId: string }): number | null;
}

export interface PluginTimingApi {
    secondsToTicks(seconds: number): number | null;
    ticksToSeconds(ticks: number): number | null;
    secondsToBeats(seconds: number): number | null;
    beatsToSeconds(beats: number): number | null;
    beatsToTicks(beats: number): number;
    ticksToBeats(ticks: number): number;
    /** Current global timeline meter. The returned value is a defensive copy. */
    getTimeSignature(): { numerator: number; denominator: number } | null;
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

/** Descriptor returned by the private audio-calculator host service. */
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

export interface PluginHostServices {
    capabilities: PluginHostCapability[];
    timeline: PluginTimelineApi;
    audio: PluginAudioApi;
    timing: PluginTimingApi;
    utilities: PluginUtilityApi;
    audioCalculators: PluginAudioCalculatorApi;
    getAvailableCapabilities(): PluginCapabilityMap;
}

interface TimelineStoreLike {
    getState(): TimelineState;
}

export interface CreatePluginHostServicesDeps {
    timelineStore?: TimelineStoreLike | null;
    selectNotesInWindow?: typeof selectNotesInWindowSelector | null;
    selectTrackById?: typeof selectTrackByIdSelector | null;
    selectTracksByIds?: typeof selectTracksByIdsSelector | null;
    selectMidiTracks?: typeof selectMidiTracksSelector | null;
    getFeatureData?: typeof getFeatureDataFromScene | null;
    getFeatureDataRange?: typeof getFeatureDataRangeFromScene | null;
}

export interface CreatePluginHostServicesResult {
    services: PluginHostServices;
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
                analysisProfileId: ctx.analysisProfileId,
            };
        },
    };
}

export function createPluginHostServices(
    deps: CreatePluginHostServicesDeps = {}
): CreatePluginHostServicesResult {
    const timelineStore = deps.timelineStore === undefined ? useTimelineStore : deps.timelineStore;
    const selectNotesInWindow =
        deps.selectNotesInWindow === undefined ? selectNotesInWindowSelector : deps.selectNotesInWindow;
    const selectTrackById = deps.selectTrackById === undefined ? selectTrackByIdSelector : deps.selectTrackById;
    const selectTracksByIds = deps.selectTracksByIds === undefined ? selectTracksByIdsSelector : deps.selectTracksByIds;
    const selectMidiTracks = deps.selectMidiTracks === undefined ? selectMidiTracksSelector : deps.selectMidiTracks;
    const getFeatureData = deps.getFeatureData === undefined ? getFeatureDataFromScene : deps.getFeatureData;
    const getFeatureDataRange =
        deps.getFeatureDataRange === undefined ? getFeatureDataRangeFromScene : deps.getFeatureDataRange;

    const hasTimelineRead = Boolean(
        timelineStore &&
        typeof timelineStore.getState === 'function' &&
        typeof selectNotesInWindow === 'function' &&
        typeof selectTrackById === 'function' &&
        typeof selectTracksByIds === 'function' &&
        typeof selectMidiTracks === 'function'
    );
    const hasAudioFeaturesRead = typeof getFeatureData === 'function';
    const hasAudioRawRead = Boolean(timelineStore && typeof timelineStore.getState === 'function');

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
    if (hasAudioRawRead) {
        capabilities.push(PLUGIN_CAPABILITIES.audioRawRead);
    }

    const services: PluginHostServices = {
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
                const endTick =
                    state.playbackRange?.endTick ?? state.timelineView?.endTick ?? state.timeline?.currentTick ?? 0;
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
                if (!hasAudioFeaturesRead || !getFeatureDataRange || stepSec <= 0 || endTime < startTime) {
                    return [];
                }
                return getFeatureDataRange(
                    element ?? DEFAULT_AUDIO_ELEMENT_REF,
                    trackId,
                    feature,
                    startTime,
                    endTime,
                    stepSec,
                    samplingOptions ?? null
                );
            },
            sampleFeatureMatrix(args) {
                if (!hasAudioFeaturesRead || !timelineStore) return null;
                return readAudioFeatureMatrix(timelineStore.getState(), args);
            },
            getRawSamples({ trackId, startSec, endSec, channel = 'mono', signal }) {
                if (!hasAudioRawRead || !timelineStore) return null;
                if (signal?.aborted) return null;
                if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
                const state = timelineStore.getState();
                const track = state.tracks[trackId];
                if (!track || track.type !== 'audio') return null;
                return getClipRawSamples(state, trackId, startSec, endSec, channel, signal);
            },
            getRmsInWindow({ trackId, startSec, endSec }) {
                if (!hasAudioRawRead || !timelineStore) return null;
                if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
                const state = timelineStore.getState();
                const track = state.tracks[trackId];
                if (!track || track.type !== 'audio') return null;
                return getClipRmsInWindow(state, trackId, startSec, endSec);
            },
            getSampleRate({ trackId }) {
                if (!hasAudioRawRead || !timelineStore) return null;
                const state = timelineStore.getState();
                const track = state.tracks[trackId];
                if (!track || track.type !== 'audio') return null;
                return getClipRawSampleRate(state, trackId);
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
            getTimeSignature() {
                if (!timelineStore || typeof timelineStore.getState !== 'function') return null;
                const { beatsPerBar } = timelineStore.getState().timeline;
                return { numerator: beatsPerBar, denominator: 4 };
            },
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
                audioRawRead: capabilities.includes(PLUGIN_CAPABILITIES.audioRawRead),
                timingConversion: capabilities.includes(PLUGIN_CAPABILITIES.timingConversion),
                midiUtils: capabilities.includes(PLUGIN_CAPABILITIES.midiUtils),
                audioCalculatorsRegister: capabilities.includes(PLUGIN_CAPABILITIES.audioCalculatorsRegister),
            };
        },
    };

    const missingCapabilities: PluginHostCapability[] = [];
    if (!hasTimelineRead) {
        missingCapabilities.push(PLUGIN_CAPABILITIES.timelineRead);
    }
    if (!hasAudioFeaturesRead) {
        missingCapabilities.push(PLUGIN_CAPABILITIES.audioFeaturesRead);
    }
    if (!hasAudioRawRead) {
        missingCapabilities.push(PLUGIN_CAPABILITIES.audioRawRead);
    }

    return { services, missingCapabilities };
}
