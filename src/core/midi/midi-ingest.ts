import type { MIDIData } from '@core/types';
import type { NoteRaw, TempoMapEntry } from '@state/timelineTypes';
import { CANONICAL_PPQ } from '@core/timing/ppq';

export function buildNotesFromMIDI(midiData: MIDIData): {
    midiData: MIDIData;
    notesRaw: NoteRaw[];
    ticksPerQuarter: number; // always CANONICAL_PPQ after normalization
    tempoMap?: TempoMapEntry[];
} {
    const sourceTPQ = midiData.ticksPerQuarter || CANONICAL_PPQ;
    const scale = sourceTPQ === CANONICAL_PPQ ? 1 : CANONICAL_PPQ / sourceTPQ;
    const notes: NoteRaw[] = [];
    // Track active note-on events keyed by note+channel storing canonical start tick.
    const noteOnMap = new Map<string, { note: number; channel: number; startTickSrc: number; velocity?: number }>();
    for (const ev of midiData.events) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            const key = `${ev.note}_${ev.channel || 0}`;
            noteOnMap.set(key, {
                note: ev.note!,
                channel: ev.channel || 0,
                startTickSrc: ev.tick ?? 0,
                velocity: ev.velocity,
            });
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
            const key = `${ev.note}_${ev.channel || 0}`;
            const start = noteOnMap.get(key);
            if (start) {
                const rawStart = start.startTickSrc ?? 0;
                const rawEnd = ev.tick ?? rawStart; // zero-length fallback if missing
                const startTick = Math.round(rawStart * scale);
                const endTick = Math.round(rawEnd * scale);
                const startBeat = startTick / CANONICAL_PPQ;
                const endBeat = endTick / CANONICAL_PPQ;
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
    // Close unmatched noteOns with 1 beat fallback duration (approx)
    for (const start of noteOnMap.values()) {
        const rawStart = start.startTickSrc ?? 0;
        const startTick = Math.round(rawStart * scale);
        const fallbackBeats = 1;
        const durationTicks = Math.round(fallbackBeats * CANONICAL_PPQ);
        const endTick = startTick + durationTicks;
        const startBeat = startTick / CANONICAL_PPQ;
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

    const tempoMap = (midiData as any).tempoMap as { time: number; tempo: number }[] | undefined;
    const tempoMapEntries: TempoMapEntry[] | undefined = tempoMap?.map((t) => ({ time: t.time, tempo: t.tempo }));

    return { midiData, notesRaw: notes, ticksPerQuarter: CANONICAL_PPQ, tempoMap: tempoMapEntries };
}

export async function parseAndNormalize(input: File | MIDIData) {
    if (input instanceof File) {
        const { parseMIDIFileToData } = await import('./midi-library');
        const data = await parseMIDIFileToData(input);
        return buildNotesFromMIDI(data);
    }
    return buildNotesFromMIDI(input);
}
