// Audio track & cache types integrating with the tick-based timeline (constant PPQ via shared TimingManager).

export interface AudioClip {
    id: string;
    type: 'audio';
    sourceId: string;
    offsetTicks: number;
    regionStartTick?: number;
    regionEndTick?: number;
    name?: string;
    enabled?: boolean;
    gain?: number;
}

export interface AudioTrack {
    id: string;
    name: string;
    type: 'audio';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    clips?: AudioClip[];
    offsetTicks?: number; // legacy track-level position on the canonical timeline
    regionStartTick?: number; // legacy optional trim start within buffer
    regionEndTick?: number; // legacy optional trim end
    audioSourceId?: string; // legacy key into audioCache
    gain: number; // linear 0..2 (default 1)
}

export interface AudioCacheOriginalFile {
    name?: string;
    mimeType: string;
    bytes?: Uint8Array;
    byteLength: number;
    hash?: string;
    assetId?: string;
    storage?: 'indexeddb' | 'memory' | 'inline' | 'missing';
}

export interface AudioCacheWaveform {
    version: 1;
    channelPeaks: Float32Array;
    sampleStep: number;
}

export interface AudioCacheEntry {
    audioBuffer?: AudioBuffer;
    durationTicks: number; // computed from buffer.duration via ticksPerSecond
    sampleRate: number;
    channels: number;
    durationSeconds: number;
    durationSamples: number;
    filePath?: string; // optional reference (not persisted across sessions yet)
    originalFile?: AudioCacheOriginalFile;
    waveform?: AudioCacheWaveform;
    decodedState?: 'ready' | 'decoding' | 'failed';
    decodedLastUsedAt?: number;
    decodedFailureReason?: string;
}

export type AnyTrack = AudioTrack | import('@state/timelineStore').TimelineTrack; // existing midi timeline track
