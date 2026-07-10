import { describe, expect, it } from 'vitest';
import { summarizeAudioMemory } from '@audio/audioMemoryDiagnostics';
import type { AudioCacheEntry } from '@audio/audioTypes';

function makeAudioEntry(partial: Partial<AudioCacheEntry>): AudioCacheEntry {
    return {
        audioBuffer: { length: 100, numberOfChannels: 2, duration: 1, sampleRate: 100 } as AudioBuffer,
        durationTicks: 960,
        sampleRate: 100,
        channels: 2,
        durationSeconds: 1,
        durationSamples: 100,
        ...partial,
    };
}

describe('audio memory diagnostics', () => {
    it('counts referenced original assets outside retained heap', () => {
        const summary = summarizeAudioMemory(
            {
                inline: makeAudioEntry({
                    originalFile: {
                        mimeType: 'audio/wav',
                        bytes: new Uint8Array(32),
                        byteLength: 32,
                        storage: 'inline',
                    },
                }),
                referenced: makeAudioEntry({
                    originalFile: {
                        mimeType: 'audio/wav',
                        byteLength: 1024,
                        assetId: 'asset-1',
                        storage: 'indexeddb',
                    },
                }),
            },
            {},
        );

        expect(summary.decodedPcmBytes).toBe(1600);
        expect(summary.originalFileBytes).toBe(32);
        expect(summary.externalOriginalFileBytes).toBe(1024);
        expect(summary.retainedAudioBytes).toBe(1632);
    });
});
