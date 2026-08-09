import { type StateCreator } from 'zustand';
import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import type { MIDIData } from '@core/types';
import type { AudioTrack, AudioCacheEntry, AudioCacheOriginalFile, AudioCacheWaveform } from '@audio/audioTypes';
import {
    estimateAudioBufferBytes,
    estimateFeatureCacheBytes,
    formatBytes,
    summarizeAudioMemory,
} from '@audio/audioMemoryDiagnostics';
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
import { onAudioFeatureCalculatorRegistered } from '@audio/features/audioFeatureRegistry';
import {
    DEFAULT_ANALYSIS_PROFILE_ID,
    resolveFeatureTrackFromCache,
    sanitizeAnalysisProfileId,
} from '@audio/features/featureTrackIdentity';
import type { TempoMapEntry, NoteRaw, CCEventRaw, MidiCacheBounds } from '@state/timelineTypes';
import type { TempoKeyframe } from '@core/timing/types';
import { resolveTempoKeyframes } from '@core/timing/tempo-automation-resolver';
import { CANONICAL_PPQ } from '@core/timing/ppq';
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
import type { HybridCacheFallbackEvent, TimelineState, TimelineTrack } from './timeline/storeTypes';
import { createInitialTimelineSlice } from './timeline/storeComposition';
import { createClearedTimelinePersistenceState } from './timeline/persistenceAdapter';
import { applyTempoAutomation } from './timeline/transportTiming';
import { createTransportSlice } from './timeline/transportSlice';
import { createViewSlice } from './timeline/viewSlice';

export type { HybridCacheFallbackEvent, TimelineState, TimelineTrack } from './timeline/storeTypes';

export { getSharedTimingManager, sharedTimingManager } from './timeline/timelineShared';

// Timeline base types
// Types are now in timelineTypes.ts

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

const TEMPO_KF_TICK_TOLERANCE = 1;

const storeImpl: StateCreator<TimelineState> = (set, get) => ({
    ...createInitialTimelineSlice(),
    ...createTransportSlice({ set, get, markAllAudioFeatureStatuses }),
    ...createViewSlice(set),

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
            { source: 'timeline-store' }
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
                    return changed ? ({ midiPreviewTrackIds: next } as TimelineState) : state;
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
                                              : (existingTrack.clips ?? []),
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
                severity:
                    sourceRetainedBytes >= 512 * 1024 * 1024 ||
                    memorySummary.retainedAudioBytes >= 1.5 * 1024 * 1024 * 1024
                        ? 'warning'
                        : 'info',
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
            channelLayout: cache.channelLayout
                ? { ...cache.channelLayout, aliases: cache.channelLayout.aliases?.slice() }
                : cache.channelLayout,
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
            severity:
                cacheBytes >= LARGE_FEATURE_CACHE_BYTES || memorySummary.featureCacheBytes >= 512 * 1024 * 1024
                    ? 'warning'
                    : 'info',
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

    restartAudioFeatureAnalysis(
        id: string,
        analysisProfileId?: string | null,
        profileParams?: AudioAnalysisProfileOverrides
    ) {
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

    reanalyzeAudioFeatureCalculators(
        id: string,
        calculatorIds: string[],
        analysisProfileId?: string | null,
        profileParams?: AudioAnalysisProfileOverrides
    ) {
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
        set((state: TimelineState) => createClearedTimelinePersistenceState(state));
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
                            laneVisible: s.timeline.tempoAutomation?.laneVisible ?? true,
                            // Re-enabling is non-destructive: retain the user's map if one exists.
                            keyframes: s.timeline.tempoAutomation?.keyframes.length
                                ? s.timeline.tempoAutomation.keyframes
                                : [{ tick: 0, bpm: currentBpm }],
                        },
                    },
                }) as any
        );
        applyTempoAutomation(get);
    },

    disableTempoAutomation() {
        set(
            (s: TimelineState) =>
                ({
                    timeline: {
                        ...s.timeline,
                        tempoAutomation: {
                            enabled: false,
                            // Disabling only bypasses the map. Resetting it is an explicit action.
                            keyframes: s.timeline.tempoAutomation?.keyframes ?? [],
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
        applyTempoAutomation(get);
    },

    removeTempoKeyframe(tick: number) {
        // The Bar 1 point is the required base tempo for an enabled map.
        if (Math.abs(tick) <= TEMPO_KF_TICK_TOLERANCE) return;
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
        applyTempoAutomation(get);
    },

    moveTempoKeyframe(fromTick: number, toTick: number) {
        if (Math.abs(fromTick) <= TEMPO_KF_TICK_TOLERANCE) return;
        if (Math.abs(fromTick - toTick) > TEMPO_KF_TICK_TOLERANCE) {
            const occupied = get().timeline.tempoAutomation?.keyframes.some(
                (kf) => Math.abs(kf.tick - toTick) <= TEMPO_KF_TICK_TOLERANCE
            );
            if (occupied) return;
        }
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
        applyTempoAutomation(get);
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
        applyTempoAutomation(get);
    },

    updateTempoKeyframe(fromTick: number, next: { tick: number; bpm: number }) {
        if (!Number.isFinite(fromTick) || !Number.isFinite(next.tick) || !Number.isFinite(next.bpm)) return false;
        const targetTick = Math.max(0, Math.round(next.tick));
        const targetBpm = Math.max(1, Math.min(999, next.bpm));
        const current = get().timeline.tempoAutomation?.keyframes ?? [];
        const idx = current.findIndex((kf) => Math.abs(kf.tick - fromTick) <= TEMPO_KF_TICK_TOLERANCE);
        if (idx < 0) return false;
        if (Math.abs(fromTick) <= TEMPO_KF_TICK_TOLERANCE && targetTick !== 0) return false;
        const collision = current.some(
            (kf, i) => i !== idx && Math.abs(kf.tick - targetTick) <= TEMPO_KF_TICK_TOLERANCE
        );
        if (collision) return false;
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            const keyframes = [...ta.keyframes];
            const pointIndex = keyframes.findIndex((kf) => Math.abs(kf.tick - fromTick) <= TEMPO_KF_TICK_TOLERANCE);
            if (pointIndex < 0) return s;
            keyframes[pointIndex] = { tick: targetTick, bpm: targetBpm };
            keyframes.sort((a, b) => a.tick - b.tick);
            return { timeline: { ...s.timeline, tempoAutomation: { ...ta, keyframes } } } as any;
        });
        applyTempoAutomation(get);
        return true;
    },

    batchSetTempoKeyframes(keyframes: TempoKeyframe[]) {
        const byTick = new Map<number, TempoKeyframe>();
        keyframes.forEach((kf) =>
            byTick.set(Math.max(0, Math.round(kf.tick)), { tick: Math.max(0, Math.round(kf.tick)), bpm: kf.bpm })
        );
        const sorted = [...byTick.values()].sort((a, b) => a.tick - b.tick);
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            return {
                timeline: {
                    ...s.timeline,
                    tempoAutomation: { ...ta, keyframes: sorted },
                },
            } as any;
        });
        applyTempoAutomation(get);
    },

    commitTempoKeyframeDrag(fromTick: number, toTick: number) {
        get().moveTempoKeyframe(fromTick, toTick);
    },

    resetTempoAutomationChanges() {
        set((s: TimelineState) => {
            const ta = s.timeline.tempoAutomation ?? { enabled: false, keyframes: [] };
            const base = ta.keyframes.find((kf) => Math.abs(kf.tick) <= TEMPO_KF_TICK_TOLERANCE) ?? {
                tick: 0,
                bpm: s.timeline.globalBpm || 120,
            };
            return {
                timeline: { ...s.timeline, tempoAutomation: { ...ta, keyframes: [{ tick: 0, bpm: base.bpm }] } },
            } as any;
        });
        applyTempoAutomation(get);
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
onAudioFeatureCalculatorRegistered((calculator) => {
    useTimelineStore.getState().invalidateAudioFeatureCachesByCalculator(calculator.id, calculator.version);
});
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
