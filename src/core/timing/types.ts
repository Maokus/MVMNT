// Unified timing-related public types

// TempoMapEntry: time is in seconds. Either tempo (microseconds per quarter note)
// or bpm can be provided; tempo takes precedence if both are present.
// Optional curve determines interpolation style (step by default, linear ramp when 'linear').
export type TempoMapEntry = { time: number; tempo?: number; bpm?: number; curve?: 'step' | 'linear' };

// TimelineNoteEvent: a resolved MIDI note event in timeline (absolute) seconds.
// Defined here as a neutral shared location so it can be re-exported from the
// plugin SDK without leaking internal state-layer import paths.
export type TimelineNoteEvent = {
    trackId: string;
    note: number;
    channel: number;
    startTime: number; // in timeline seconds
    endTime: number;
    duration: number;
    velocity?: number;
};

/** A single MIDI Control Change message, stored in seconds-domain time. */
export interface TimelineCCEvent {
    trackId: string;
    channel: number;
    controller: number; // 0–127, e.g. 64 = sustain pedal
    value: number; // 0–127
    timeSec: number; // absolute timeline seconds
}

/**
 * A single tick-domain tempo keyframe for hold-only tempo automation.
 * The BPM value takes effect at `tick` and holds until the next keyframe.
 */
export interface TempoKeyframe {
    tick: number;   // absolute tick position
    bpm: number;    // tempo starting at this tick (hold interpolation)
}
