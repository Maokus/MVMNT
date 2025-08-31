import type { MIDIData } from '@core/types';
import type { NoteRaw, TempoMapEntry } from '@state/timelineTypes';

export function buildNotesFromMIDI(midiData: MIDIData): {
    midiData: MIDIData;
    notesRaw: NoteRaw[];
    ticksPerQuarter: number;
    tempoMap?: TempoMapEntry[];
} {
    const notes: NoteRaw[] = [];
    const noteOnMap = new Map<
        string,
        { note: number; channel: number; startTime: number; velocity?: number; startTick?: number }
    >();
    for (const ev of midiData.events) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            const key = `${ev.note}_${ev.channel || 0}`;
            noteOnMap.set(key, {
                note: ev.note!,
                channel: ev.channel || 0,
                startTime: ev.time,
                velocity: ev.velocity,
                startTick: ev.tick,
            });
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
            const key = `${ev.note}_${ev.channel || 0}`;
            const start = noteOnMap.get(key);
            if (start) {
                const endTime = ev.time;
                notes.push({
                    note: start.note,
                    channel: start.channel,
                    startTime: start.startTime,
                    endTime,
                    duration: Math.max(0, endTime - start.startTime),
                    startTick: start.startTick,
                    endTick: ev.tick,
                    velocity: start.velocity,
                });
                noteOnMap.delete(key);
            }
        }
    }
    // Close unmatched noteOns with 1s duration
    for (const start of noteOnMap.values()) {
        const endTime = start.startTime + 1;
        notes.push({
            note: start.note,
            channel: start.channel,
            startTime: start.startTime,
            endTime,
            duration: 1,
            startTick: start.startTick,
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
