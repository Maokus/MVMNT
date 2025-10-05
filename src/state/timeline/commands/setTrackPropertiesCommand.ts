import type { AudioTrack } from '@audio/audioTypes';
import type { TimelineState, TimelineTrack } from '../../timelineStore';
import type { TimelineCommand } from '../commandTypes';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import { type TimelineTrackLike, type TimelineCommandPatch } from '../patches';

type TrackPropertyPatch = Partial<
    Pick<TimelineTrack, 'name' | 'enabled' | 'mute' | 'solo' | 'regionStartTick' | 'regionEndTick'>
> &
    Partial<Pick<AudioTrack, 'gain'>>;

export interface SetTrackPropertiesUpdate {
    trackId: string;
    patch: TrackPropertyPatch;
}

export interface SetTrackPropertiesPayload {
    updates: SetTrackPropertiesUpdate[];
}

interface TrackDiff {
    trackId: string;
    apply: TrackPropertyPatch;
    revert: TrackPropertyPatch;
}

function clampGain(value: unknown): number {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : 1;
    return Math.max(0, Math.min(2, num));
}

function buildPatch(track: TimelineTrackLike, patch: TrackPropertyPatch): TrackPropertyPatch | undefined {
    const next: TrackPropertyPatch = {};
    let changed = false;

    if (typeof patch.name === 'string' && patch.name !== track.name) {
        next.name = patch.name;
        changed = true;
    }

    if (typeof patch.enabled === 'boolean' && patch.enabled !== track.enabled) {
        next.enabled = patch.enabled;
        changed = true;
    }

    if (typeof patch.mute === 'boolean' && patch.mute !== track.mute) {
        next.mute = patch.mute;
        changed = true;
    }

    if (typeof patch.solo === 'boolean' && patch.solo !== track.solo) {
        next.solo = patch.solo;
        changed = true;
    }

    if ('regionStartTick' in patch) {
        const value = typeof patch.regionStartTick === 'number' && Number.isFinite(patch.regionStartTick)
            ? patch.regionStartTick
            : undefined;
        if (value !== track.regionStartTick) {
            next.regionStartTick = value;
            changed = true;
        }
    }

    if ('regionEndTick' in patch) {
        const value = typeof patch.regionEndTick === 'number' && Number.isFinite(patch.regionEndTick)
            ? patch.regionEndTick
            : undefined;
        if (value !== track.regionEndTick) {
            next.regionEndTick = value;
            changed = true;
        }
    }

    if ('gain' in patch) {
        if (track.type !== 'audio') {
            return undefined;
        }
        const value = clampGain(patch.gain);
        if ((track as AudioTrack).gain !== value) {
            next.gain = value;
            changed = true;
        }
    }

    return changed ? next : undefined;
}

function buildRevertPatch(track: TimelineTrackLike, apply: TrackPropertyPatch): TrackPropertyPatch {
    const revert: TrackPropertyPatch = {};
    for (const key of Object.keys(apply) as Array<keyof TrackPropertyPatch>) {
        (revert as any)[key] = (track as any)[key];
    }
    return revert;
}

function collectDiffs(state: TimelineState, payload: SetTrackPropertiesPayload): TrackDiff[] {
    const diffs: TrackDiff[] = [];
    for (const update of payload.updates ?? []) {
        if (!update?.trackId || !update.patch) continue;
        const track = state.tracks[update.trackId];
        if (!track) continue;
        const patch = buildPatch(track as TimelineTrackLike, update.patch);
        if (!patch || !Object.keys(patch).length) continue;
        const revert = buildRevertPatch(track as TimelineTrackLike, patch);
        diffs.push({ trackId: update.trackId, apply: patch, revert });
    }
    return diffs;
}

function applyDiffs(context: TimelineCommandContext, diffs: TrackDiff[]): void {
    if (!diffs.length) return;
    context.setState((state) => {
        let nextTracks = state.tracks;
        let mutated = false;
        for (const diff of diffs) {
            const existing = nextTracks[diff.trackId] ?? state.tracks[diff.trackId];
            if (!existing) continue;
            if (!mutated) {
                nextTracks = { ...state.tracks };
                mutated = true;
            }
            nextTracks[diff.trackId] = { ...existing, ...diff.apply } as TimelineTrackLike;
        }
        if (!mutated) return state;
        return { tracks: nextTracks } as TimelineState;
    });
}

function buildPatchPayload(diffs: TrackDiff[]): TimelineCommandPatch {
    if (!diffs.length) {
        return { undo: [], redo: [] };
    }
    return {
        redo: [
            {
                action: 'timeline/UPDATE_TRACKS',
                payload: {
                    updates: diffs.map((diff) => ({ trackId: diff.trackId, patch: diff.apply })),
                },
            },
        ],
        undo: [
            {
                action: 'timeline/UPDATE_TRACKS',
                payload: {
                    updates: diffs.map((diff) => ({ trackId: diff.trackId, patch: diff.revert })),
                },
            },
        ],
    };
}

export function createSetTrackPropertiesCommand(
    payload: SetTrackPropertiesPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    return {
        id: 'timeline.setTrackProperties',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.setTrackProperties',
                undoLabel: 'Update Track Properties',
                telemetryEvent: 'timeline_set_track_properties',
            },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            const state = context.getState();
            const diffs = collectDiffs(state, payload);
            applyDiffs(context, diffs);
            const patch = buildPatchPayload(diffs);
            return { patches: patch };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}
