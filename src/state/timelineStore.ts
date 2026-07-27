import { type StateCreator } from 'zustand';
import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import type { MIDIData } from '@core/types';
import type { AudioTrack, AudioCacheEntry, AudioCacheOriginalFile, AudioCacheWaveform } from '@audio/audioTypes';
import { estimateAudioBufferBytes, estimateFeatureCacheBytes, formatBytes, summarizeAudioMemory } from '@audio/audioMemoryDiagnostics';
import { recordAudioMemoryDiagnostic } from './audioMemoryDiagnosticsStore';
import { AudioAssetStore } from '@persistence/audio-asset-store';
import type {
    AudioFeatureCache,
    AudioFeatureCacheStatus,
    AudioFeatureCacheStatusProgress,
    AudioFeatureCacheStatusState,
    AudioAnalysisProfileOverrides,
} from '@audio/features/audioFeatureTypes';
import type { TempoAlignedAdapterDiagnostics } from '@audio/features/tempoAlignedViewAdapter';
import {
    sharedAudioFeatureAnalysisScheduler,
    type AudioFeatureAnalysisHandle,
} from '@audio/features/audioFeatureScheduler';
import {
    DEFAULT_ANALYSIS_PROFILE_ID,
    resolveFeatureTrackFromCache,
    sanitizeAnalysisProfileId,
} from '@audio/features/featureTrackIdentity';
import type { TempoMapEntry, NoteRaw, CCEventRaw, MidiCacheBounds } from '@state/timelineTypes';
import type { TempoKeyframe } from '@core/timing/types';
import { resolveTempoKeyframes } from '@core/timing/tempo-automation-resolver';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { quantizeSettingToBeats, type QuantizeSetting } from './timeline/quantize';
import {
    createTimingContext,
    secondsToTicks as timingSecondsToTicks,
    ticksToSeconds as timingTicksToSeconds,
    secondsToBeatsContext,
    beatsToSecondsContext,
    secondsToBars,
    barsToSeconds,
    beatsToTicks,
    ticksToBeats,
} from './timelineTime';
import {
    DEFAULT_TIMING_CONTEXT,
    autoAdjustSceneRangeIfNeeded,
    createTimelineTimingContext,
    getSharedTimingManager,
    makeTimelineTrackId,
} from './timeline/timelineShared';
import { createTimelineCommandGateway } from './timeline/commandGateway';
import type { AddTrackCommandResult } from './timeline/commands/addTrackCommand';
import type { TimelineCommandDispatchResult, TimelineSerializedCommandDescriptor } from './timeline/commandTypes';
import { mergeFeatureCaches } from './timeline/featureCacheUtils';
import { useSelectionStore } from '@state/selectionStore';
import type { MidiClip } from './timeline/midiClips';
import type {
    AddMidiClipPayload,
    RemoveMidiClipsPayload,
    SetMultipleMidiClipOffsetsPayload,
    UpdateMidiClipsPayload,
    MoveMidiClipsBetweenTracksPayload,
} from './timeline/commands/midiClipCommands';
import type {
    AddAudioClipPayload,
    MoveAudioClipsBetweenTracksPayload,
    RemoveAudioClipsPayload,
    SetMultipleAudioClipOffsetsPayload,
    UpdateAudioClipsPayload,
} from './timeline/commands/audioClipCommands';

export { getSharedTimingManager, sharedTimingManager } from './timeline/timelineShared';

// Timeline base types
// Types are now in timelineTypes.ts

export type TimelineTrack = {
    id: string;
    name: string;
    type: 'midi';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    clips?: MidiClip[];
    // Legacy MIDI placement fields retained for old documents and current single-clip UI.
    offsetTicks?: number;
    regionStartTick?: number;
    regionEndTick?: number;
    midiSourceId?: string;
};

export interface HybridCacheFallbackEvent {
    trackId: string;
    sourceId?: string;
    featureKey: string;
    reason: string;
    timestamp: number;
}

export type TimelineState = {
    timeline: {
        id: string;
        name: string;
        masterTempoMap?: TempoMapEntry[];
        currentTick: number; // canonical playhead position in ticks
        globalBpm: number; // fallback bpm for conversions when map is empty
        beatsPerBar: number; // global meter (constant for now)
        playheadAuthority?: 'tick' | 'seconds' | 'clock' | 'user'; // last domain that authored the playhead
        tempoAutomation?: {
            enabled: boolean;
            keyframes: TempoKeyframe[];
            laneVisible?: boolean;
        };
    };
    tracks: Record<string, TimelineTrack | AudioTrack>;
    tracksOrder: string[];
    transport: {
        state?: 'idle' | 'playing' | 'paused' | 'seeking';
        isPlaying: boolean;
        loopEnabled: boolean;
        loopStartTick?: number; // canonical loop start
        loopEndTick?: number; // canonical loop end
        rate: number; // playback rate factor (inactive until wired to visualizer/worker)
        quantize: QuantizeSetting; // snap denomination for transport interactions
        adaptiveSnap: boolean; // when true, snap denominator and grid lines adapt to zoom level
        arbitrarySnapN: number; // denominator N for 'arbitrary' snap mode (snap to 1/N of a bar)
        autoKeying: boolean; // when true, property changes automatically create keyframes
    };
    // UI view window in ticks
    timelineView: { startTick: number; endTick: number };
    // Real playback range braces (yellow) in ticks. Optional; when unset, fallback to timelineView.
    playbackRange?: { startTick?: number; endTick?: number };
    // Marks that user explicitly set the playbackRange (scene start/end). When false, system may auto-adjust
    playbackRangeUserDefined: boolean;
    midiCache: Record<
        string,
        {
            midiData: MIDIData;
            notesRaw: NoteRaw[];
            ccRaw: CCEventRaw[];
            ticksPerQuarter: number;
            tempoMap?: TempoMapEntry[];
            bounds?: MidiCacheBounds;
        }
    >;
    audioCache: Record<string, AudioCacheEntry>;
    audioFeatureCaches: Record<string, AudioFeatureCache>;
    audioFeatureCacheStatus: Record<string, AudioFeatureCacheStatus>;
    hybridCacheRollout: {
        adapterEnabled: boolean;
        fallbackLog: HybridCacheFallbackEvent[];
    };
    tempoAlignedDiagnostics: Record<string, TempoAlignedAdapterDiagnostics>;
    // UI preferences
    rowHeight: number; // track row height in px
    /** Session-only test-synth routing. This is deliberately not part of a track/document. */
    midiPreviewTrackIds: Record<string, true>;

    // Actions
    addMidiTrack: (input: { name: string; file?: File; midiData?: MIDIData; offsetTicks?: number }) => Promise<string>;
    addMidiClip: (input: AddMidiClipPayload) => Promise<string>;
    removeMidiClips: (input: RemoveMidiClipsPayload) => Promise<void>;
    updateMidiClip: (input: UpdateMidiClipsPayload['updates'][number]) => Promise<void>;
    updateMidiClips: (input: UpdateMidiClipsPayload) => Promise<void>;
    setMultipleMidiClipOffsets: (input: SetMultipleMidiClipOffsetsPayload) => Promise<void>;
    moveMidiClipsBetweenTracks: (input: MoveMidiClipsBetweenTracksPayload) => Promise<void>;
    addAudioClip: (input: AddAudioClipPayload) => Promise<string>;
    removeAudioClips: (input: RemoveAudioClipsPayload) => Promise<void>;
    updateAudioClip: (input: UpdateAudioClipsPayload['updates'][number]) => Promise<void>;
    updateAudioClips: (input: UpdateAudioClipsPayload) => Promise<void>;
    setMultipleAudioClipOffsets: (input: SetMultipleAudioClipOffsetsPayload) => Promise<void>;
    moveAudioClipsBetweenTracks: (input: MoveAudioClipsBetweenTracksPayload) => Promise<void>;
    addAudioTrack: (input: {
        name: string;
        file?: File;
        buffer?: AudioBuffer;
        offsetTicks?: number;
    }) => Promise<string>;
    removeTrack: (id: string) => void;
    removeTracks: (ids: string[]) => void; // batch removal (single undo snapshot)
    updateTrack: (id: string, patch: Partial<TimelineTrack>) => Promise<void>;
    setTrackOffsetTicks: (id: string, offsetTicks: number) => Promise<void>;
    setMultipleTrackOffsetTicks: (offsets: Array<{ trackId: string; offsetTicks: number }>) => Promise<void>;
    setTrackRegionTicks: (id: string, startTick?: number, endTick?: number) => Promise<void>;
    setTrackEnabled: (id: string, enabled: boolean) => Promise<void>;
    setTrackMute: (id: string, mute: boolean) => Promise<void>;
    setTrackSolo: (id: string, solo: boolean) => Promise<void>;
    setTrackGain: (id: string, gain: number) => Promise<void>; // audio only
    setMidiPreviewEnabled: (id: string, enabled: boolean) => void;
    toggleMidiPreview: (id: string) => void;
    setMasterTempoMap: (map?: TempoMapEntry[]) => void;
    setGlobalBpm: (bpm: number) => void;
    setBeatsPerBar: (n: number) => void;
    setCurrentTick: (tick: number, authority?: 'tick' | 'seconds' | 'clock' | 'user') => void; // dual-write API
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekTick: (tick: number) => void;
    scrubTick: (tick: number) => void;
    setRate: (rate: number) => void;
    setQuantize: (q: QuantizeSetting) => void;
    setArbitrarySnapN: (n: number) => void;
    setAdaptiveSnap: (v: boolean) => void;
    setAutoKeying: (v: boolean) => void;
    setLoopEnabled: (enabled: boolean) => void;
    setLoopRangeTicks: (startTick?: number, endTick?: number) => void;
    toggleLoop: () => void;
    reorderTracks: (order: string[]) => Promise<void>;
    setTimelineViewTicks: (startTick: number, endTick: number) => void;
    _clipGroupDrag: { delta: number; trackIds: string[] } | null;
    _setClipGroupDrag: (drag: { delta: number; trackIds: string[] } | null) => void;
    _crossTrackDrag: {
        kind?: 'midi' | 'audio';
        previews: Array<{
            kind?: 'midi' | 'audio';
            clipId: string;
            sourceTrackId: string;
            targetTrackId: string;
            previewOffsetTicks: number;
            sourceId: string;
            regionStartTick?: number;
            regionEndTick?: number;
        }>;
        targetTrackId: string;
    } | null;
    _setCrossTrackDrag: (drag: TimelineState['_crossTrackDrag']) => void;
    setPlaybackRangeTicks: (startTick?: number, endTick?: number) => void;
    setPlaybackRangeExplicitTicks: (startTick?: number, endTick?: number) => void;
    setRowHeight: (h: number) => void;
    ingestMidiToCache: (
        id: string,
        data: {
            midiData: MIDIData;
            notesRaw: NoteRaw[];
            ccRaw?: CCEventRaw[];
            ticksPerQuarter: number;
            tempoMap?: TempoMapEntry[];
        }
    ) => void;
    ingestAudioToCache: (
        id: string,
        buffer: AudioBuffer,
        options?: {
            originalFile?: AudioCacheOriginalFile;
            waveform?: AudioCacheWaveform;
            skipAutoAnalysis?: boolean;
        }
    ) => void;
    rehydrateAudioSource: (id: string) => Promise<boolean>;
    ingestAudioFeatureCache: (id: string, cache: AudioFeatureCache) => void;
    invalidateAudioFeatureCachesByCalculator: (calculatorId: string, version: number) => void;
    setAudioFeatureCacheStatus: (
        id: string,
        status: AudioFeatureCacheStatusState,
        message?: string,
        progress?: AudioFeatureCacheStatusProgress | null
    ) => void;
    stopAudioFeatureAnalysis: (id: string) => void;
    restartAudioFeatureAnalysis: (id: string, analysisProfileId?: string | null, profileParams?: AudioAnalysisProfileOverrides) => void;
    reanalyzeAudioFeatureCalculators: (id: string, calculatorIds: string[], analysisProfileId?: string | null, profileParams?: AudioAnalysisProfileOverrides) => void;
    removeAudioFeatureTracks: (id: string, featureKeys: string[], analysisProfileId?: string | null) => void;
    clearAudioFeatureCache: (id: string) => void;
    clearAllTracks: () => void;
    resetTimeline: () => void;
    setHybridCacheAdapterEnabled: (enabled: boolean, reason?: string) => void;
    recordHybridCacheFallback: (event: {
        trackId: string;
        sourceId?: string;
        featureKey: string;
        reason: string;
    }) => void;
    recordTempoAlignedDiagnostics: (sourceId: string, diagnostics: TempoAlignedAdapterDiagnostics) => void;
    clearTempoAlignedDiagnostics: (sourceId?: string) => void;
    // Tempo automation actions
    enableTempoAutomation: () => void;
    disableTempoAutomation: () => void;
    addTempoKeyframe: (tick: number, bpm: number) => void;
    removeTempoKeyframe: (tick: number) => void;
    moveTempoKeyframe: (fromTick: number, toTick: number) => void;
    updateTempoKeyframeBpm: (tick: number, bpm: number) => void;
    batchSetTempoKeyframes: (keyframes: TempoKeyframe[]) => void;
    commitTempoKeyframeDrag: (fromTick: number, toTick: number) => void;
    setTempoLaneVisible: (visible: boolean) => void;
};

function computeFeatureCacheSourceHash(cache: AudioFeatureCache): string {
    return JSON.stringify({
        hopSeconds: cache.hopSeconds,
        startTimeSeconds: cache.startTimeSeconds,
        tempoProjection: cache.tempoProjection,
        frameCount: cache.frameCount,
        analysisParams: cache.analysisParams,
    });
}

const MAX_FALLBACK_LOG = 50;

function buildAudioFeatureStatus(
    previous: AudioFeatureCacheStatus | undefined,
    nextState: AudioFeatureCacheStatusState,
    message?: string,
    sourceHash?: string,
    progress?: AudioFeatureCacheStatusProgress | null
): AudioFeatureCacheStatus {
    const nextMessage = message !== undefined ? message : previous?.state === nextState ? previous?.message : undefined;
    const next: AudioFeatureCacheStatus = {
        state: nextState,
        message: nextMessage,
        sourceHash: sourceHash ?? previous?.sourceHash,
        updatedAt: Date.now(),
    };
    if (progress === null) {
        return next;
    }
    if (progress !== undefined) {
        next.progress = progress;
        return next;
    }
    if (nextState === 'pending' && previous?.state === 'pending' && previous.progress) {
        next.progress = previous.progress;
    }
    return next;
}

function markAllAudioFeatureStatuses(
    status: TimelineState['audioFeatureCacheStatus'],
    nextState: AudioFeatureCacheStatusState,
    message: string
): Record<string, AudioFeatureCacheStatus> {
    const next: Record<string, AudioFeatureCacheStatus> = { ...status };
    for (const [key, value] of Object.entries(status)) {
        next[key] = buildAudioFeatureStatus(value, nextState, message, value.sourceHash, null);
    }
    return next;
}

function updateAudioFeatureStatusEntry(
    status: TimelineState['audioFeatureCacheStatus'],
    id: string,
    nextState: AudioFeatureCacheStatusState,
    message?: string,
    sourceHash?: string,
    progress?: AudioFeatureCacheStatusProgress | null
): Record<string, AudioFeatureCacheStatus> {
    return {
        ...status,
        [id]: buildAudioFeatureStatus(status[id], nextState, message, sourceHash ?? status[id]?.sourceHash, progress),
    };
}

const activeAudioFeatureJobs = new Map<string, AudioFeatureAnalysisHandle>();
let timelineMutationGeneration = 0;

export function getTimelineMutationGeneration(): number {
    return timelineMutationGeneration;
}

export function advanceTimelineMutationGeneration(): number {
    timelineMutationGeneration += 1;
    return timelineMutationGeneration;
}

function cancelActiveAudioFeatureJob(id: string): void {
    const job = activeAudioFeatureJobs.get(id);
    if (!job) {
        return;
    }
    activeAudioFeatureJobs.delete(id);
    try {
        job.cancel();
    } catch (error) {
        console.warn(`[timelineStore] failed to cancel audio analysis job for source "${id}"`, error);
    }
}

const LARGE_AUDIO_IMPORT_BYTES = 64 * 1024 * 1024;
const LARGE_FEATURE_CACHE_BYTES = 128 * 1024 * 1024;

async function decodeAudioBytes(bytes: ArrayBuffer): Promise<AudioBuffer> {
    const AudioContextCtor =
        typeof window !== 'undefined' ? window.AudioContext || (window as any).webkitAudioContext : undefined;
    if (!AudioContextCtor) {
        throw new Error('Audio decoding is not supported in this environment.');
    }
    const ctx = new AudioContextCtor();
    try {
        return await ctx.decodeAudioData(bytes.slice(0));
    } finally {
        try {
            await ctx.close();
        } catch {
            /* ignore */
        }
    }
}

async function rehydrateAudioSourceInternal(
    id: string,
    get: () => TimelineState,
    set: (fn: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void
): Promise<boolean> {
    const entry = get().audioCache[id];
    if (!entry) return false;
    if (entry.audioBuffer) {
        set((state: TimelineState) => ({
            audioCache: {
                ...state.audioCache,
                [id]: { ...state.audioCache[id], decodedState: 'ready', decodedLastUsedAt: Date.now() },
            },
        }));
        return true;
    }
    const original = entry.originalFile;
    const inlineBytes = original?.bytes;
    let bytes: ArrayBuffer | undefined;
    if (inlineBytes) {
        const copy = new Uint8Array(inlineBytes.byteLength);
        copy.set(inlineBytes);
        bytes = copy.buffer;
    } else if (original?.assetId) {
        bytes = await AudioAssetStore.get(original.assetId);
    }
    if (!bytes) {
        set((state: TimelineState) => ({
            audioCache: state.audioCache[id]
                ? {
                      ...state.audioCache,
                      [id]: {
                          ...state.audioCache[id],
                          decodedState: 'failed',
                          decodedFailureReason: 'original asset unavailable',
                      },
                  }
                : state.audioCache,
        }));
        return false;
    }

    set((state: TimelineState) => ({
        audioCache: state.audioCache[id]
            ? {
                  ...state.audioCache,
                  [id]: { ...state.audioCache[id], decodedState: 'decoding', decodedFailureReason: undefined },
              }
            : state.audioCache,
    }));
    try {
        const buffer = await decodeAudioBytes(bytes);
        set((current: TimelineState) => {
            const existing = current.audioCache[id];
            if (!existing) return current;
            return {
                audioCache: {
                    ...current.audioCache,
                    [id]: {
                        ...existing,
                        audioBuffer: buffer,
                        sampleRate: buffer.sampleRate,
                        channels: buffer.numberOfChannels,
                        durationSeconds: buffer.duration,
                        durationSamples: buffer.length,
                        decodedState: 'ready',
                        decodedLastUsedAt: Date.now(),
                        decodedFailureReason: undefined,
                    },
                },
            } as TimelineState;
        });
        recordAudioMemoryDiagnostic({
            severity: 'info',
            stage: 'decoded-buffer-rehydrated',
            message: `Rehydrated decoded audio for ${id} (${formatBytes(estimateAudioBufferBytes(buffer))})`,
            sourceId: id,
            bytes: { decodedPcm: estimateAudioBufferBytes(buffer) },
        });
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((state: TimelineState) => ({
            audioCache: state.audioCache[id]
                ? {
                      ...state.audioCache,
                      [id]: { ...state.audioCache[id], decodedState: 'failed', decodedFailureReason: message },
                  }
                : state.audioCache,
        }));
        recordAudioMemoryDiagnostic({
            severity: 'error',
            stage: 'decoded-buffer-rehydrate-failed',
            message: `Failed to rehydrate decoded audio for ${id}: ${message}`,
            sourceId: id,
        });
        return false;
    }
}

interface ScheduleAudioFeatureAnalysisOptions {
    calculators?: string[];
    statusMessage?: string;
    mergeWithExisting?: boolean;
    analysisProfileId?: string | null;
    profileParams?: AudioAnalysisProfileOverrides;
}

function scheduleAudioFeatureAnalysis(
    sourceId: string,
    buffer: AudioBuffer,
    get: () => TimelineState,
    set: (fn: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void,
    options: ScheduleAudioFeatureAnalysisOptions = {}
): void {
    cancelActiveAudioFeatureJob(sourceId);
    if (process.env.NODE_ENV === 'test' && process.env.MVMNT_ENABLE_AUDIO_AUTO_ANALYSIS !== 'true') {
        set((state: TimelineState) => ({
            audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                state.audioFeatureCacheStatus,
                sourceId,
                'stale',
                'analysis skipped in tests',
                undefined,
                null
            ),
        }));
        return;
    }
    const snapshot = get();
    const statusMessage =
        options.statusMessage ?? (options.calculators?.length ? 'reanalysing selected features' : 'analyzing audio');
    set((state: TimelineState) => ({
        audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
            state.audioFeatureCacheStatus,
            sourceId,
            'pending',
            statusMessage,
            undefined,
            { value: 0, label: 'preparing' }
        ),
    }));
    const handle = sharedAudioFeatureAnalysisScheduler.schedule({
        audioSourceId: sourceId,
        audioBuffer: buffer,
        globalBpm: snapshot.timeline.globalBpm,
        beatsPerBar: snapshot.timeline.beatsPerBar,
        tempoMap: snapshot.timeline.masterTempoMap,
        calculators: options.calculators,
        analysisProfileId: options.analysisProfileId,
        windowSize: options.profileParams?.windowSize,
        hopSize: options.profileParams?.hopSize,
        fftSize: options.profileParams?.fftSize ?? undefined,
        onProgress: (value, label) => {
            const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
            set((state: TimelineState) => ({
                audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                    state.audioFeatureCacheStatus,
                    sourceId,
                    'pending',
                    undefined,
                    undefined,
                    { value: clamped, label }
                ),
            }));
        },
    });
    activeAudioFeatureJobs.set(sourceId, handle);
    handle.promise
        .then((cache) => {
            if (activeAudioFeatureJobs.get(sourceId) !== handle) {
                return;
            }
            activeAudioFeatureJobs.delete(sourceId);
            try {
                const existing = get().audioFeatureCaches[sourceId];
                const nextCache = options.mergeWithExisting ? mergeFeatureCaches(existing, cache) : cache;
                get().ingestAudioFeatureCache(sourceId, nextCache);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(
                    `[timelineStore] failed to ingest analyzed audio features for source "${sourceId}". ${
                        message ? `Reason: ${message}.` : ''
                    }`,
                    error
                );
                set((state: TimelineState) => ({
                    audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                        state.audioFeatureCacheStatus,
                        sourceId,
                        'failed',
                        `analysis ingest failed: ${message || 'unknown error'}`,
                        undefined,
                        null
                    ),
                }));
            }
        })
        .catch((error) => {
            if (activeAudioFeatureJobs.get(sourceId) !== handle) {
                return;
            }
            activeAudioFeatureJobs.delete(sourceId);
            if ((error as Error)?.name === 'AbortError') {
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            console.error(
                `[timelineStore] audio analysis failed for source "${sourceId}". ${
                    message ? `Reason: ${message}.` : ''
                }`,
                error
            );
            set((state: TimelineState) => ({
                audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                    state.audioFeatureCacheStatus,
                    sourceId,
                    'failed',
                    `analysis failed: ${message || 'unknown error'}`,
                    undefined,
                    null
                ),
            }));
        });
}

function createInitialTimelineSlice(): Pick<
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
            loopStartTick: Math.round(timingSecondsToTicks(DEFAULT_TIMING_CONTEXT, 2)),
            loopEndTick: Math.round(timingSecondsToTicks(DEFAULT_TIMING_CONTEXT, 5)),
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

const TEMPO_KF_TICK_TOLERANCE = 1;

function _applyTempoAutomation(get: () => TimelineState): void {
    const state = get();
    const ta = state.timeline.tempoAutomation;
    if (!ta || !ta.enabled) return;
    const derivedMap = resolveTempoKeyframes(ta.keyframes, state.timeline.globalBpm, CANONICAL_PPQ);
    state.setMasterTempoMap(derivedMap);
}

const storeImpl: StateCreator<TimelineState> = (set, get) => ({
    ...createInitialTimelineSlice(),

    async addMidiTrack(input: { name: string; file?: File; midiData?: MIDIData; offsetTicks?: number }) {
        const result = await timelineCommandGateway.dispatchById<AddTrackCommandResult>(
            'timeline.addTrack',
            {
                type: 'midi',
                name: input.name,
                file: input.file,
                midiData: input.midiData,
                offsetTicks: input.offsetTicks,
            },
            { source: 'timeline-store' }
        );
        return result.result?.trackId ?? '';
    },
    async addMidiClip(input: AddMidiClipPayload) {
        const result = await timelineCommandGateway.dispatchById<{ clipId: string }>('timeline.addMidiClip', input, {
            source: 'timeline-store',
        });
        return result.result?.clipId ?? '';
    },
    async removeMidiClips(input: RemoveMidiClipsPayload) {
        await timelineCommandGateway.dispatchById('timeline.removeMidiClips', input, { source: 'timeline-store' });
    },
    async updateMidiClip(input: UpdateMidiClipsPayload['updates'][number]) {
        await timelineCommandGateway.dispatchById(
            'timeline.updateMidiClips',
            { updates: [input] },
            { source: 'timeline-store' }
        );
    },
    async updateMidiClips(input: UpdateMidiClipsPayload) {
        await timelineCommandGateway.dispatchById('timeline.updateMidiClips', input, { source: 'timeline-store' });
    },
    async setMultipleMidiClipOffsets(input: SetMultipleMidiClipOffsetsPayload) {
        await timelineCommandGateway.dispatchById('timeline.setMultipleMidiClipOffsets', input, {
            source: 'timeline-store',
        });
    },
    async moveMidiClipsBetweenTracks(input: MoveMidiClipsBetweenTracksPayload) {
        await timelineCommandGateway.dispatchById('timeline.moveMidiClipsBetweenTracks', input, {
            source: 'timeline-store',
        });
    },
    async addAudioClip(input: AddAudioClipPayload) {
        const result = await timelineCommandGateway.dispatchById<{ clipId: string }>('timeline.addAudioClip', input, {
            source: 'timeline-store',
        });
        return result.result?.clipId ?? '';
    },
    async removeAudioClips(input: RemoveAudioClipsPayload) {
        await timelineCommandGateway.dispatchById('timeline.removeAudioClips', input, { source: 'timeline-store' });
    },
    async updateAudioClip(input: UpdateAudioClipsPayload['updates'][number]) {
        await timelineCommandGateway.dispatchById(
            'timeline.updateAudioClips',
            { updates: [input] },
            { source: 'timeline-store' },
        );
    },
    async updateAudioClips(input: UpdateAudioClipsPayload) {
        await timelineCommandGateway.dispatchById('timeline.updateAudioClips', input, { source: 'timeline-store' });
    },
    async setMultipleAudioClipOffsets(input: SetMultipleAudioClipOffsetsPayload) {
        await timelineCommandGateway.dispatchById('timeline.setMultipleAudioClipOffsets', input, {
            source: 'timeline-store',
        });
    },
    async moveAudioClipsBetweenTracks(input: MoveAudioClipsBetweenTracksPayload) {
        await timelineCommandGateway.dispatchById('timeline.moveAudioClipsBetweenTracks', input, {
            source: 'timeline-store',
        });
    },
    async addAudioTrack(input: { name: string; file?: File; buffer?: AudioBuffer; offsetTicks?: number }) {
        const result = await timelineCommandGateway.dispatchById<AddTrackCommandResult>(
            'timeline.addTrack',
            {
                type: 'audio',
                name: input.name,
                file: input.file,
                buffer: input.buffer,
                offsetTicks: input.offsetTicks,
            },
            { source: 'timeline-store' }
        );
        return result.result?.trackId ?? '';
    },

    removeTrack(id: string) {
        if (!id) return;
        const { removeTracks } = get();
        removeTracks([id]);
    },

    // Batch removal utility so multi-delete (keyboard) produces a single state update & undo snapshot.
    removeTracks(ids: string[]) {
        if (!ids || !ids.length) return;
        timelineCommandGateway
            .dispatchById('timeline.removeTracks', { trackIds: ids }, { source: 'timeline-store' })
            .then(() => {
                set((state: TimelineState) => {
                    const next = { ...state.midiPreviewTrackIds };
                    let changed = false;
                    for (const id of ids) {
                        if (next[id]) {
                            delete next[id];
                            changed = true;
                        }
                    }
                    return changed ? { midiPreviewTrackIds: next } as TimelineState : state;
                });
            })
            .catch((error) => {
                console.error('[timelineStore] removeTracks command failed', error);
            });
    },

    async updateTrack(id: string, patch: Partial<TimelineTrack>) {
        if (!id || !patch) return;
        const propertyPatch: Record<string, unknown> = {};
        if (typeof patch.name === 'string') propertyPatch.name = patch.name;
        if (typeof patch.enabled === 'boolean') propertyPatch.enabled = patch.enabled;
        if (typeof patch.mute === 'boolean') propertyPatch.mute = patch.mute;
        if (typeof patch.solo === 'boolean') propertyPatch.solo = patch.solo;
        if ('regionStartTick' in patch) propertyPatch.regionStartTick = patch.regionStartTick;
        if ('regionEndTick' in patch) propertyPatch.regionEndTick = patch.regionEndTick;

        const tasks: Array<Promise<unknown>> = [];
        if (typeof patch.offsetTicks === 'number') {
            tasks.push(
                timelineCommandGateway.dispatchById(
                    'timeline.setTrackOffsetTicks',
                    { trackId: id, offsetTicks: patch.offsetTicks },
                    { source: 'timeline-store' }
                )
            );
        }
        if (Object.keys(propertyPatch).length) {
            tasks.push(
                timelineCommandGateway.dispatchById(
                    'timeline.setTrackProperties',
                    {
                        updates: [{ trackId: id, patch: propertyPatch }],
                    },
                    { source: 'timeline-store' }
                )
            );
        }
        if (!tasks.length) return;
        try {
            await Promise.all(tasks);
        } catch (error) {
            console.error('[timelineStore] updateTrack command failed', error);
            throw error;
        }
    },
    async setTrackOffsetTicks(id: string, offsetTicks: number) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackOffsetTicks',
                { trackId: id, offsetTicks },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] setTrackOffsetTicks command failed', error);
            throw error;
        }
    },
    async setMultipleTrackOffsetTicks(offsets: Array<{ trackId: string; offsetTicks: number }>) {
        if (!offsets.length) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setMultipleTrackOffsetTicks',
                { offsets },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] setMultipleTrackOffsetTicks command failed', error);
            throw error;
        }
    },
    async setTrackRegionTicks(id: string, startTick?: number, endTick?: number) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                {
                    updates: [
                        {
                            trackId: id,
                            patch: { regionStartTick: startTick, regionEndTick: endTick },
                        },
                    ],
                },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] setTrackRegionTicks command failed', error);
            throw error;
        }
    },

    async setTrackEnabled(id: string, enabled: boolean) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { enabled } }] },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] setTrackEnabled command failed', error);
            throw error;
        }
    },

    async setTrackMute(id: string, mute: boolean) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { mute } }] },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] setTrackMute command failed', error);
            throw error;
        }
    },

    async setTrackSolo(id: string, solo: boolean) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { solo } }] },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] setTrackSolo command failed', error);
            throw error;
        }
    },
    async setTrackGain(id: string, gain: number) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { gain } }] },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] setTrackGain command failed', error);
            throw error;
        }
    },
    setMidiPreviewEnabled(id: string, enabled: boolean) {
        if (!id) return;
        set((state: TimelineState) => {
            const track = state.tracks[id];
            if (!track || track.type !== 'midi') return state;
            const isEnabled = Boolean(state.midiPreviewTrackIds[id]);
            if (isEnabled === enabled) return state;
            const midiPreviewTrackIds = { ...state.midiPreviewTrackIds };
            if (enabled) midiPreviewTrackIds[id] = true;
            else delete midiPreviewTrackIds[id];
            return { midiPreviewTrackIds } as TimelineState;
        });
    },
    toggleMidiPreview(id: string) {
        const state = get();
        state.setMidiPreviewEnabled(id, !state.midiPreviewTrackIds[id]);
    },

    setMasterTempoMap(map?: TempoMapEntry[]) {
        // When tempo map changes, recompute real-time seconds for beat-based notes in cache
        set((s: TimelineState) => {
            const next: TimelineState = { ...s } as any;
            next.timeline = { ...s.timeline, masterTempoMap: map };
            if (Object.keys(s.audioFeatureCacheStatus).length) {
                next.audioFeatureCacheStatus = markAllAudioFeatureStatuses(
                    s.audioFeatureCacheStatus,
                    'stale',
                    'tempo map updated'
                );
            }
            // Propagate tempo map to shared timing manager for immediate effect in playback clock & UI
            try {
                getSharedTimingManager().setTempoMap(map, 'seconds');
            } catch {
                /* noop */
            }
            // Notes no longer store seconds; conversions happen in selectors.
            // Audio source metadata is media time and must never be rescaled for tempo changes.
            return next;
        });
    },

    setGlobalBpm(bpm: number) {
        const v = isFinite(bpm) && bpm > 0 ? bpm : 120;
        // Update global bpm and rescale note seconds if no tempo map (uniform tempo case)
        set((s: TimelineState) => {
            const hadMap = (s.timeline.masterTempoMap?.length || 0) > 0;
            const next: TimelineState = { ...s } as any;
            next.timeline = { ...s.timeline, globalBpm: v };
            if (s.timeline.globalBpm !== v && Object.keys(s.audioFeatureCacheStatus).length) {
                next.audioFeatureCacheStatus = markAllAudioFeatureStatuses(
                    s.audioFeatureCacheStatus,
                    'stale',
                    'tempo updated'
                );
            }
            // Propagate BPM to shared timing manager so playback rate updates immediately
            try {
                getSharedTimingManager().setBPM(v);
            } catch {
                /* ignore */
            }
            // If a tempo map is present we keep its segment BPMs; only fallback bpm changes effect conversions when map empty.
            // Seconds no longer stored on notes; real-time updates occur via selectors.
            // Audio source metadata is media time and must never be rescaled for BPM changes.
            return next;
        });
    },

    setBeatsPerBar(n: number) {
        const v = Math.max(1, Math.floor(n || 4));
        set((s: TimelineState) => ({ timeline: { ...s.timeline, beatsPerBar: v } }));
    },

    setCurrentTick(tick: number, authority: 'tick' | 'seconds' | 'clock' | 'user' = 'tick') {
        set((s: TimelineState) => {
            // Behavior goals:
            // 1. While paused, passive advancement originating from the running render loop / clock.update should not move the store tick.
            // 2. Explicit repositioning (seek/loop wrap) coming from the clock authority SHOULD update even while paused (e.g. tests calling setCurrentTick(500,'clock')).
            // Implementation: if paused and authority==='clock' but tick is identical to currentTick (passive frame), ignore; otherwise apply.
            let nextTick = Math.max(0, tick);
            if (authority === 'clock' && !s.transport.isPlaying && s.transport.state === 'paused') {
                if (nextTick === s.timeline.currentTick) {
                    return { timeline: { ...s.timeline } } as TimelineState; // no-op passive frame
                }
                // Allow change-through for explicit reposition while paused.
            }
            if (
                s.transport.loopEnabled &&
                typeof s.transport.loopStartTick === 'number' &&
                typeof s.transport.loopEndTick === 'number'
            ) {
                if (nextTick > s.transport.loopEndTick) {
                    nextTick = s.transport.loopStartTick;
                }
            }
            return {
                timeline: { ...s.timeline, currentTick: nextTick, playheadAuthority: authority },
            } as TimelineState;
        });
    },

    play() {
        set((s: TimelineState) => {
            // Only apply bar quantization when entering play from a non-playing state AND not immediately after a pause.
            // Previous logic snapped on every play(), so toggling pause/play could shift the playhead forward a bar
            // (observed as a one-bar jump when pausing due to tick->seconds mirror race). We guard by detecting if
            // current tick is already aligned or if we were just playing.
            let curTick = s.timeline.currentTick;
            const wasPlaying = s.transport.isPlaying;
            const quantizeSetting = s.transport.quantize;
            if (!wasPlaying && quantizeSetting !== 'off') {
                const beatLength = quantizeSettingToBeats(quantizeSetting, s.timeline.beatsPerBar);
                const ticksPerUnit = beatLength
                    ? Math.max(1, Math.round(beatsToTicks(createTimelineTimingContext(s), beatLength)))
                    : null;
                if (!ticksPerUnit) {
                    return {
                        timeline: { ...s.timeline, currentTick: curTick },
                        transport: { ...s.transport, isPlaying: true, state: 'playing' },
                    } as TimelineState;
                }
                // Use floor so we never jump the playhead forward past the user's chosen position;
                // this eliminates the visible half-bar forward jump experienced with Math.round.
                const snapped = Math.floor(curTick / ticksPerUnit) * ticksPerUnit;
                if (snapped !== curTick) {
                    curTick = snapped;
                    // Notify runtime (VisualizerContext) to align playback clock
                    // VisualizerContext listens for 'timeline-play-snapped' and issues clock.setTick(snappedTick)
                    // ensuring the PlaybackClock fractional accumulator is cleared.
                    try {
                        window.dispatchEvent(new CustomEvent('timeline-play-snapped', { detail: { tick: curTick } }));
                    } catch {
                        /* ignore */
                    }
                }
            }
            return {
                timeline: { ...s.timeline, currentTick: curTick },
                transport: { ...s.transport, isPlaying: true, state: 'playing' },
            } as TimelineState;
        });
    },
    pause() {
        set((s: TimelineState) => ({ transport: { ...s.transport, isPlaying: false, state: 'paused' } }));
    },
    togglePlay() {
        const wasPlaying = get().transport.isPlaying;
        // Resume from the current playhead position; do NOT jump to view start.
        // This preserves the user's last seek/paused position when starting playback.
        set((s: TimelineState) => ({
            transport: { ...s.transport, isPlaying: !wasPlaying, state: !wasPlaying ? 'playing' : 'paused' },
        }));
    },
    seekTick(tick: number) {
        set((s: TimelineState) => ({
            timeline: { ...s.timeline, currentTick: Math.max(0, tick), playheadAuthority: 'user' },
            transport: { ...s.transport, isPlaying: false, state: s.transport.isPlaying ? 'paused' : 'seeking' },
        }));
    },
    scrubTick(tick: number) {
        get().setCurrentTick(tick, 'user');
    },

    setRate(rate: number) {
        const r = isFinite(rate) && rate > 0 ? rate : 1.0;
        set((s: TimelineState) => ({ transport: { ...s.transport, rate: r } }));
    },

    setQuantize(q: QuantizeSetting) {
        const allowed: QuantizeSetting[] = [
            'off',
            'bar',
            'quarter',
            'quarter-triplet',
            'eighth',
            'eighth-triplet',
            'sixteenth',
            'sixteenth-triplet',
            'thirty-second',
            'sixty-fourth',
            'arbitrary',
        ];
        const next = allowed.includes(q) ? q : 'off';
        set((s: TimelineState) => ({ transport: { ...s.transport, quantize: next } }));
    },

    setArbitrarySnapN(n: number) {
        const safe = Number.isFinite(n) && n >= 1 ? Math.round(n) : 8;
        set((s: TimelineState) => ({ transport: { ...s.transport, arbitrarySnapN: safe } }));
    },

    setAdaptiveSnap(v: boolean) {
        set((s: TimelineState) => ({ transport: { ...s.transport, adaptiveSnap: v } }));
    },

    setAutoKeying(v: boolean) {
        set((s: TimelineState) => ({ transport: { ...s.transport, autoKeying: v } }));
    },

    setLoopEnabled(enabled: boolean) {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: enabled } }));
    },
    setLoopRangeTicks(startTick?: number, endTick?: number) {
        set((s: TimelineState) => ({
            transport: {
                ...s.transport,
                loopStartTick: startTick ?? s.transport.loopStartTick,
                loopEndTick: endTick ?? s.transport.loopEndTick,
            },
        }));
    },

    toggleLoop() {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: !s.transport.loopEnabled } }));
    },

    async reorderTracks(order: string[]) {
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.reorderTracks',
                { order },
                { source: 'timeline-store' }
            );
        } catch (error) {
            console.error('[timelineStore] reorderTracks command failed', error);
            throw error;
        }
    },

    setTimelineViewTicks(startTick: number, endTick: number) {
        const MIN = 1; // at least 1 tick
        let sT = Math.min(startTick, endTick);
        let eT = Math.max(startTick, endTick);
        if (eT - sT < MIN) eT = sT + MIN;
        set(() => ({ timelineView: { startTick: sT, endTick: eT } }));
    },

    _setClipGroupDrag(drag) {
        set(() => ({ _clipGroupDrag: drag }));
    },

    _setCrossTrackDrag(drag) {
        set(() => ({ _crossTrackDrag: drag }));
    },

    ingestMidiToCache(
        id: string,
        data: {
            midiData: MIDIData;
            notesRaw: NoteRaw[];
            ccRaw?: CCEventRaw[];
            ticksPerQuarter: number;
            tempoMap?: TempoMapEntry[];
        }
    ) {
        // Update cache; convert beat-based canonical timing to seconds according to current tempo context
        set((s: TimelineState) => {
            const timing = createTimelineTimingContext(s);
            const notes = data.notesRaw.map((n) => {
                if (n.startBeat !== undefined && n.endBeat !== undefined) {
                    const startSec = beatsToSecondsContext(timing, n.startBeat);
                    const endSec = beatsToSecondsContext(timing, n.endBeat);
                    return { ...n, startTime: startSec, endTime: endSec, duration: Math.max(0, endSec - startSec) };
                }
                return n;
            });
            // Sort by startTick for binary search in selectNotesInWindow
            notes.sort((a, b) => a.startTick - b.startTick);
            // Pre-compute bounds to avoid full scans for range queries
            let bounds: MidiCacheBounds | undefined;
            if (notes.length > 0) {
                let minTick = Infinity,
                    maxTick = -Infinity,
                    minNote = 127,
                    maxNote = 0,
                    maxDurationTicks = 0;
                for (const n of notes) {
                    if (n.startTick < minTick) minTick = n.startTick;
                    if (n.endTick > maxTick) maxTick = n.endTick;
                    if (n.note < minNote) minNote = n.note;
                    if (n.note > maxNote) maxNote = n.note;
                    if (n.durationTicks > maxDurationTicks) maxDurationTicks = n.durationTicks;
                }
                bounds = {
                    minTick: isFinite(minTick) ? minTick : 0,
                    maxTick: isFinite(maxTick) ? maxTick : 0,
                    minNote: isFinite(minNote) ? minNote : 0,
                    maxNote: isFinite(maxNote) ? maxNote : 127,
                    maxDurationTicks,
                };
            }
            return {
                midiCache: { ...s.midiCache, [id]: { ...data, notesRaw: notes, ccRaw: data.ccRaw ?? [], bounds } },
                tracks:
                    s.tracks[id]?.type === 'midi' &&
                    Array.isArray((s.tracks[id] as TimelineTrack).clips) &&
                    (s.tracks[id] as TimelineTrack).clips?.length === 0 &&
                    !(s.tracks[id] as TimelineTrack).midiSourceId
                        ? {
                              ...s.tracks,
                              [id]: {
                                  ...(s.tracks[id] as TimelineTrack),
                                  midiSourceId: id,
                                  clips: [
                                      {
                                          id: `${id}__clip`,
                                          type: 'midi',
                                          sourceId: id,
                                          offsetTicks: (s.tracks[id] as TimelineTrack).offsetTicks ?? 0,
                                          name: s.tracks[id].name,
                                          enabled: true,
                                      },
                                  ],
                              },
                          }
                        : s.tracks,
            } as TimelineState;
        });
        // Now that notes are available, attempt auto adjust (if not user-defined)
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch (error) {
            console.error('[timelineStore] failed to auto adjust playback range after ingesting MIDI cache', error);
        }
    },
    ingestAudioToCache(
        id: string,
        buffer: AudioBuffer,
        options?: { originalFile?: AudioCacheOriginalFile; waveform?: AudioCacheWaveform; skipAutoAnalysis?: boolean }
    ) {
        cancelActiveAudioFeatureJob(id);
        try {
            set((s: TimelineState) => {
                const existingTrack = s.tracks[id] as AudioTrack | undefined;
                const updates: Partial<TimelineState> = {
                    audioCache: {
                        ...s.audioCache,
                        [id]: {
                            audioBuffer: buffer,
                            sampleRate: buffer.sampleRate,
                            channels: buffer.numberOfChannels,
                            durationSeconds: buffer.duration,
                            durationSamples: buffer.length,
                            originalFile: options?.originalFile,
                            waveform: options?.waveform,
                            decodedState: 'ready',
                            decodedLastUsedAt: Date.now(),
                        },
                    },
                    tracks:
                        existingTrack?.type === 'audio'
                            ? {
                                  ...s.tracks,
                                  [id]: {
                                      ...existingTrack,
                                      clips:
                                          (existingTrack.clips?.length ?? 0) === 0
                                              ? [
                                                    {
                                                        id: `${id}__audio_clip`,
                                                        type: 'audio',
                                                        sourceId: id,
                                                        offsetTicks: 0,
                                                        name: existingTrack.name,
                                                        enabled: true,
                                                    },
                                                ]
                                              : existingTrack.clips ?? [],
                                  },
                              }
                            : s.tracks,
                };
                const existingStatus = s.audioFeatureCacheStatus[id];
                const preserveReadyStatus = Boolean(options?.skipAutoAnalysis && existingStatus?.state === 'ready');
                const statusMessage =
                    (options?.originalFile?.byteLength ?? 0) >= LARGE_AUDIO_IMPORT_BYTES
                        ? 'analysis deferred for large audio import'
                        : 'analysis not started';
                updates.audioFeatureCacheStatus = preserveReadyStatus
                    ? { ...s.audioFeatureCacheStatus }
                    : updateAudioFeatureStatusEntry(
                          s.audioFeatureCacheStatus,
                          id,
                          'idle',
                          statusMessage,
                          undefined,
                          null
                      );
                return updates as TimelineState;
            });
            const sourceRetainedBytes =
                estimateAudioBufferBytes(buffer) +
                (options?.originalFile?.bytes?.byteLength ?? 0) +
                (options?.waveform?.channelPeaks?.byteLength ?? 0);
            const memorySummary = summarizeAudioMemory(get().audioCache, get().audioFeatureCaches);
            recordAudioMemoryDiagnostic({
                severity: sourceRetainedBytes >= 512 * 1024 * 1024 || memorySummary.retainedAudioBytes >= 1.5 * 1024 * 1024 * 1024 ? 'warning' : 'info',
                stage: 'audio-cache-ingest',
                message: `Cached source ${id}; source retained ${formatBytes(sourceRetainedBytes)}, project retained audio ${formatBytes(memorySummary.retainedAudioBytes)}`,
                sourceId: id,
                bytes: {
                    decodedPcm: estimateAudioBufferBytes(buffer),
                    originalFile: options?.originalFile?.bytes?.byteLength,
                    externalOriginalFile: options?.originalFile?.assetId ? options.originalFile.byteLength : undefined,
                    waveform: options?.waveform?.channelPeaks?.byteLength,
                    retainedAudio: memorySummary.retainedAudioBytes,
                    browserHeapUsed: memorySummary.browserHeapUsedBytes,
                    browserHeapLimit: memorySummary.browserHeapLimitBytes,
                },
            });
            // Kick off async peak extraction (non-blocking)
            (async () => {
                try {
                    const { extractPeaksAsync } = await import('@audio/waveform/peak-extractor');
                    const res = await extractPeaksAsync(buffer, { binSize: 1024, maxBins: 5000 });
                    set((s: TimelineState) => {
                        const existing = s.audioCache[id];
                        if (!existing || existing.waveform?.channelPeaks) {
                            return { audioCache: s.audioCache } as TimelineState;
                        }
                        const waveform: AudioCacheWaveform = {
                            version: 1,
                            channelPeaks: res.peaks,
                            sampleStep: res.binSize ?? Math.max(1, Math.floor(buffer.length / res.peaks.length) || 1),
                        };
                        return {
                            audioCache: {
                                ...s.audioCache,
                                [id]: { ...existing, waveform },
                            },
                        } as TimelineState;
                    });
                    recordAudioMemoryDiagnostic({
                        severity: 'info',
                        stage: 'waveform-cache-ready',
                        message: `Waveform peaks cached for ${id} (${formatBytes(res.peaks.byteLength)})`,
                        sourceId: id,
                        bytes: { waveform: res.peaks.byteLength },
                    });
                } catch (error) {
                    console.warn(
                        `[timelineStore] waveform peak extraction failed for source "${id}". Waveform preview will be skipped`,
                        error
                    );
                }
            })();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(
                `[timelineStore] failed to ingest audio buffer for source "${id}". ${
                    message ? `Reason: ${message}.` : ''
                } Check the original audio file and try importing again.`,
                error
            );
            try {
                set((state: TimelineState) => ({
                    audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                        state.audioFeatureCacheStatus,
                        id,
                        'failed',
                        `ingest failed: ${message || 'unknown error'}`,
                        undefined,
                        null
                    ),
                }));
            } catch (statusError) {
                console.error(
                    `[timelineStore] failed to update audio feature status after ingest error for source "${id}"`,
                    statusError
                );
            }
        }
    },

    async rehydrateAudioSource(id: string) {
        return rehydrateAudioSourceInternal(id, get, set);
    },

    ingestAudioFeatureCache(id: string, cache: AudioFeatureCache) {
        cancelActiveAudioFeatureJob(id);
        if (cache.version !== 3 && cache.version !== 4) {
            throw new Error(`Unsupported audio feature cache version: ${cache.version}`);
        }
        const normalized: AudioFeatureCache = {
            ...cache,
            version: 4,
            featureTracks: { ...cache.featureTracks },
            analysisProfiles: cache.analysisProfiles ? { ...cache.analysisProfiles } : undefined,
            channelLayout: cache.channelLayout ? { ...cache.channelLayout, aliases: cache.channelLayout.aliases?.slice() } : cache.channelLayout,
        };
        const sourceHash = computeFeatureCacheSourceHash(normalized);
        set((s: TimelineState) => ({
            audioFeatureCaches: {
                ...s.audioFeatureCaches,
                [id]: normalized,
            },
            audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                s.audioFeatureCacheStatus,
                id,
                'ready',
                undefined,
                sourceHash,
                null
            ),
        }));
        const memorySummary = summarizeAudioMemory(get().audioCache, get().audioFeatureCaches);
        const cacheBytes = estimateFeatureCacheBytes(normalized);
        recordAudioMemoryDiagnostic({
            severity: cacheBytes >= LARGE_FEATURE_CACHE_BYTES || memorySummary.featureCacheBytes >= 512 * 1024 * 1024 ? 'warning' : 'info',
            stage: 'feature-cache-ingest',
            message: `Feature cache updated for ${id}; cache ${formatBytes(cacheBytes)}, feature payloads now ${formatBytes(memorySummary.featureCacheBytes)}`,
            sourceId: id,
            bytes: {
                featureCache: cacheBytes,
                featureCacheTotal: memorySummary.featureCacheBytes,
                retainedAudio: memorySummary.retainedAudioBytes,
            },
        });
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },

    invalidateAudioFeatureCachesByCalculator(calculatorId: string, version: number) {
        if (!calculatorId) {
            return;
        }
        set((s: TimelineState) => {
            let mutated = false;
            const nextStatus = { ...s.audioFeatureCacheStatus };
            for (const [sourceId, cache] of Object.entries(s.audioFeatureCaches)) {
                const tracks = Object.values(cache.featureTracks || {});
                const hasMismatch = tracks.some(
                    (track) => track.calculatorId === calculatorId && track.version !== version
                );
                if (!hasMismatch) {
                    continue;
                }
                mutated = true;
                const previous = nextStatus[sourceId];
                const sourceHash = previous?.sourceHash ?? computeFeatureCacheSourceHash(cache);
                nextStatus[sourceId] = buildAudioFeatureStatus(
                    previous,
                    'stale',
                    'calculator updated',
                    sourceHash,
                    null
                );
            }
            if (!mutated) {
                return s;
            }
            return { audioFeatureCacheStatus: nextStatus } as TimelineState;
        });
    },

    setAudioFeatureCacheStatus(
        id: string,
        status: AudioFeatureCacheStatusState,
        message?: string,
        progress?: AudioFeatureCacheStatusProgress | null
    ) {
        set((s: TimelineState) => ({
            audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                s.audioFeatureCacheStatus,
                id,
                status,
                message,
                undefined,
                progress
            ),
        }));
    },

    stopAudioFeatureAnalysis(id: string) {
        const hadJob = activeAudioFeatureJobs.has(id);
        cancelActiveAudioFeatureJob(id);
        set((s: TimelineState) => {
            const existing = s.audioFeatureCacheStatus[id];
            if (!existing && !hadJob) {
                return s;
            }
            return {
                audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                    s.audioFeatureCacheStatus,
                    id,
                    'idle',
                    hadJob || existing?.state === 'pending' ? 'analysis stopped' : existing?.message,
                    undefined,
                    null
                ),
            };
        });
    },

    restartAudioFeatureAnalysis(id: string, analysisProfileId?: string | null, profileParams?: AudioAnalysisProfileOverrides) {
        const buffer = get().audioCache[id]?.audioBuffer;
        if (!buffer) {
            void rehydrateAudioSourceInternal(id, get, set).then((ready) => {
                const nextBuffer = get().audioCache[id]?.audioBuffer;
                if (ready && nextBuffer) {
                    scheduleAudioFeatureAnalysis(id, nextBuffer, get, set, { analysisProfileId, profileParams });
                    return;
                }
                set((s: TimelineState) => ({
                    audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                        s.audioFeatureCacheStatus,
                        id,
                        'failed',
                        'no audio buffer available',
                        undefined,
                        null
                    ),
                }));
            });
            return;
        }
        scheduleAudioFeatureAnalysis(id, buffer, get, set, { analysisProfileId, profileParams });
    },

    reanalyzeAudioFeatureCalculators(id: string, calculatorIds: string[], analysisProfileId?: string | null, profileParams?: AudioAnalysisProfileOverrides) {
        const unique = Array.from(new Set((calculatorIds || []).filter((entry): entry is string => !!entry)));
        if (!unique.length) {
            return;
        }
        const buffer = get().audioCache[id]?.audioBuffer;
        if (!buffer) {
            void rehydrateAudioSourceInternal(id, get, set).then((ready) => {
                const nextBuffer = get().audioCache[id]?.audioBuffer;
                if (ready && nextBuffer) {
                    scheduleAudioFeatureAnalysis(id, nextBuffer, get, set, {
                        calculators: unique,
                        statusMessage: unique.length === 1 ? 'reanalysing feature track' : 'reanalysing feature tracks',
                        mergeWithExisting: true,
                        analysisProfileId,
                        profileParams,
                    });
                    return;
                }
                set((s: TimelineState) => ({
                    audioFeatureCacheStatus: updateAudioFeatureStatusEntry(
                        s.audioFeatureCacheStatus,
                        id,
                        'failed',
                        'no audio buffer available',
                        undefined,
                        null
                    ),
                }));
            });
            return;
        }
        const statusMessage = unique.length === 1 ? 'reanalysing feature track' : 'reanalysing feature tracks';
        scheduleAudioFeatureAnalysis(id, buffer, get, set, {
            calculators: unique,
            statusMessage,
            mergeWithExisting: true,
            analysisProfileId,
            profileParams,
        });
    },

    removeAudioFeatureTracks(id: string, featureKeys: string[], analysisProfileId?: string | null) {
        const unique = Array.from(new Set((featureKeys || []).filter((key): key is string => Boolean(key?.trim()))));
        if (!unique.length) {
            return;
        }
        const requestedProfile = sanitizeAnalysisProfileId(analysisProfileId);
        const strictProfileMatching = Boolean(requestedProfile && requestedProfile !== DEFAULT_ANALYSIS_PROFILE_ID);
        set((s: TimelineState) => {
            const cache = s.audioFeatureCaches[id];
            if (!cache) {
                return s;
            }
            const nextTracks = { ...cache.featureTracks };
            let mutated = false;
            for (const key of unique) {
                const { key: resolvedKey } = resolveFeatureTrackFromCache(
                    { featureTracks: nextTracks, defaultAnalysisProfileId: cache.defaultAnalysisProfileId },
                    key,
                    {
                        analysisProfileId: requestedProfile,
                        strictProfileMatching,
                    }
                );
                if (resolvedKey && nextTracks[resolvedKey]) {
                    delete nextTracks[resolvedKey];
                    mutated = true;
                }
            }
            if (!mutated) {
                return s;
            }
            const remainingKeys = Object.keys(nextTracks);
            if (!remainingKeys.length) {
                const nextCaches = { ...s.audioFeatureCaches };
                delete nextCaches[id];
                const nextStatus = { ...s.audioFeatureCacheStatus };
                delete nextStatus[id];
                return {
                    audioFeatureCaches: nextCaches,
                    audioFeatureCacheStatus: nextStatus,
                } as TimelineState;
            }
            return {
                audioFeatureCaches: {
                    ...s.audioFeatureCaches,
                    [id]: {
                        ...cache,
                        featureTracks: nextTracks,
                    },
                },
            } as TimelineState;
        });
    },

    clearAudioFeatureCache(id: string) {
        cancelActiveAudioFeatureJob(id);
        set((s: TimelineState) => {
            if (!s.audioFeatureCaches[id] && !s.audioFeatureCacheStatus[id]) {
                return s;
            }
            const nextCaches = { ...s.audioFeatureCaches };
            delete nextCaches[id];
            const nextStatus = { ...s.audioFeatureCacheStatus };
            delete nextStatus[id];
            return {
                ...s,
                audioFeatureCaches: nextCaches,
                audioFeatureCacheStatus: nextStatus,
            } as TimelineState;
        });
    },

    clearAllTracks() {
        advanceTimelineMutationGeneration();
        for (const key of Array.from(activeAudioFeatureJobs.keys())) {
            cancelActiveAudioFeatureJob(key);
        }
        set((s: TimelineState) => ({
            tracks: {},
            tracksOrder: [],
            midiCache: {},
            audioCache: {},
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
            tempoAlignedDiagnostics: {},
            midiPreviewTrackIds: {},
            hybridCacheRollout: {
                adapterEnabled: s.hybridCacheRollout.adapterEnabled,
                fallbackLog: [],
            },
        }));
        useSelectionStore.getState().clearSelection('tracks');
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch (error) {
            console.error('[timelineStore] failed to auto adjust playback range after clearing tracks', error);
        }
    },

    resetTimeline() {
        advanceTimelineMutationGeneration();
        for (const key of Array.from(activeAudioFeatureJobs.keys())) {
            cancelActiveAudioFeatureJob(key);
        }
        const initial = createInitialTimelineSlice();
        set(() => initial);
        try {
            const tm = getSharedTimingManager();
            tm.setBPM(initial.timeline.globalBpm || 120);
            tm.setTempoMap(undefined, 'seconds');
        } catch (error) {
            console.error('[timelineStore] failed to reset shared timing manager', error);
        }
    },

    setHybridCacheAdapterEnabled(enabled: boolean, reason?: string) {
        set((s: TimelineState) => {
            const nextLog = [...s.hybridCacheRollout.fallbackLog];
            if (reason) {
                nextLog.push({
                    trackId: '__system__',
                    featureKey: '__toggle__',
                    sourceId: undefined,
                    reason,
                    timestamp: Date.now(),
                });
            }
            while (nextLog.length > MAX_FALLBACK_LOG) {
                nextLog.shift();
            }
            return {
                hybridCacheRollout: {
                    adapterEnabled: enabled,
                    fallbackLog: nextLog,
                },
            } as TimelineState;
        });
    },

    recordHybridCacheFallback(event: { trackId: string; sourceId?: string; featureKey: string; reason: string }) {
        if (!event || !event.reason) {
            return;
        }
        set((s: TimelineState) => {
            const entry: HybridCacheFallbackEvent = {
                ...event,
                timestamp: Date.now(),
            };
            const nextLog = [...s.hybridCacheRollout.fallbackLog, entry];
            while (nextLog.length > MAX_FALLBACK_LOG) {
                nextLog.shift();
            }
            return {
                hybridCacheRollout: {
                    adapterEnabled: s.hybridCacheRollout.adapterEnabled,
                    fallbackLog: nextLog,
                },
            } as TimelineState;
        });
    },

    recordTempoAlignedDiagnostics(sourceId: string, diagnostics: TempoAlignedAdapterDiagnostics) {
        if (!sourceId) return;
        set((s: TimelineState) => ({
            tempoAlignedDiagnostics: {
                ...s.tempoAlignedDiagnostics,
                [sourceId]: diagnostics,
            },
        }));
    },

    clearTempoAlignedDiagnostics(sourceId?: string) {
        set((s: TimelineState) => {
            if (!sourceId) {
                if (!Object.keys(s.tempoAlignedDiagnostics).length) {
                    return s;
                }
                return { tempoAlignedDiagnostics: {} } as TimelineState;
            }
            if (!s.tempoAlignedDiagnostics[sourceId]) {
                return s;
            }
            const next = { ...s.tempoAlignedDiagnostics };
            delete next[sourceId];
            return { tempoAlignedDiagnostics: next } as TimelineState;
        });
    },

    setPlaybackRangeTicks(startTick?: number, endTick?: number) {
        set(() => ({
            playbackRange: {
                startTick: typeof startTick === 'number' ? Math.max(0, startTick) : undefined,
                endTick: typeof endTick === 'number' ? Math.max(0, endTick) : undefined,
            },
        }));
    },
    setPlaybackRangeExplicitTicks(startTick?: number, endTick?: number) {
        set(() => ({
            playbackRange: {
                startTick: typeof startTick === 'number' ? Math.max(0, startTick) : undefined,
                endTick: typeof endTick === 'number' ? Math.max(0, endTick) : undefined,
            },
            playbackRangeUserDefined: true,
        }));
    },

    setRowHeight(h: number) {
        const minH = 16;
        const maxH = 160;
        const v = Math.max(minH, Math.min(maxH, Math.floor(h)));
        set(() => ({ rowHeight: v }));
    },

    // ── Tempo automation actions ──

    enableTempoAutomation() {
        const currentBpm = get().timeline.globalBpm || 120;
        set(
            (s: TimelineState) =>
                ({
                    timeline: {
                        ...s.timeline,
                        tempoAutomation: {
                            enabled: true,
                            keyframes: [{ tick: 0, bpm: currentBpm }],
                        },
                    },
                }) as any
        );
        _applyTempoAutomation(get);
    },

    disableTempoAutomation() {
        set(
            (s: TimelineState) =>
                ({
                    timeline: {
                        ...s.timeline,
                        tempoAutomation: {
                            enabled: false,
                            keyframes: [],
                        },
                    },
                }) as any
        );
        get().setMasterTempoMap(undefined);
    },

    addTempoKeyframe(tick: number, bpm: number) {
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            const existing = ta.keyframes.findIndex((kf) => Math.abs(kf.tick - tick) <= TEMPO_KF_TICK_TOLERANCE);
            let next: TempoKeyframe[];
            if (existing >= 0) {
                next = [...ta.keyframes];
                next[existing] = { tick, bpm };
            } else {
                next = [...ta.keyframes, { tick, bpm }].sort((a, b) => a.tick - b.tick);
            }
            return {
                timeline: {
                    ...s.timeline,
                    tempoAutomation: { ...ta, keyframes: next },
                },
            } as any;
        });
        _applyTempoAutomation(get);
    },

    removeTempoKeyframe(tick: number) {
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            const next = ta.keyframes.filter((kf) => Math.abs(kf.tick - tick) > TEMPO_KF_TICK_TOLERANCE);
            return {
                timeline: {
                    ...s.timeline,
                    tempoAutomation: { ...ta, keyframes: next },
                },
            } as any;
        });
        _applyTempoAutomation(get);
    },

    moveTempoKeyframe(fromTick: number, toTick: number) {
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            const idx = ta.keyframes.findIndex((kf) => Math.abs(kf.tick - fromTick) <= TEMPO_KF_TICK_TOLERANCE);
            if (idx < 0) return s;
            const next = [...ta.keyframes];
            next[idx] = { ...next[idx], tick: toTick };
            next.sort((a, b) => a.tick - b.tick);
            return {
                timeline: {
                    ...s.timeline,
                    tempoAutomation: { ...ta, keyframes: next },
                },
            } as any;
        });
        _applyTempoAutomation(get);
    },

    updateTempoKeyframeBpm(tick: number, bpm: number) {
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            const idx = ta.keyframes.findIndex((kf) => Math.abs(kf.tick - tick) <= TEMPO_KF_TICK_TOLERANCE);
            if (idx < 0) return s;
            const next = [...ta.keyframes];
            next[idx] = { ...next[idx], bpm };
            return {
                timeline: {
                    ...s.timeline,
                    tempoAutomation: { ...ta, keyframes: next },
                },
            } as any;
        });
        _applyTempoAutomation(get);
    },

    batchSetTempoKeyframes(keyframes: TempoKeyframe[]) {
        const sorted = [...keyframes].sort((a, b) => a.tick - b.tick);
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            return {
                timeline: {
                    ...s.timeline,
                    tempoAutomation: { ...ta, keyframes: sorted },
                },
            } as any;
        });
        _applyTempoAutomation(get);
    },

    commitTempoKeyframeDrag(fromTick: number, toTick: number) {
        get().moveTempoKeyframe(fromTick, toTick);
    },

    setTempoLaneVisible(visible: boolean) {
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            return {
                timeline: {
                    ...s.timeline,
                    tempoAutomation: { ...ta, laneVisible: visible },
                },
            } as any;
        });
    },
});

export const useTimelineStore = createWithEqualityFn<TimelineState>(storeImpl);
(window as any).timelineStore = useTimelineStore;

export const devZustand = (store: any, name: string) => {
    let _window = window as any;
    if (process.env.NODE_ENV === 'development') {
        _window.store = _window.store || {};
        _window.store.getters = _window.store.getters || {};
        _window.store.getters[name] = () => store.getState();
        _window.store.setters = _window.store.setters || {};
        _window.store.setters[name] = (state: any) => store.setState(state);
    }
};

devZustand(useTimelineStore, 'timeline');

// Convenience shallow selector hook re-export (optional for consumers)
export const useTimelineStoreShallow = <T>(selector: (s: TimelineState) => T) => useTimelineStore(selector, shallow);

export const timelineCommandGateway = createTimelineCommandGateway({
    getState: () => useTimelineStore.getState(),
    setState: (updater) => useTimelineStore.setState(updater as any),
});

export function dispatchTimelineCommandDescriptor<TResult = void>(
    descriptor: TimelineSerializedCommandDescriptor
): Promise<TimelineCommandDispatchResult<TResult>> {
    return timelineCommandGateway.dispatchDescriptor<TResult>(descriptor);
}
