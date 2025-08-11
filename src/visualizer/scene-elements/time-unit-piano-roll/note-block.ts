// Local NoteBlock class for Time Unit Piano Roll only
// Extends the core NoteEvent and adds time-window lifecycle logic, segmentation, and helpers
import { NoteEvent } from '../../note-event';

export class NoteBlock extends NoteEvent {
  // For split/clamped segments (continuations between time units)
  public isSegment: boolean = false;
  public originalStartTime: number | null = null;
  public originalEndTime: number | null = null;

  // Time-unit window bounds for this segment
  public windowStart: number | null = null;
  public windowEnd: number | null = null;

  // Inherit constructor from NoteEvent

  // Utility used by NoteAnimations for glow effect
  isCurrentlyPlaying(currentTime: number): boolean {
    const start = this.originalStartTime ?? this.startTime;
    const end = this.originalEndTime ?? this.endTime;
    return start <= currentTime && end > currentTime;
  }

  // Build clamped segments for previous, current, and next time-unit windows
  // timingManager must implement getTimeUnitWindow(currentTime, timeUnitBars), _secondsToBeats, _beatsToSeconds, and beatsPerBar
  static buildWindowedSegments(
    notes: Array<{ note: number; channel?: number; velocity: number; startTime: number; endTime: number; startBeat?: number; endBeat?: number }>,
    timingManager: any,
    targetTime: number,
    timeUnitBars: number
  ): NoteBlock[] {
    const current = timingManager.getTimeUnitWindow(targetTime, timeUnitBars);
    const prevStart = timingManager._beatsToSeconds(
      timingManager._secondsToBeats(current.start) - (timeUnitBars * (timingManager.beatsPerBar || 4))
    );
    const prev = { start: prevStart, end: current.start };
    const nextEnd = timingManager._beatsToSeconds(
      timingManager._secondsToBeats(current.end) + (timeUnitBars * (timingManager.beatsPerBar || 4))
    );
    const next = { start: current.end, end: nextEnd };

    const minTime = prev.start;
    const maxTime = next.end;

    const candidateNotes = notes.filter(n => {
      const s = n.startBeat !== undefined ? timingManager.beatsToSeconds(n.startBeat) : n.startTime;
      const e = n.endBeat !== undefined ? timingManager.beatsToSeconds(n.endBeat) : n.endTime;
      return s < maxTime && e > minTime;
    });

    const segments: NoteBlock[] = [];

    const addClipped = (note: any, win: { start: number; end: number }) => {
      const startTime = (note.startBeat !== undefined)
        ? timingManager.beatsToSeconds(note.startBeat)
        : note.startTime;
      const endTime = (note.endBeat !== undefined)
        ? timingManager.beatsToSeconds(note.endBeat)
        : note.endTime;
      if (startTime < win.end && endTime > win.start) {
        const segStart = Math.max(startTime, win.start);
        const segEnd = Math.min(endTime, win.end);
        const block = new NoteBlock(note.note, note.channel || 0, segStart, segEnd, note.velocity);
        if (segStart !== startTime || segEnd !== endTime) {
          block.isSegment = true;
          block.originalStartTime = startTime;
          block.originalEndTime = endTime;
        }
        block.windowStart = win.start;
        block.windowEnd = win.end;
        segments.push(block);
      }
    };

    for (const n of candidateNotes) {
      addClipped(n, prev);
      addClipped(n, current);
      addClipped(n, next);
    }

    return segments;
  }
}
