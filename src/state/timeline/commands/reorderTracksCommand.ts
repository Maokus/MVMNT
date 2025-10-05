import type { TimelineState } from '../../timelineStore';
import type { TimelineCommand } from '../commandTypes';
import type { TimelineCommandContext, TimelineCommandExecuteResult } from '../commandTypes';
import type { TimelineCommandPatch } from '../patches';

export interface ReorderTracksPayload {
    order: string[];
}

function sanitizeOrder(state: TimelineState, order: string[]): string[] {
    const unique = new Set<string>();
    const next: string[] = [];
    for (const id of order ?? []) {
        if (!id || unique.has(id) || !state.tracks[id]) continue;
        unique.add(id);
        next.push(id);
    }
    for (const id of state.tracksOrder) {
        if (!unique.has(id)) {
            unique.add(id);
            next.push(id);
        }
    }
    return next;
}

function buildPatch(previous: string[], next: string[]): TimelineCommandPatch {
    if (previous.length === next.length && previous.every((id, idx) => id === next[idx])) {
        return { undo: [], redo: [] };
    }
    return {
        redo: [
            { action: 'timeline/SET_TRACK_ORDER', payload: { order: next } },
        ],
        undo: [
            { action: 'timeline/SET_TRACK_ORDER', payload: { order: previous } },
        ],
    };
}

export function createReorderTracksCommand(
    payload: ReorderTracksPayload,
    metadataOverride?: TimelineCommand['metadata'],
): TimelineCommand<void> {
    return {
        id: 'timeline.reorderTracks',
        mode: 'serial',
        metadata:
            metadataOverride ?? {
                commandId: 'timeline.reorderTracks',
                undoLabel: 'Reorder Tracks',
                telemetryEvent: 'timeline_reorder_tracks',
            },
        async execute(context: TimelineCommandContext): Promise<TimelineCommandExecuteResult<void>> {
            const state = context.getState();
            const previous = state.tracksOrder;
            const next = sanitizeOrder(state, payload.order ?? []);
            if (previous.length === next.length && previous.every((id, idx) => id === next[idx])) {
                return { patches: { undo: [], redo: [] } };
            }
            context.setState(() => ({ tracksOrder: next } as TimelineState));
            return { patches: buildPatch(previous, next) };
        },
        async undo(_context, patch) {
            return patch.undo;
        },
        async redo(_context, patch) {
            return patch.redo;
        },
    };
}
