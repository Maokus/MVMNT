// Audio track & cache types integrating with the tick-based timeline (constant PPQ via shared TimingManager).

export interface AudioClip {
    id: string;
    type: 'audio';
    sourceId: string;
    offsetTicks: number;
    /** Offset into the immutable media source. Unlike timeline placement, this is real time. */
    sourceStartSeconds?: number;
    /** Exclusive offset into the immutable media source. Omitted means the source end. */
    sourceEndSeconds?: number;
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
    clips: AudioClip[];
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
