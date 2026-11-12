import { copyBytesInChunks } from '@utils/copyBytes';
import { measureProjectLoadWork } from '@utils/projectLoadDiagnostics';
import { AudioAssetStore } from '@persistence/audio-asset-store';
import type { AudioCacheEntry } from './audioTypes';
import { audioDecodeQueue } from './work-queue';

export async function createAudioBufferFromAsset(
    record: any,
    bytes: Uint8Array,
    isCurrent: () => boolean = () => true
): Promise<AudioBuffer> {
    const length = Math.max(1, record.durationSamples || Math.round(record.durationSeconds * record.sampleRate));
    const sampleRate = record.sampleRate || 44100;
    const channels = Math.max(1, record.channels || 1);
    const AudioContextCtor =
        typeof window !== 'undefined' ? (window as any).AudioContext || (window as any).webkitAudioContext : undefined;
    if (typeof AudioContextCtor === 'function') {
        const ctx = new AudioContextCtor();
        try {
            const ownedBytes = await copyBytesInChunks(bytes);
            if (!isCurrent()) throw new DOMException('Audio source replaced', 'AbortError');
            const buffer = await ctx.decodeAudioData(ownedBytes.buffer);
            return buffer;
        } finally {
            await ctx.close?.();
        }
    }
    if (typeof AudioBuffer === 'function') {
        try {
            return new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
        } catch {
            /* ignore */
        }
    }
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) channelData.push(new Float32Array(length));
    const durationSeconds = typeof record.durationSeconds === 'number' ? record.durationSeconds : length / sampleRate;
    const fallback: AudioBuffer = {
        length,
        duration: durationSeconds,
        sampleRate,
        numberOfChannels: channels,
        copyFromChannel: (destination: Float32Array, channelNumber: number, startInChannel = 0) => {
            const source = channelData[Math.min(channelNumber, channelData.length - 1)] ?? channelData[0];
            destination.set(source.subarray(startInChannel, startInChannel + destination.length));
        },
        copyToChannel: (source: Float32Array, channelNumber: number, startInChannel = 0) => {
            const target = channelData[Math.min(channelNumber, channelData.length - 1)] ?? channelData[0];
            target.set(source, startInChannel);
        },
        getChannelData: (channel: number) => channelData[Math.min(channel, channelData.length - 1)] ?? channelData[0],
    } as unknown as AudioBuffer;
    return fallback;
}

export function decodeAudioSource(
    entry: AudioCacheEntry,
    isCurrent: () => boolean,
    priority = 1
): Promise<AudioBuffer> {
    const key = entry.originalFile ?? entry;
    return audioDecodeQueue.schedule(
        key,
        async () => {
            if (!isCurrent()) throw new DOMException('Audio source replaced', 'AbortError');
            const original = entry.originalFile;
            const bytes =
                original?.bytes ?? (original?.assetId ? await AudioAssetStore.get(original.assetId) : undefined);
            if (!isCurrent()) throw new DOMException('Audio source replaced', 'AbortError');
            if (!bytes) throw new Error('original asset unavailable');
            return measureProjectLoadWork('Audio decode', () =>
                createAudioBufferFromAsset(
                    entry,
                    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
                    isCurrent
                )
            );
        },
        priority
    );
}
