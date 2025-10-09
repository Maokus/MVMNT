// Unified timing-related public types

// TempoMapEntry: time is in seconds. Either tempo (microseconds per quarter note)
// or bpm can be provided; tempo takes precedence if both are present.
// Optional curve determines interpolation style (step by default, linear ramp when 'linear').
export type TempoMapEntry = { time: number; tempo?: number; bpm?: number; curve?: 'step' | 'linear' };
