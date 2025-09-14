import type { MIDIData } from '@core/types';
import type { NoteRaw, TempoMapEntry } from '@state/timelineTypes';

export function buildNotesFromMIDI(midiData: MIDIData): {
    midiData: MIDIData;
    notesRaw: NoteRaw[];
    ticksPerQuarter: number;
    tempoMap?: TempoMapEntry[];
} {
    const notes: NoteRaw[] = [];
    // Track active note-on events keyed by note+channel storing tick position.
    const noteOnMap = new Map<string, { note: number; channel: number; startTick: number; velocity?: number }>();
    for (const ev of midiData.events) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            const key = `${ev.note}_${ev.channel || 0}`;
            noteOnMap.set(key, {
                note: ev.note!,
                channel: ev.channel || 0,
                startTick: ev.tick ?? 0,
                velocity: ev.velocity,
            });
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
            const key = `${ev.note}_${ev.channel || 0}`;
            const start = noteOnMap.get(key);
            if (start) {
                const startTick = start.startTick ?? 0;
                const endTick = ev.tick ?? startTick; // zero-length fallback if missing
                const tpq = midiData.ticksPerQuarter || 480;
                const startBeat = startTick / tpq;
                const endBeat = endTick / tpq;
                notes.push({
                    note: start.note,
                    channel: start.channel,
                    startTick,
                    endTick,
                    durationTicks: Math.max(0, endTick - startTick),
                    startBeat,
                    endBeat,
                    durationBeats: endBeat - startBeat,
                    velocity: start.velocity,
                });
                noteOnMap.delete(key);
            }
        }
    }
    // Close unmatched noteOns with 1 beat fallback duration (approx) rather than 1 second
    for (const start of noteOnMap.values()) {
        const tpq = midiData.ticksPerQuarter || 480;
        const startTick = start.startTick ?? 0;
        const fallbackBeats = 1; // arbitrary 1 beat length; UI can adjust later
        const durationTicks = Math.round(fallbackBeats * tpq);
        const endTick = startTick + durationTicks;
        const startBeat = startTick / tpq;
        const endBeat = startBeat + fallbackBeats;
        notes.push({
            note: start.note,
            channel: start.channel,
            startTick,
            endTick,
            durationTicks,
            startBeat,
            endBeat,
            durationBeats: fallbackBeats,
            velocity: start.velocity,
        });
    }

    const ticksPerQuarter = midiData.ticksPerQuarter || 480;
    const tempoMap = (midiData as any).tempoMap as { time: number; tempo: number }[] | undefined;
    const tempoMapEntries: TempoMapEntry[] | undefined = tempoMap?.map((t) => ({ time: t.time, tempo: t.tempo }));

    return { midiData, notesRaw: notes, ticksPerQuarter, tempoMap: tempoMapEntries };
}

export async function parseAndNormalize(input: File | MIDIData) {
    if (input instanceof File) {
        const { parseMIDIFileToData } = await import('./midi-library');
        const data = await parseMIDIFileToData(input);
        return buildNotesFromMIDI(data);
    }
    return buildNotesFromMIDI(input);
}
