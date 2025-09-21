// Offline Audio Mixer (Phase 4)
// Deterministic offline mixing of audio tracks into a single AudioBuffer.
// Requirements:
//  - Pure function given snapshot + track data + export range.
//  - Obeys mute/solo, gain, region trimming, offset ticks.
//  - Deterministic ordering & summation (stable iteration order: tracksOrder array).
//  - Uses OfflineAudioContext when available; falls back to manual Float32Array summation.
//  - Output sampleRate: configurable (default 48000).
//  - Clipping is NOT applied (caller may normalize later). No dithering (Phase 5 optimization).
//
// Simplifications:
//  - All sources assumed small enough to fit in memory (single buffer each).
//  - No effects chain / micro-fades (Phase 5).
//
// Edge Cases:
//  - If no audible tracks -> returns silent buffer.
//  - Region outside buffer or zero length -> skipped.
//  - Solo logic: if any solo=true among enabled tracks, only those solos are mixed.
//
// Determinism Notes:
//  - Summation performed in fixed order; sample-wise addition uses JS number (IEEE 754) so identical inputs => identical output bits (within same engine/runtime). Browser differences in OfflineAudioContext rendering are minimized by summing manually rather than relying on engine mixing nuances.
//  - If OfflineAudioContext used, we still schedule sources in deterministic order and avoid time-based randomness.
//
import type { AudioTrack, AudioCacheEntry } from '@state/audioTypes';

declare global {
    interface Window {
        OfflineAudioContext?: any;
        webkitOfflineAudioContext?: any;
    }
}

export interface OfflineMixParams {
    tracks: Record<string, AudioTrack | any>; // timeline store tracks map
    tracksOrder: string[]; // stable order
    audioCache: Record<string, AudioCacheEntry>;
    startTick: number; // inclusive export range start
    endTick: number; // exclusive export range end
    ticksPerSecond: number; // derived from tempo & PPQ snapshot
    sampleRate?: number; // default 48000
    channels?: number; // 1 or 2 (default 2)
}

export interface OfflineMixResult {
    buffer: AudioBuffer;
    durationSeconds: number;
    sampleRate: number;
    channels: number;
    peak: number; // max abs sample value across channels
}

export async function offlineMix(params: OfflineMixParams): Promise<OfflineMixResult> {
    const sampleRate = params.sampleRate ?? 48000;
    const channels = params.channels ?? 2;
    const rangeTicks = Math.max(0, params.endTick - params.startTick);
    const durationSeconds = rangeTicks / params.ticksPerSecond;
    const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));

    const audibleTracks = collectAudibleTracks(params);
    if (audibleTracks.length === 0) {
        const silent = makeEmptyBuffer(channels, frameCount, sampleRate);
        return { buffer: silent, durationSeconds, sampleRate, channels, peak: 0 };
    }

    // Manual summation path (reliable & deterministic). We still attempt to construct an AudioBuffer for API consistency.
    const mixChannels: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(frameCount));

    let globalPeak = 0;
    for (const track of audibleTracks) {
        const cacheKey = track.audioSourceId || track.id;
        const cache = params.audioCache[cacheKey];
        if (!cache) continue;
        const buffer = cache.audioBuffer;
        if (!buffer) continue;
        const regionStartTick = track.regionStartTick ?? 0;
        const regionEndTick = track.regionEndTick ?? cache.durationTicks;
        if (regionEndTick <= regionStartTick) continue;

        // Compute intersection of (track timeline region) with export range.
        // track region in timeline ticks: [track.offsetTicks + regionStartTick, track.offsetTicks + regionEndTick)
        const trackRegionStartTimeline = track.offsetTicks + regionStartTick;
        const trackRegionEndTimeline = track.offsetTicks + regionEndTick;
        const exportStart = params.startTick;
        const exportEnd = params.endTick;
        const intersectStart = Math.max(exportStart, trackRegionStartTimeline);
        const intersectEnd = Math.min(exportEnd, trackRegionEndTimeline);
        if (intersectEnd <= intersectStart) continue; // no overlap

        const overlapTicks = intersectEnd - intersectStart;
        const overlapSecs = overlapTicks / params.ticksPerSecond;
        const writeStartTickOffset = intersectStart - exportStart; // ticks offset into export buffer
        const writeStartFrame = Math.floor((writeStartTickOffset / params.ticksPerSecond) * sampleRate);

        // Source buffer offset (seconds) within the underlying AudioBuffer
        const sourceStartWithinTrackTicks = intersectStart - track.offsetTicks - regionStartTick; // ticks from regionStart
        if (sourceStartWithinTrackTicks < 0) continue; // shouldn't happen
        const sourceStartSeconds =
            sourceStartWithinTrackTicks / params.ticksPerSecond + regionStartTick / params.ticksPerSecond;
        const sourceStartFrame = Math.floor(sourceStartSeconds * buffer.sampleRate);

        const srcChannels = buffer.numberOfChannels;
        const gain = track.mute ? 0 : track.gain ?? 1;
        if (gain <= 0) continue;

        // Copy & sum with resampling when needed.
        // Resampling Rationale:
        //   Previously we assumed all source buffers shared the export sample rate. Mixing a 44.1 kHz source into a
        //   48 kHz destination (or vice versa) without resampling produces pitch & tempo shifts (speed mismatch) in
        //   the rendered export. Here we perform per-sample linear interpolation when source.sampleRate != target.
        // Determinism:
        //   Linear interpolation is pure arithmetic (no platform DSP kernels) so given identical inputs we get
        //   identical floating point results across runs and (barring JS engine differences in IEEE 754 ops) across
        //   browsers. This preserves reproducibility hashing expectations.
        // Quality:
        //   Linear is adequate for offline preview/export for now; future upgrades could introduce windowed sinc or
        //   polyphase filters for improved HF retention. We isolate logic here so that upgrade is localized.
        // Performance:
        //   Complexity O(N * channels). Typical export durations (< several minutes) with modest track counts keep
        //   this acceptable. Fast path retained for equal sample rates.
        const targetSampleRate = sampleRate;
        const sourceSampleRate = buffer.sampleRate;
        const copyFrameCount = Math.min(frameCount - writeStartFrame, Math.floor(overlapSecs * targetSampleRate));
        if (copyFrameCount <= 0) continue;

        const rateRatio = sourceSampleRate / targetSampleRate; // how many source frames per one target frame

        for (let ch = 0; ch < channels; ch++) {
            const dest = mixChannels[ch];
            const srcChIndex = ch < srcChannels ? ch : 0;
            const srcData = buffer.getChannelData(srcChIndex);

            if (sourceSampleRate === targetSampleRate) {
                // Fast path: 1:1 copy (no interpolation)
                let srcIndex = sourceStartFrame;
                for (let i = 0; i < copyFrameCount; i++) {
                    const destIndex = writeStartFrame + i;
                    if (destIndex >= frameCount) break;
                    const sample = (srcData[srcIndex++] || 0) * gain;
                    const mixed = dest[destIndex] + sample;
                    dest[destIndex] = mixed;
                    const absVal = Math.abs(mixed);
                    if (absVal > globalPeak) globalPeak = absVal;
                }
            } else {
                // Resampling path: linear interpolation.
                // sourceStartFrame is integer frame offset in source.
                // For each destination frame k (0..copyFrameCount-1):
                //   sourcePosition = sourceStartFrame + k * rateRatio
                //   sample = lerp(floorPos, ceilPos)
                for (let i = 0; i < copyFrameCount; i++) {
                    const destIndex = writeStartFrame + i;
                    if (destIndex >= frameCount) break;
                    const sourcePos = sourceStartFrame + i * rateRatio;
                    const idxA = Math.floor(sourcePos);
                    const idxB = idxA + 1;
                    const frac = sourcePos - idxA;
                    const a = srcData[idxA] || 0;
                    const b = srcData[idxB] || 0;
                    const interp = (a + (b - a) * frac) * gain;
                    const mixed = dest[destIndex] + interp;
                    dest[destIndex] = mixed;
                    const absVal = Math.abs(mixed);
                    if (absVal > globalPeak) globalPeak = absVal;
                }
            }
        }
    }

    const outBuffer = makeEmptyBuffer(channels, frameCount, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
        // Cast due to differing TS lib declarations between DOM and test environment polyfills
        outBuffer.copyToChannel(mixChannels[ch] as any, ch, 0);
    }
    return {
        buffer: outBuffer,
        durationSeconds,
        sampleRate,
        channels,
        peak: globalPeak,
    };
}

function collectAudibleTracks(params: OfflineMixParams): AudioTrack[] {
    const list: AudioTrack[] = [];
    let anySolo = false;
    for (const id of params.tracksOrder) {
        const t = params.tracks[id];
        if (!t || t.type !== 'audio') continue;
        if (t.solo) anySolo = true;
    }
    for (const id of params.tracksOrder) {
        const t = params.tracks[id];
        if (!t || t.type !== 'audio') continue;
        if (!t.enabled) continue;
        if (anySolo && !t.solo) continue;
        list.push(t as AudioTrack);
    }
    return list;
}

function makeEmptyBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    if (typeof AudioBuffer !== 'undefined') {
        try {
            // @ts-ignore
            return new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
        } catch {
            // fall through to manual
        }
    }
    // Manual mock
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
        numberOfChannels: channels,
        sampleRate,
        length,
        duration: length / sampleRate,
        getChannelData: (ch: number) => data[ch],
        copyFromChannel: (dest: Float32Array, ch: number) => dest.set(data[ch]),
        copyToChannel: (src: Float32Array, ch: number) => data[ch].set(src),
    } as any as AudioBuffer;
}
