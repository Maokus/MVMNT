import { TimingManager } from './timing-manager.js';
import { NoteBlock } from './note-block';

export class MidiManager {
    public timingManager: TimingManager;
    private _currentMidiFile: File | null = null;
    private _hasMacroValues = false;

    private midiData: any = null;
    private notes: any[] = [];
    private duration = 0;

    constructor(elementId: string | null = null) {
        this.timingManager = new TimingManager(elementId as any);
    }

    getDuration(): number { return this.duration; }
    getNotes(): any[] { return this.notes; }

    setBPM(bpm: number) { this.timingManager.setBPM(bpm); }
    setBeatsPerBar(b: number) { this.timingManager.setBeatsPerBar(b); }

    async loadMidiFile(file: File, resetMacroValues = false): Promise<void> {
        // dynamic import to avoid circular deps
        const { MIDIParser } = await import('./midi-parser');
        const parser = new MIDIParser();
        const midiData = await parser.parseMIDIFile(file);

        const notes: any[] = [];
        const noteMap = new Map<string, any>();
        for (const event of midiData.events) {
            const noteKey = `${event.note}_${event.channel}`;
            if (event.type === 'noteOn') {
                noteMap.set(noteKey, {
                    note: event.note,
                    channel: event.channel,
                    velocity: event.velocity,
                    startTime: event.time
                });
            } else if (event.type === 'noteOff') {
                const noteOn = noteMap.get(noteKey);
                if (noteOn) {
                    notes.push({
                        ...noteOn,
                        endTime: event.time,
                        duration: event.time - noteOn.startTime
                    });
                    noteMap.delete(noteKey);
                }
            }
        }
        noteMap.forEach((note) => {
            notes.push({ ...note, endTime: note.startTime + 1.0, duration: 1.0 });
        });

        this.loadMIDIData(midiData, notes, resetMacroValues);
        this._currentMidiFile = file;
    }

    loadMIDIData(midiData: any, notes: any[] = [], resetMacroValues = false) {
        this.midiData = midiData;
        this.notes = notes;
        if (resetMacroValues) this._hasMacroValues = false;

        if (midiData.tempo) this.timingManager.setTempo(midiData.tempo);
        if (midiData.timeSignature) this.timingManager.setTimeSignature(midiData.timeSignature);
        if (midiData.ticksPerQuarter) this.timingManager.setTicksPerQuarter(midiData.ticksPerQuarter);
        // Tempo map support (seconds-based entries)
        if ((midiData as any).tempoMap && Array.isArray((midiData as any).tempoMap)) {
            try {
                this.timingManager.setTempoMap((midiData as any).tempoMap, 'seconds');
            } catch (e) {
                // Fallback gracefully if map invalid
                console.warn('Invalid tempo map in MIDI data, ignoring.', e);
            }
        }

        const notesToUse = this.notes.length > 0 ? this.notes : notes;
        if (notesToUse.length > 0) {
            this.duration = Math.max(...notesToUse.map(n => n.endTime || n.startTime));
        } else {
            this.duration = 0;
        }
    }

    getNotesInTimeWindow(startTime: number, endTime: number) {
        if (!this.notes) return [];
        return this.notes.filter(note => {
            const noteStart = note.startTime;
            const noteEnd = note.endTime || noteStart;
            return noteStart < endTime && noteEnd > startTime;
        });
    }

    getNotesInTimeUnit(currentTime: number, timeUnitBars = 1) {
    // Respect tempo map: compute window aligned to bars around currentTime
    const { start: windowStart, end: windowEnd } = this.timingManager.getTimeUnitWindow(currentTime, timeUnitBars);
        return this.getNotesInTimeWindow(windowStart, windowEnd);
    }

    createNoteBlocks(notes: any[], _targetTime: number): NoteBlock[] {
        // NoteBlock(note, channel, startTime, endTime, velocity)
        return notes.map(n => new NoteBlock(n.note, n.channel || 0, n.startTime, n.endTime, n.velocity));
    }

    getNoteName(midiNote: number): string {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteName = noteNames[midiNote % 12];
        return `${noteName}${octave}`;
    }
}
