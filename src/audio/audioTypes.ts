// Audio track & cache types integrating with the tick-based timeline (constant PPQ via shared TimingManager).

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
    peakData?: Float32Array; // optional waveform peak bins for UI rendering
}

export type AnyTrack = AudioTrack | import('@state/timelineStore').TimelineTrack; // existing midi timeline track
