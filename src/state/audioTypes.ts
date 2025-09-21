// Audio feature Phase 1: new audio track & cache types
// These integrate with the existing tick-based timeline. PPQ assumed constant via shared TimingManager.

export interface AudioTrack {
    id: string;
    name: string;
    type: 'audio';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    offsetTicks: number; // position on the canonical timeline
    regionStartTick?: number; // optional trim start within buffer (tick domain, relative to offset)
    regionEndTick?: number; // optional trim end
    audioSourceId?: string; // key into audioCache (if unset, defaults to track id when ingested)
    gain: number; // linear 0..2 (default 1)
}

export interface AudioCacheEntry {
    audioBuffer: AudioBuffer;
    durationTicks: number; // computed from buffer.duration via ticksPerSecond
    sampleRate: number;
    channels: number;
    filePath?: string; // optional reference (not persisted across sessions yet)
    peakData?: Float32Array; // reserved for Phase 5 waveform peaks
}

export type AnyTrack = AudioTrack | import('./timelineStore').TimelineTrack; // existing midi timeline track
