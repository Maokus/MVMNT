// Core types for MIDI processing and timing management

export interface MIDIEvent {
  type: 'noteOn' | 'noteOff' | 'controlChange' | 'programChange' | 'pitchBend' | 'meta';
  channel?: number;
  note?: number;
  velocity?: number;
  time: number;
  duration?: number;
  data?: number[];
  metaType?: number;
  text?: string;
}

export interface MIDITimeSignature {
  numerator: number;
  denominator: number;
  clocksPerClick: number;
  thirtysecondNotesPerBeat: number;
}

export interface MIDIData {
  events: MIDIEvent[];
  duration: number;
  tempo: number;
  ticksPerQuarter: number;
  timeSignature: MIDITimeSignature;
  timingManager?: any; // Keep as any for now since TimingManager is still JS
  trimmedTicks: number;
}

export interface TimingData {
  currentTime: number;
  totalTime: number;
  progress: number;
  isPlaying: boolean;
}

export interface NoteBlock {
  note: number;
  velocity: number;
  startTime: number;
  endTime: number;
  duration: number;
  channel: number;
}

export interface ProgressCallback {
  onProgress?: (progress: number, text: string) => void;
}

export interface ExportOptions extends ProgressCallback {
  resolution?: number;
  fps?: number;
  fullDuration?: boolean;
  format?: 'webm' | 'gif' | 'images';
}

export interface TimingManager {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  totalDuration: number;
  start(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  getCurrentTime(): number;
  getTotalDuration(): number;
}

export interface Manager {
  noteBlocks: NoteBlock[];
  midiData: MIDIData | null;
  timingManager: TimingManager | null;
  addNoteBlock(noteBlock: NoteBlock): void;
  removeNoteBlock(noteBlock: NoteBlock): void;
  getActiveNotes(time: number): NoteBlock[];
  reset(): void;
}
