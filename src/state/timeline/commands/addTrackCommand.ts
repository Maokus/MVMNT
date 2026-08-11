import type { AudioClip, AudioTrack, AudioCacheOriginalFile } from '@audio/audioTypes';
import type { MIDIData } from '@core/types';
import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
import { parseMIDIFileToData } from '@core/midi/midi-library';
import type { TimelineTrack } from '../../timelineStore';
import type { TimelineCommand } from '../commandTypes';
import { makeTimelineTrackId, autoAdjustSceneRangeIfNeeded } from '../timelineShared';
import {
    type TimelineCommandPatch,
    type TimelinePatchAddTrackPayload,
    type TimelinePatchAction,
    type TimelinePatchRemoveTracksPayload,
    type TimelineTrackLike,
} from '../patches';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import { useSelectionStore } from '@state/selectionStore';
import type { MidiClip } from '../midiClips';
import { estimateAudioBufferBytes, estimateFeatureCacheBytes, formatBytes } from '@audio/audioMemoryDiagnostics';
import { recordAudioMemoryDiagnostic } from '@state/audioMemoryDiagnosticsStore';
import { AudioAssetStore, createAudioAssetId } from '@persistence/audio-asset-store';

export type AddTrackCommandPayload =
    | {
          type: 'midi';
          name: string;
          midiData?: MIDIData;
          file?: File;
          offsetTicks?: number;
          clipName?: string;
          trackId?: string;
      }
    | {
          type: 'audio';
          name: string;
          buffer?: AudioBuffer;
          file?: File;
          offsetTicks?: number;
          clipName?: string;
          trackId?: string;
      };

export interface AddTrackCommandResult {
    trackId: string;
}

function ensureWindowEvent(context: TimelineCommandContext, trackId: string): void {
    try {
        context.emitWindowEvent('timeline-track-added', { trackId });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[timeline][command] failed to emit track event', error);
        }
    }
}

function buildInitialMidiClip(trackId: string, name: string, offsetTicks: number): MidiClip {
    return {
        id: `${trackId}__clip`,
        type: 'midi',
        sourceId: trackId,
        offsetTicks,
        name,
        enabled: true,
    };
}

function buildInitialAudioClip(trackId: string, name: string, offsetTicks: number): AudioClip {
    return {
        id: `${trackId}__audio_clip`,
        type: 'audio',
        sourceId: trackId,
        offsetTicks,
        name,
        enabled: true,
    };
}

async function ingestMidiSource(
    context: TimelineCommandContext,
    trackId: string,
    payload: { midiData?: MIDIData; file?: File; clipName?: string }
): Promise<void> {
    const store = context.getState();
    if (payload.midiData) {
        const ingested = buildNotesFromMIDI(payload.midiData);
        store.ingestMidiToCache(trackId, ingested);
        context.setState((state) => ({
            tracks: {
                ...state.tracks,
                [trackId]: {
                    ...state.tracks[trackId],
                    midiSourceId: trackId,
                    clips: [
                        buildInitialMidiClip(
                            trackId,
                            payload.clipName ?? state.tracks[trackId]?.name ?? 'MIDI Track',
                            (state.tracks[trackId] as TimelineTrack)?.offsetTicks ?? 0
                        ),
                    ],
                } as TimelineTrack,
            },
        }));
        return;
    }
    if (payload.file) {
        try {
            const midiData = await parseMIDIFileToData(payload.file);
            const ingested = buildNotesFromMIDI(midiData);
            context.getState().ingestMidiToCache(trackId, ingested);
            context.setState((state) => ({
                tracks: {
                    ...state.tracks,
                    [trackId]: {
                        ...state.tracks[trackId],
                        midiSourceId: trackId,
                        clips: [
                            buildInitialMidiClip(
                                trackId,
                                payload.clipName ?? state.tracks[trackId]?.name ?? 'MIDI Track',
                                (state.tracks[trackId] as TimelineTrack)?.offsetTicks ?? 0
                            ),
                        ],
                    } as TimelineTrack,
                },
            }));
        } catch (error) {
            console.warn('[timeline][command] midi ingestion failed', error);
        }
    }
}

interface PreparedAudioSource {
    buffer: AudioBuffer;
    originalFile?: AudioCacheOriginalFile;
}

const INLINE_ORIGINAL_FILE_LIMIT_BYTES = 16 * 1024 * 1024;
const LARGE_UNDO_FEATURE_CACHE_BYTES = 32 * 1024 * 1024;

function buildUndoAudioCacheEntry(
    cache: import('@audio/audioTypes').AudioCacheEntry
): import('@audio/audioTypes').AudioCacheEntry {
    const { audioBuffer: _audioBuffer, ...rest } = cache;
    return {
        ...rest,
        decodedState: cache.audioBuffer ? 'failed' : (cache.decodedState ?? 'failed'),
        decodedFailureReason: cache.audioBuffer
            ? 'decoded buffer omitted from undo payload'
            : cache.decodedFailureReason,
    };
}

async function prepareAudioSource(payload: { buffer?: AudioBuffer; file?: File }): Promise<PreparedAudioSource> {
    if (payload.buffer) {
        recordAudioMemoryDiagnostic({
            severity: 'info',
            stage: 'decode-skip',
            message: `Using provided AudioBuffer (${formatBytes(estimateAudioBufferBytes(payload.buffer))} decoded PCM)`,
            bytes: { decodedPcm: estimateAudioBufferBytes(payload.buffer) },
        });
        return { buffer: payload.buffer };
    }
    if (payload.file) {
        const startedAt = performance.now();
        recordAudioMemoryDiagnostic({
            severity: 'info',
            stage: 'file-read-start',
            message: `Reading ${payload.file.name} (${formatBytes(payload.file.size)})`,
            fileName: payload.file.name,
            bytes: { file: payload.file.size },
        });
        const arrayBuffer = await payload.file.arrayBuffer();
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextCtor) {
            throw new Error('Audio decoding is not supported in this environment.');
        }
        const ctx = new AudioContextCtor();
        try {
            const decodeStartedAt = performance.now();
            const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
            const decodedPcmBytes = estimateAudioBufferBytes(decoded);
            let originalFile: AudioCacheOriginalFile;
            if (arrayBuffer.byteLength > INLINE_ORIGINAL_FILE_LIMIT_BYTES) {
                const assetId = createAudioAssetId('audio-original');
                const storage = await AudioAssetStore.put(assetId, arrayBuffer);
                originalFile = {
                    name: payload.file.name,
                    mimeType: payload.file.type || 'application/octet-stream',
                    byteLength: arrayBuffer.byteLength,
                    assetId,
                    storage,
                    bytes: storage === 'memory' ? new Uint8Array(arrayBuffer) : undefined,
                };
                recordAudioMemoryDiagnostic({
                    severity: storage === 'indexeddb' ? 'info' : 'warning',
                    stage: 'original-asset-store',
                    message:
                        storage === 'indexeddb'
                            ? `Stored original bytes for ${payload.file.name} outside Zustand`
                            : `Stored original bytes for ${payload.file.name} in memory fallback`,
                    fileName: payload.file.name,
                    bytes: { originalFile: arrayBuffer.byteLength },
                });
            } else {
                originalFile = {
                    name: payload.file.name,
                    mimeType: payload.file.type || 'application/octet-stream',
                    bytes: new Uint8Array(arrayBuffer),
                    byteLength: arrayBuffer.byteLength,
                    storage: 'inline',
                };
            }
            recordAudioMemoryDiagnostic({
                severity: decodedPcmBytes + arrayBuffer.byteLength >= 512 * 1024 * 1024 ? 'warning' : 'info',
                stage: 'decode-complete',
                message: `Decoded ${payload.file.name}: ${formatBytes(decodedPcmBytes)} PCM plus ${formatBytes(arrayBuffer.byteLength)} original bytes ${originalFile.storage === 'indexeddb' ? 'asset-referenced' : 'retained'}`,
                fileName: payload.file.name,
                bytes: {
                    file: arrayBuffer.byteLength,
                    decodedPcm: decodedPcmBytes,
                    retainedAudio:
                        decodedPcmBytes +
                        (originalFile.bytes?.byteLength ??
                            (originalFile.storage === 'indexeddb' ? 0 : arrayBuffer.byteLength)),
                },
                durationMs: performance.now() - decodeStartedAt,
            });
            recordAudioMemoryDiagnostic({
                severity: 'info',
                stage: 'import-file-prepared',
                message: `Prepared ${payload.file.name} for cache insertion`,
                fileName: payload.file.name,
                bytes: {
                    file: arrayBuffer.byteLength,
                    decodedPcm: decodedPcmBytes,
                    retainedAudio:
                        decodedPcmBytes +
                        (originalFile.bytes?.byteLength ??
                            (originalFile.storage === 'indexeddb' ? 0 : arrayBuffer.byteLength)),
                },
                durationMs: performance.now() - startedAt,
            });
            return { buffer: decoded, originalFile };
        } finally {
            try {
                await ctx.close();
            } catch {
                /* ignore */
            }
        }
    }
    throw new Error('No audio source provided.');
}

function ingestAudioSource(context: TimelineCommandContext, trackId: string, source: PreparedAudioSource): void {
    context
        .getState()
        .ingestAudioToCache(
            trackId,
            source.buffer,
            source.originalFile ? { originalFile: source.originalFile } : undefined
        );
}

function buildRedoPayload(
    context: TimelineCommandContext,
    trackId: string,
    previousSelection: string[]
): TimelinePatchAddTrackPayload {
    const state = context.getState();
    const track = state.tracks[trackId] as TimelineTrackLike;
    const index = state.tracksOrder.indexOf(trackId);
    const payload: TimelinePatchAddTrackPayload = {
        track,
        index,
        selection: previousSelection,
    };
    if (track.type === 'midi') {
        const key = track.midiSourceId ?? trackId;
        const cache = state.midiCache[key];
        if (cache) {
            payload.midiCache = { key, value: cache };
        }
    } else if (track.type === 'audio') {
        const audioTrack = track as AudioTrack;
        const key = audioTrack.clips?.[0]?.sourceId ?? trackId;
        const cache = state.audioCache[key];
        if (cache) payload.audioCache = { key, value: buildUndoAudioCacheEntry(cache) };
        const featureCache = state.audioFeatureCaches?.[key];
        if (featureCache && estimateFeatureCacheBytes(featureCache) <= LARGE_UNDO_FEATURE_CACHE_BYTES) {
            payload.audioFeatureCache = { key, value: featureCache };
        }
    }
    return payload;
}

function buildUndoPayload(
    context: TimelineCommandContext,
    trackId: string,
    previousSelection: string[]
): TimelinePatchRemoveTracksPayload {
    const state = context.getState();
    const track = state.tracks[trackId] as TimelineTrackLike | undefined;
    const midiCacheKeys: string[] = [];
    const audioCacheKeys: string[] = [];
    const audioFeatureCacheKeys: string[] = [];
    if (track?.type === 'midi') {
        const key = track.midiSourceId ?? trackId;
        if (state.midiCache[key]) {
            midiCacheKeys.push(key);
        }
    } else if (track?.type === 'audio') {
        const audioTrack = track as AudioTrack;
        const key = audioTrack.clips?.[0]?.sourceId ?? trackId;
        if (state.audioCache[key]) {
            audioCacheKeys.push(key);
        }
        if (state.audioFeatureCaches?.[key]) {
            audioFeatureCacheKeys.push(key);
        }
    }
    return {
        trackIds: [trackId],
        midiCacheKeys: midiCacheKeys.length ? midiCacheKeys : undefined,
        audioCacheKeys: audioCacheKeys.length ? audioCacheKeys : undefined,
        audioFeatureCacheKeys: audioFeatureCacheKeys.length ? audioFeatureCacheKeys : undefined,
        selection: previousSelection,
    };
}

export function createAddTrackCommand(
    payload: AddTrackCommandPayload,
    metadataOverride?: TimelineCommand['metadata']
): TimelineCommand<AddTrackCommandResult> {
    const id = payload.trackId ?? makeTimelineTrackId(payload.type === 'audio' ? 'aud' : 'trk');
    return {
        id: 'timeline.addTrack',
        mode: 'serial',
        metadata: metadataOverride ?? {
            commandId: 'timeline.addTrack',
            undoLabel: 'Add Track',
            telemetryEvent: 'timeline_add_track',
        },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<AddTrackCommandResult>> {
            const previousSelection = useSelectionStore.getState().selectedTrackIds;
            if (payload.type === 'midi') {
                const track: TimelineTrack = {
                    id,
                    name: payload.name || 'MIDI Track',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [],
                    offsetTicks: payload.offsetTicks ?? 0,
                };
                context.setState((state) => ({
                    tracks: { ...state.tracks, [id]: track },
                    tracksOrder: [...state.tracksOrder, id],
                }));
                await ingestMidiSource(context, id, {
                    midiData: payload.midiData,
                    file: payload.file,
                    clipName: payload.clipName,
                });
            } else {
                let prepared: PreparedAudioSource;
                try {
                    prepared = await prepareAudioSource({ buffer: payload.buffer, file: payload.file });
                } catch (error) {
                    console.warn('[timeline][command] audio ingestion failed', error);
                    throw error instanceof Error ? error : new Error('Audio ingestion failed');
                }
                const track: AudioTrack = {
                    id,
                    name: payload.name || 'Audio Track',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [
                        buildInitialAudioClip(
                            id,
                            (payload.clipName ?? payload.name) || 'Audio Track',
                            payload.offsetTicks ?? 0
                        ),
                    ],
                    gain: 1,
                };
                context.setState((state) => ({
                    tracks: { ...state.tracks, [id]: track },
                    tracksOrder: [...state.tracksOrder, id],
                }));
                ingestAudioSource(context, id, prepared);
            }
            autoAdjustSceneRangeIfNeeded(context.getState, context.setState);
            ensureWindowEvent(context, id);
            const redoPayload = buildRedoPayload(context, id, previousSelection);
            const undoPayload = buildUndoPayload(context, id, previousSelection);
            const patch: TimelineCommandPatch = {
                redo: [
                    {
                        action: 'timeline/ADD_TRACK',
                        payload: redoPayload,
                    },
                ],
                undo: [
                    {
                        action: 'timeline/REMOVE_TRACKS',
                        payload: undoPayload,
                    },
                ],
            };
            return {
                patches: patch,
                result: { trackId: id },
            };
        },
        async undo(_context: TimelineCommandContext, patch: TimelineCommandPatch): Promise<TimelinePatchAction[]> {
            return patch.undo;
        },
        async redo(_context: TimelineCommandContext, patch: TimelineCommandPatch): Promise<TimelinePatchAction[]> {
            return patch.redo;
        },
    };
}
