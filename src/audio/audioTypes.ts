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

export interface AudioCacheOriginalFile {
    name?: string;
    mimeType: string;
    bytes: Uint8Array;
    byteLength: number;
    hash?: string;
}

export interface AudioCacheWaveform {
    version: 1;
    channelPeaks: Float32Array;
    sampleStep: number;
}

export interface AudioCacheEntry {
    audioBuffer: AudioBuffer;
    durationTicks: number; // computed from buffer.duration via ticksPerSecond
    sampleRate: number;
    channels: number;
    durationSeconds: number;
    durationSamples: number;
    filePath?: string; // optional reference (not persisted across sessions yet)
    originalFile?: AudioCacheOriginalFile;
    waveform?: AudioCacheWaveform;
}

export type AnyTrack = AudioTrack | import('@state/timelineStore').TimelineTrack; // existing midi timeline track
