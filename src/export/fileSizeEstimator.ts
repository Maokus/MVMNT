/**
 * File Size Estimator for Video/Image Exports
 *
 * A modular system for estimating output file sizes based on export settings.
 * Designed to be extensible for new formats, codecs, and containers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoEstimationParams {
    format: 'video';
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    videoCodec: string;
    videoBitrateMode: 'auto' | 'manual';
    videoBitrate?: number; // bits per second (only used if mode is 'manual')
    qualityPreset: 'low' | 'medium' | 'high';
    includeAudio: boolean;
    audioCodec?: string;
    audioBitrate?: number; // bits per second
    audioChannels?: 1 | 2;
    audioSampleRate?: number | 'auto';
    container: 'mp4' | 'webm';
}

export interface PngSequenceEstimationParams {
    format: 'png';
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
}

export type EstimationParams = VideoEstimationParams | PngSequenceEstimationParams;

export interface FileSizeEstimate {
    /** Estimated size in bytes */
    bytes: number;
    /** Human-readable size string (e.g., "123.4 MB") */
    formatted: string;
    /** Breakdown of components */
    breakdown: {
        video?: number;
        audio?: number;
        overhead?: number;
        frames?: number;
    };
    /** Confidence level of the estimate */
    confidence: 'low' | 'medium' | 'high';
    /** Notes about the estimate */
    notes?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Quality preset multipliers for auto bitrate calculation.
 * These adjust the base bitrate up or down based on user's quality preference.
 */
export const QUALITY_MULTIPLIERS: Record<'low' | 'medium' | 'high', number> = {
    low: 0.5,
    medium: 0.75,
    high: 1.0,
};

/**
 * Codec efficiency factors relative to H.264 baseline.
 * Lower values = more efficient compression = smaller files at same quality.
 */
const VIDEO_CODEC_EFFICIENCY: Record<string, number> = {
    h264: 1.0,
    avc: 1.0,
    hevc: 0.7, // ~30% more efficient than H.264
    h265: 0.7,
    vp9: 0.75, // ~25% more efficient than H.264
    av1: 0.6, // ~40% more efficient than H.264
};

/**
 * Audio codec bitrate defaults (bits per second) for estimation when not specified.
 * Used as fallback or for auto mode.
 */
const AUDIO_CODEC_DEFAULTS: Record<string, { bitrate: number; overhead: number }> = {
    'pcm-s16': { bitrate: 0, overhead: 1.0 }, // Uncompressed: calculated from sample rate
    mp3: { bitrate: 192_000, overhead: 1.02 },
    opus: { bitrate: 128_000, overhead: 1.01 },
    vorbis: { bitrate: 160_000, overhead: 1.02 },
    flac: { bitrate: 0, overhead: 0.6 }, // Lossless: ~60% of PCM typically
    aac: { bitrate: 192_000, overhead: 1.02 },
};

/**
 * Container overhead factors (multiplier on total size).
 * Accounts for container metadata, indexes, etc.
 */
const CONTAINER_OVERHEAD: Record<string, number> = {
    mp4: 1.01, // ~1% overhead
    webm: 1.005, // ~0.5% overhead
};

/**
 * PNG compression ratio estimate.
 * Real-world varies wildly by content (0.1 for simple graphics to 0.9 for photos).
 * We use a middle-ground estimate for typical visualizer content.
 */
const PNG_COMPRESSION_RATIO = 0.35; // ~35% of raw RGBA size

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Calculate video bitrate using a perceptual quality model.
 * Based on bits-per-pixel-per-frame heuristic.
 */
export function calculateAutoBitrate(
    width: number,
    height: number,
    fps: number,
    codec: string,
    qualityPreset: 'low' | 'medium' | 'high'
): number {
    // Base bits-per-pixel-per-frame for visually acceptable quality
    const BASE_BPPPF = 0.09;

    // Calculate base bitrate
    const pixels = width * height;
    const baseBitrate = pixels * fps * BASE_BPPPF;

    // Apply quality multiplier
    const qualityMultiplier = QUALITY_MULTIPLIERS[qualityPreset];

    // Apply codec efficiency (more efficient codecs need fewer bits)
    const codecEfficiency = VIDEO_CODEC_EFFICIENCY[codec.toLowerCase()] ?? 1.0;

    // Final bitrate with bounds
    const MIN_BITRATE = 500_000; // 500 Kbps floor
    const MAX_BITRATE = 100_000_000; // 100 Mbps ceiling

    const estimated = baseBitrate * qualityMultiplier * codecEfficiency;
    return Math.round(Math.min(Math.max(estimated, MIN_BITRATE), MAX_BITRATE));
}

/**
 * Calculate audio size in bytes for a given duration.
 */
function calculateAudioSize(
    durationSeconds: number,
    codec: string,
    bitrateOverride?: number,
    channels: 1 | 2 = 2,
    sampleRate: number | 'auto' = 'auto'
): number {
    const effectiveSampleRate = sampleRate === 'auto' ? 48000 : sampleRate;
    const codecInfo = AUDIO_CODEC_DEFAULTS[codec] ?? AUDIO_CODEC_DEFAULTS['mp3'];

    let bitrate: number;

    if (codec === 'pcm-s16') {
        // Uncompressed: 16 bits per sample * channels * sample rate
        bitrate = 16 * channels * effectiveSampleRate;
    } else if (codec === 'flac') {
        // FLAC: estimate as ~60% of PCM
        const pcmBitrate = 16 * channels * effectiveSampleRate;
        bitrate = pcmBitrate * codecInfo.overhead;
    } else {
        // Compressed formats: use override or default
        bitrate = bitrateOverride ?? codecInfo.bitrate;
    }

    // Convert bits/second to bytes for duration
    const bytes = (bitrate * durationSeconds) / 8;
    return Math.round(bytes * codecInfo.overhead);
}

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Main Estimator Functions
// ---------------------------------------------------------------------------

/**
 * Estimate file size for video export.
 */
function estimateVideoSize(params: VideoEstimationParams): FileSizeEstimate {
    const notes: string[] = [];
    let confidence: 'low' | 'medium' | 'high' = 'high';

    // Calculate video bitrate
    let videoBitrate: number;
    if (params.videoBitrateMode === 'manual' && params.videoBitrate) {
        videoBitrate = params.videoBitrate;
    } else {
        videoBitrate = calculateAutoBitrate(
            params.width,
            params.height,
            params.fps,
            params.videoCodec,
            params.qualityPreset
        );
        notes.push('Video bitrate auto-calculated based on resolution and quality preset');
    }

    // Check for codec efficiency data
    const codecKey = params.videoCodec.toLowerCase();
    if (!(codecKey in VIDEO_CODEC_EFFICIENCY)) {
        notes.push(`Unknown codec "${params.videoCodec}" - using baseline efficiency`);
        confidence = 'medium';
    }

    // Video size in bytes
    const videoBytes = (videoBitrate * params.durationSeconds) / 8;

    // Audio size (if included)
    let audioBytes = 0;
    if (params.includeAudio && params.audioCodec) {
        const effectiveSampleRate = params.audioSampleRate === 'auto' ? 48000 : params.audioSampleRate;
        audioBytes = calculateAudioSize(
            params.durationSeconds,
            params.audioCodec,
            params.audioBitrate,
            params.audioChannels ?? 2,
            effectiveSampleRate
        );
    }

    // Container overhead
    const containerMultiplier = CONTAINER_OVERHEAD[params.container] ?? 1.01;
    const rawTotal = videoBytes + audioBytes;
    const overheadBytes = rawTotal * (containerMultiplier - 1);
    const totalBytes = Math.round(rawTotal + overheadBytes);

    // Adjust confidence based on various factors
    if (params.durationSeconds > 3600) {
        notes.push('Long duration may affect accuracy');
        confidence = confidence === 'high' ? 'medium' : 'low';
    }

    return {
        bytes: totalBytes,
        formatted: formatBytes(totalBytes),
        breakdown: {
            video: Math.round(videoBytes),
            audio: Math.round(audioBytes),
            overhead: Math.round(overheadBytes),
        },
        confidence,
        notes: notes.length > 0 ? notes : undefined,
    };
}

/**
 * Estimate file size for PNG sequence export.
 */
function estimatePngSequenceSize(params: PngSequenceEstimationParams): FileSizeEstimate {
    const notes: string[] = [];

    // Calculate total frames
    const frameCount = Math.ceil(params.fps * params.durationSeconds);

    // Raw RGBA size per frame
    const rawFrameSize = params.width * params.height * 4; // 4 bytes per pixel (RGBA)

    // Estimated compressed size per frame
    const compressedFrameSize = rawFrameSize * PNG_COMPRESSION_RATIO;

    // Total size for all frames
    const totalFrameBytes = compressedFrameSize * frameCount;

    // ZIP overhead (~2-3% for file headers and central directory)
    const zipOverhead = 1.025;
    const totalBytes = Math.round(totalFrameBytes * zipOverhead);

    notes.push(`Estimated ${frameCount} frames at ~${formatBytes(compressedFrameSize)} each`);
    notes.push('Actual size varies significantly based on image complexity');

    return {
        bytes: totalBytes,
        formatted: formatBytes(totalBytes),
        breakdown: {
            frames: Math.round(totalFrameBytes),
            overhead: Math.round(totalFrameBytes * (zipOverhead - 1)),
        },
        confidence: 'medium', // PNG compression is highly content-dependent
        notes,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate file size for any supported export format.
 */
export function estimateFileSize(params: EstimationParams): FileSizeEstimate {
    if (params.format === 'video') {
        return estimateVideoSize(params);
    } else if (params.format === 'png') {
        return estimatePngSequenceSize(params);
    }

    // Fallback for unknown formats
    return {
        bytes: 0,
        formatted: 'Unknown',
        breakdown: {},
        confidence: 'low',
        notes: ['Unsupported format'],
    };
}

/**
 * Get a quick formatted estimate string for display.
 */
export function getQuickEstimate(params: EstimationParams): string {
    const estimate = estimateFileSize(params);
    const confidenceLabel =
        estimate.confidence === 'high' ? '' : estimate.confidence === 'medium' ? ' (approx)' : ' (rough estimate)';
    return `${estimate.formatted}${confidenceLabel}`;
}
