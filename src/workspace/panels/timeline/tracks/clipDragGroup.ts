import type { TimelineState } from '@state/timelineStore';
import type { TimelineClipRef } from '@state/selectionStore';
import type { AudioTrack } from '@audio/audioTypes';
import { getAudioClipsForTrack } from '@state/timeline/audioClips';
import type { MidiClip } from '@state/timeline/midiClips';

/** One selected clip captured at drag start, shared by MIDI and audio drag paths. */
export interface DragGroupEntry {
    trackId: string;
    clipId: string;
    kind: 'midi' | 'audio';
    offsetTicks: number;
    trackIndex: number;
}

/** Live move preview per grouped clip. Extra audio fields ride along for ghost rendering. */
export interface DragPreview {
    kind: 'midi' | 'audio';
    clipId: string;
    sourceTrackId: string;
    targetTrackId: string;
    previewOffsetTicks: number;
    sourceId: string;
    regionStartTick?: number;
    regionEndTick?: number;
    sourceStartSeconds?: number;
    sourceEndSeconds?: number;
}

function kindOf(state: TimelineState, ref: TimelineClipRef): 'midi' | 'audio' | null {
    if (ref.kind) return ref.kind;
    const track = state.tracks[ref.trackId];
    return track?.type === 'midi' || track?.type === 'audio' ? track.type : null;
}

/** Resolve selection refs to draggable entries across MIDI and audio tracks. */
export function resolveDragGroup(state: TimelineState, refs: TimelineClipRef[]): DragGroupEntry[] {
    const entries: DragGroupEntry[] = [];
    for (const ref of refs) {
        const kind = kindOf(state, ref);
        if (!kind) continue;
        const track = state.tracks[ref.trackId];
        if (!track || track.type !== kind) continue;
        const targetClip =
            kind === 'midi'
                ? (track as { clips?: MidiClip[] } | undefined)?.clips?.find((candidate) => candidate.id === ref.clipId)
                : getAudioClipsForTrack(track as AudioTrack).find((candidate) => candidate.id === ref.clipId);
        if (!targetClip) continue;
        entries.push({
            trackId: ref.trackId,
            clipId: ref.clipId,
            kind,
            offsetTicks: targetClip.offsetTicks,
            trackIndex: state.tracksOrder.indexOf(ref.trackId),
        });
    }
    return entries;
}

function nearestTrackOfKind(
    state: TimelineState,
    kind: 'midi' | 'audio',
    trackIndex: number,
    trackDelta: number
): string | null {
    const newTrackIndex = trackIndex + trackDelta;
    const clampedIndex = Math.max(0, Math.min(state.tracksOrder.length - 1, newTrackIndex));
    const candidate = state.tracksOrder[clampedIndex];
    if (candidate && state.tracks[candidate]?.type === kind) return candidate;
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const id of state.tracksOrder) {
        if (state.tracks[id]?.type !== kind) continue;
        const distance = Math.abs(state.tracksOrder.indexOf(id) - newTrackIndex);
        if (distance < bestDistance) {
            best = id;
            bestDistance = distance;
        }
    }
    return best;
}

/** Build live previews for every grouped clip; each entry keeps its own track kind. */
export function buildDragPreviews(
    state: TimelineState,
    entries: DragGroupEntry[],
    trackDelta: number,
    horizontalDelta: number
): DragPreview[] {
    const previews: DragPreview[] = [];
    for (const entry of entries) {
        const targetTrackId = nearestTrackOfKind(state, entry.kind, entry.trackIndex, trackDelta);
        if (!targetTrackId) continue;
        const track = state.tracks[entry.trackId];
        if (entry.kind === 'midi') {
            const targetClip = (track as { clips?: MidiClip[] } | undefined)?.clips?.find(
                (candidate) => candidate.id === entry.clipId
            );
            previews.push({
                kind: 'midi',
                clipId: entry.clipId,
                sourceTrackId: entry.trackId,
                targetTrackId,
                previewOffsetTicks: entry.offsetTicks + horizontalDelta,
                sourceId: targetClip?.sourceId ?? '',
                regionStartTick: targetClip?.regionStartTick,
                regionEndTick: targetClip?.regionEndTick,
            });
        } else {
            const targetClip = track
                ? getAudioClipsForTrack(track as AudioTrack).find((c) => c.id === entry.clipId)
                : undefined;
            previews.push({
                kind: 'audio',
                clipId: entry.clipId,
                sourceTrackId: entry.trackId,
                targetTrackId,
                previewOffsetTicks: entry.offsetTicks + horizontalDelta,
                sourceId: targetClip?.sourceId ?? '',
                sourceStartSeconds: targetClip?.sourceStartSeconds,
                sourceEndSeconds: targetClip?.sourceEndSeconds,
            });
        }
    }
    return previews.filter((preview) => !!preview.sourceId);
}
