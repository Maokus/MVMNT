// Core NoteEvent: simple container for a single MIDI note occurrence
// No time-unit lifecycle, splitting, or rendering logic here

export class NoteEvent {
  public note: number;
  public channel: number;
  public startTime: number;
  public endTime: number;
  public velocity: number;
  public duration: number;

  constructor(note: number, channel: number, startTime: number, endTime: number, velocity: number) {
    this.note = note;
    this.channel = channel;
    this.startTime = startTime;
    this.endTime = endTime;
    this.velocity = velocity;
    this.duration = endTime - startTime;
  }
}
