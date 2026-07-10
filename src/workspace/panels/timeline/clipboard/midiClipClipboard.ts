import type { TimelineState } from '@state/timelineStore';
import { getMidiClipsForTrack, makeMidiClipId, type MidiClip } from '@state/timeline/midiClips';
import type { SelectedTimelineClip } from '@state/selectionStore';

export type MidiClipClipboard = {
    kind: 'mvmnt.midi-clips';
    version: 1;
    clips: Array<{
        sourceTrackId: string;
        sourceClipId: string;
        sourceId: string;
        offsetTicks: number;
        regionStartTick?: number;
        regionEndTick?: number;
        name?: string;
        enabled?: boolean;
    }>;
    anchorTick: number;
    sourceTrackOrder: string[];
};

export interface PreparedMidiClipPaste {
    clips: Array<{
        trackId: string;
        clip: Omit<MidiClip, 'type'> & { type?: 'midi' };
    }>;
    createTracks: Array<{ trackId: string; name: string; index?: number }>;
}

let clipboard: MidiClipClipboard | null = null;

export function getMidiClipClipboard(): MidiClipClipboard | null {
    return clipboard;
}

export function setMidiClipClipboard(next: MidiClipClipboard | null): void {
    clipboard = next;
}

export function copySelectedMidiClipsToClipboard(
    state: TimelineState,
    selectedClips: SelectedTimelineClip[],
): MidiClipClipboard | null {
    const copied: MidiClipClipboard['clips'] = [];
    const selectedKeys = new Set(selectedClips.map((entry) => `${entry.trackId}:${entry.clipId}`));
    for (const trackId of state.tracksOrder) {
        const track = state.tracks[trackId];
        if (!track || track.type !== 'midi') continue;
        for (const clip of getMidiClipsForTrack(track)) {
            if (!selectedKeys.has(`${trackId}:${clip.id}`)) continue;
            if (!state.midiCache[clip.sourceId]) continue;
            copied.push({
                sourceTrackId: trackId,
                sourceClipId: clip.id,
                sourceId: clip.sourceId,
                offsetTicks: clip.offsetTicks,
                regionStartTick: clip.regionStartTick,
                regionEndTick: clip.regionEndTick,
                name: clip.name,
                enabled: clip.enabled,
            });
        }
    }
    if (!copied.length) {
        setMidiClipClipboard(null);
        return null;
    }
    const sourceTrackOrder = state.tracksOrder.filter((trackId) =>
        copied.some((clip) => clip.sourceTrackId === trackId),
    );
    const anchorTick = Math.min(...copied.map((clip) => clip.offsetTicks));
    const payload: MidiClipClipboard = {
        kind: 'mvmnt.midi-clips',
        version: 1,
        clips: copied,
        anchorTick,
        sourceTrackOrder,
    };
    setMidiClipClipboard(payload);
    return payload;
}

export function prepareMidiClipPaste(
    state: TimelineState,
    payload: MidiClipClipboard,
    destination: { tick: number; trackId: string },
): PreparedMidiClipPaste | null {
    if (!payload || payload.kind !== 'mvmnt.midi-clips' || payload.version !== 1 || !payload.clips.length) {
        return null;
    }
    const midiTrackIds = state.tracksOrder.filter((trackId) => state.tracks[trackId]?.type === 'midi');
    const destinationTrackIndex = midiTrackIds.indexOf(destination.trackId);
    if (destinationTrackIndex < 0) return null;

    const sourceTrackOrder = payload.sourceTrackOrder.length
        ? payload.sourceTrackOrder
        : [...new Set(payload.clips.map((clip) => clip.sourceTrackId))];
    const trackMap = new Map<string, string>();
    const createTracks: PreparedMidiClipPaste['createTracks'] = [];
    const baseOrderIndex = state.tracksOrder.indexOf(destination.trackId);

    sourceTrackOrder.forEach((sourceTrackId, sourceIndex) => {
        const existingDestination = midiTrackIds[destinationTrackIndex + sourceIndex];
        if (existingDestination) {
            trackMap.set(sourceTrackId, existingDestination);
            return;
        }
        const sourceTrack = state.tracks[sourceTrackId];
        const trackId = `trk_paste_${makeMidiClipId()}`;
        trackMap.set(sourceTrackId, trackId);
        createTracks.push({
            trackId,
            name: sourceTrack?.type === 'midi' ? `${sourceTrack.name} copy` : 'MIDI Track',
            index: baseOrderIndex + sourceIndex,
        });
    });

    const clips = payload.clips
        .map((clip) => {
            const targetTrackId = trackMap.get(clip.sourceTrackId);
            if (!targetTrackId || !state.midiCache[clip.sourceId]) return null;
            return {
                trackId: targetTrackId,
                clip: {
                    id: makeMidiClipId(),
                    type: 'midi' as const,
                    sourceId: clip.sourceId,
                    offsetTicks: Math.max(0, Math.round(destination.tick + (clip.offsetTicks - payload.anchorTick))),
                    regionStartTick: clip.regionStartTick,
                    regionEndTick: clip.regionEndTick,
                    name: clip.name,
                    enabled: clip.enabled,
                },
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (!clips.length) return null;
    return { clips, createTracks };
}
