import type { TimelineState } from '@state/timelineStore';
import type { TimelineClipRef } from '@state/selectionStore';
import type { AudioTrack } from '@audio/audioTypes';
import { getAudioClipTimelineBounds, getAudioClipsForTrack } from '@state/timeline/audioClips';
import type { MidiClip } from '@state/timeline/midiClips';
import { getMidiClipTimelineBounds } from '@state/timeline/midiClips';
import { createTimingContext } from '@state/timelineTime';

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

/** Absolute [start, end) of a clip for overlap checks; null when unmeasurable. */
function clipSpan(
    state: TimelineState,
    kind: 'midi' | 'audio',
    trackId: string,
    clipId: string
): { start: number; end: number } | null {
    const track = state.tracks[trackId];
    if (!track) return null;
    if (kind === 'midi') {
        const clip = (track as { clips?: MidiClip[] } | undefined)?.clips?.find((c) => c.id === clipId);
        if (!clip) return null;
        const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
        if (!bounds) return null;
        return { start: bounds.startTick, end: bounds.endTick };
    }
    const clip = getAudioClipsForTrack(track as AudioTrack).find((c) => c.id === clipId);
    if (!clip) return null;
    const timing = createTimingContext(state.timeline);
    const bounds = getAudioClipTimelineBounds(state.audioCache, clip, timing);
    if (!bounds) return null;
    return { start: bounds.startTick, end: bounds.endTick };
}

/**
 * Clamp a desired group delta so no moved clip overlaps a non-group clip.
 * Each entry contributes its feasible interval; the group takes the
 * intersection. Base state is assumed non-overlapping, so 0 is feasible.
 */
export function clampDragDelta(
    state: TimelineState,
    entries: DragGroupEntry[],
    targets: Map<string, string>,
    desiredDelta: number
): number {
    let low = Number.NEGATIVE_INFINITY;
    let high = Number.POSITIVE_INFINITY;
    for (const entry of entries) {
        const targetTrackId = targets.get(`${entry.trackId}:${entry.clipId}`) ?? entry.trackId;
        // Only clamp same-track moves: a clip changing tracks keeps the drop
        // command's overlap resolution as its backstop.
        if (targetTrackId !== entry.trackId) continue;
        const targetTrack = state.tracks[targetTrackId];
        if (!targetTrack) continue;
        const span = clipSpan(state, entry.kind, entry.trackId, entry.clipId);
        if (!span) continue;
        const length = span.end - span.start;
        if (!(length > 0)) continue;
        const offset = entry.offsetTicks;
        const groupIds = new Set(entries.filter((e) => e.trackId === targetTrackId).map((e) => e.clipId));
        const siblings: Array<{ start: number; end: number }> = [];
        const clips =
            entry.kind === 'midi'
                ? ((targetTrack as { clips?: MidiClip[] }).clips ?? [])
                : getAudioClipsForTrack(targetTrack as AudioTrack);
        for (const clip of clips) {
            if (groupIds.has(clip.id)) continue;
            const bounds = clipSpan(state, entry.kind, targetTrackId, clip.id);
            if (bounds && bounds.end > bounds.start) siblings.push(bounds);
        }
        let entryLow = Number.NEGATIVE_INFINITY;
        let entryHigh = Number.POSITIVE_INFINITY;
        for (const sibling of siblings) {
            if (sibling.end <= offset) {
                // Sibling fully behind: moving left must stop at its end.
                entryLow = Math.max(entryLow, sibling.end - offset);
            } else if (sibling.start >= offset + length) {
                // Sibling fully ahead: moving right must stop at its start.
                entryHigh = Math.min(entryHigh, sibling.start - offset - length);
            }
            // Straddling siblings only exist if base state already overlaps;
            // the drop command's overlap resolution stays the backstop there.
        }
        low = Math.max(low, entryLow);
        high = Math.min(high, entryHigh);
    }
    if (desiredDelta < 0) return Math.max(desiredDelta, low === Number.NEGATIVE_INFINITY ? desiredDelta : low);
    return Math.min(desiredDelta, high === Number.POSITIVE_INFINITY ? desiredDelta : high);
}

function entryKey(entry: DragGroupEntry): string {
    return `${entry.trackId}:${entry.clipId}`;
}

/** Build live previews for every grouped clip; each entry keeps its own track kind. */
export function buildDragPreviews(
    state: TimelineState,
    entries: DragGroupEntry[],
    trackDelta: number,
    horizontalDelta: number
): DragPreview[] {
    const targets = new Map<string, string>();
    for (const entry of entries) {
        const targetTrackId = nearestTrackOfKind(state, entry.kind, entry.trackIndex, trackDelta);
        if (targetTrackId) targets.set(entryKey(entry), targetTrackId);
    }
    return buildPreviewsOnTargets(state, entries, targets, horizontalDelta);
}

function buildPreviewsOnTargets(
    state: TimelineState,
    entries: DragGroupEntry[],
    targets: Map<string, string>,
    horizontalDelta: number
): DragPreview[] {
    const previews: DragPreview[] = [];
    for (const entry of entries) {
        const targetTrackId = targets.get(entryKey(entry));
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

/**
 * Full per-move plan: resolve each entry's target track, clamp the desired
 * delta against non-group siblings, then build previews at the clamped delta.
 */
export function planDragMove(
    state: TimelineState,
    entries: DragGroupEntry[],
    trackDelta: number,
    desiredDelta: number
): { delta: number; previews: DragPreview[] } {
    const targets = new Map<string, string>();
    for (const entry of entries) {
        const targetTrackId = nearestTrackOfKind(state, entry.kind, entry.trackIndex, trackDelta);
        if (targetTrackId) targets.set(entryKey(entry), targetTrackId);
    }
    const delta = clampDragDelta(state, entries, targets, desiredDelta);
    return { delta, previews: buildPreviewsOnTargets(state, entries, targets, delta) };
}
