import type { AudioTrack, AudioCacheOriginalFile } from '@audio/audioTypes';
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

export type AddTrackCommandPayload =
    | {
          type: 'midi';
          name: string;
          midiData?: MIDIData;
          file?: File;
          offsetTicks?: number;
          trackId?: string;
      }
    | {
          type: 'audio';
          name: string;
          buffer?: AudioBuffer;
          file?: File;
          offsetTicks?: number;
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

async function ingestMidiSource(
    context: TimelineCommandContext,
    trackId: string,
    payload: { midiData?: MIDIData; file?: File }
): Promise<void> {
    const store = context.getState();
    if (payload.midiData) {
        const ingested = buildNotesFromMIDI(payload.midiData);
        store.ingestMidiToCache(trackId, ingested);
        context.setState((state) => ({
            tracks: {
                ...state.tracks,
                [trackId]: { ...state.tracks[trackId], midiSourceId: trackId } as TimelineTrack,
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
                    [trackId]: { ...state.tracks[trackId], midiSourceId: trackId } as TimelineTrack,
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

async function prepareAudioSource(payload: { buffer?: AudioBuffer; file?: File }): Promise<PreparedAudioSource> {
    if (payload.buffer) {
        return { buffer: payload.buffer };
    }
    if (payload.file) {
        const arrayBuffer = await payload.file.arrayBuffer();
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextCtor) {
            throw new Error('Audio decoding is not supported in this environment.');
        }
        const ctx = new AudioContextCtor();
        try {
            const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
            const originalFile: AudioCacheOriginalFile = {
                name: payload.file.name,
                mimeType: payload.file.type || 'application/octet-stream',
                bytes: new Uint8Array(arrayBuffer),
                byteLength: arrayBuffer.byteLength,
            };
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
        const key = audioTrack.audioSourceId ?? trackId;
        const cache = state.audioCache[key];
        if (cache) {
            payload.audioCache = { key, value: cache };
        }
        const featureCache = state.audioFeatureCaches?.[key];
        if (featureCache) {
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
        const key = audioTrack.audioSourceId ?? trackId;
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
            const previousSelection = context.getState().selection.selectedTrackIds;
            if (payload.type === 'midi') {
                const track: TimelineTrack = {
                    id,
                    name: payload.name || 'MIDI Track',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: payload.offsetTicks ?? 0,
                };
                context.setState((state) => ({
                    tracks: { ...state.tracks, [id]: track },
                    tracksOrder: [...state.tracksOrder, id],
                }));
                await ingestMidiSource(context, id, { midiData: payload.midiData, file: payload.file });
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
                    offsetTicks: payload.offsetTicks ?? 0,
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
