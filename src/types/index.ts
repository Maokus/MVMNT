// Type definitions for the MIDI visualizer modules
export interface MIDIEvent {
  type: string;
  channel?: number;
  note?: number;
  velocity?: number;
  time: number;
  duration?: number;
}

export interface MIDIData {
  events: MIDIEvent[];
  duration: number;
  tempo: number;
  ticksPerQuarter: number;
  timeSignature: {
    numerator: number;
    denominator: number;
    clocksPerClick: number;
    thirtysecondNotesPerBeat: number;
  };
  timingManager: any;
  trimmedTicks: number;
}

export interface ProgressCallback {
  onProgress?: (progress: number, text: string) => void;
}

export interface ExportOptions extends ProgressCallback {
  resolution?: number;
  fps?: number;
  fullDuration?: boolean;
}

declare global {
  interface Window {
    // Global functions that might be called from the original JS modules
    parseMIDI?: (file: File) => Promise<MIDIData>;
    playPause?: () => void;
    stopPlayback?: () => void;
    stepForward?: () => void;
    stepBackward?: () => void;
    generateImageSequence?: () => void;
  }
}
