// Note management class 
// Handles note state management and coordination with NoteBlock rendering
import { NoteBlock } from './note-block';
import { globalTimingManager, TimingManager } from './timing-manager';
import { MIDIEvent } from './types';

interface ActiveNote {
  velocity: number;
  channel: number;
  startTime: number;
}

interface PlayedNotesStats {
  played: number;
  total: number;
  percentage: number;
}

export class NoteManager {
  private noteBlocks: NoteBlock[] = [];
  private activeNotes: Map<number, ActiveNote> = new Map();
  private playedNoteEvents: number = 0;
  private totalNoteEvents: number = 0;
  private timingManager: TimingManager;

  constructor(timingManager?: TimingManager) {
    this.timingManager = timingManager || globalTimingManager;
  }

  /**
   * Load MIDI data and create note blocks
   */
  loadMIDIData(events: MIDIEvent[], timeUnit: number): void {
    // Clear existing data
    this.noteBlocks = [];
    this.activeNotes.clear();
    this.playedNoteEvents = 0;

    // Create note blocks from events
    this.noteBlocks = NoteBlock.createNoteBlocks(events, timeUnit);

    // Calculate total noteOn events
    this.totalNoteEvents = events.filter(event => event.type === 'noteOn').length;
  }

  /**
   * Update note blocks when timeUnit changes
   */
  updateTimeUnit(events: MIDIEvent[], timeUnit: number): void {
    if (events && events.length > 0) {
      this.noteBlocks = NoteBlock.createNoteBlocks(events, timeUnit);
    }
  }

  /**
   * Update active notes for current time
   */
  updateActiveNotes(events: MIDIEvent[], currentTime: number): void {
    this.activeNotes.clear();

    const currentEvents = events.filter(event =>
      Math.abs(event.time - currentTime) < 0.1
    );

    for (const event of currentEvents) {
      if (event.type === 'noteOn' && event.note !== undefined && event.velocity !== undefined && event.channel !== undefined) {
        this.activeNotes.set(event.note, {
          velocity: event.velocity,
          channel: event.channel,
          startTime: currentTime
        });
      } else if (event.type === 'noteOff' && event.note !== undefined) {
        this.activeNotes.delete(event.note);
      }
    }
  }

  /**
   * Update played note events counter
   */
  updatePlayedNoteEvents(events: MIDIEvent[], currentTime: number): void {
    // Count all noteOn events that have occurred up to current time
    let count = 0;
    for (const event of events) {
      if (event.type === 'noteOn' && event.time <= currentTime) {
        count++;
      }
    }
    this.playedNoteEvents = count;
  }

  /**
   * Reset tracking for seeking
   */
  resetTracking(): void {
    this.activeNotes.clear();
    this.playedNoteEvents = 0;
  }

  /**
   * Get played notes statistics
   */
  getPlayedNotesStats(): PlayedNotesStats {
    const playedCount = this.playedNoteEvents;
    const totalCount = this.totalNoteEvents;
    const percentage = totalCount > 0 ? Math.round((playedCount / totalCount) * 100) : 0;

    return {
      played: playedCount,
      total: totalCount,
      percentage: percentage
    };
  }

  /**
   * Get note blocks for rendering
   */
  getNoteBlocks(): NoteBlock[] {
    return this.noteBlocks;
  }

  /**
   * Get active notes
   */
  getActiveNotes(): Map<number, ActiveNote> {
    return this.activeNotes;
  }

  /**
   * Recalculate note timings when BPM changes
   */
  recalculateNoteTimings(oldBpm: number, newBpm: number, events: MIDIEvent[], timeUnit: number): void {
    if (oldBpm === newBpm || !events.length) return;

    // Use TimingManager to calculate the ratio
    const tempoRatio = this.timingManager.calculateTempoRatio(oldBpm, newBpm);

    // Update all event times
    for (const event of events) {
      event.time = this.timingManager.scaleTimeByTempo(event.time, tempoRatio);
    }

    // Recreate note blocks with new timing
    this.noteBlocks = NoteBlock.createNoteBlocks(events, timeUnit);
  }
}
