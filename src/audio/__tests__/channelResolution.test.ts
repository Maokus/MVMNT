import { describe, expect, it } from 'vitest';
import type { AudioFeatureTrack } from '@audio/features/audioFeatureTypes';
import { resolveChannel } from '@audio/features/channelResolution';

const track: Pick<AudioFeatureTrack, 'channels' | 'channelAliases'> = {
    channels: 2,
    channelAliases: ['Left', 'Right'],
};

describe('resolveChannel', () => {
    it('returns numeric channels directly', () => {
        expect(resolveChannel(1, { track })).toBe(1);
    });

    it('resolves string numbers', () => {
        expect(resolveChannel('1', { track })).toBe(1);
    });

    it('resolves aliases from track metadata', () => {
        expect(resolveChannel('Left', { track })).toBe(0);
        expect(resolveChannel('right', { track })).toBe(1);
    });

    it('resolves aliases from cache fallback', () => {
        expect(
            resolveChannel('center', {
                track: { channels: 3, channelAliases: ['L', 'R', 'C'] } as Pick<
                    AudioFeatureTrack,
                    'channels' | 'channelAliases'
                >,
                cacheAliases: ['Left', 'Right', 'Center'],
            }),
        ).toBe(2);
    });

    it('defaults to channel zero when value is nullish', () => {
        expect(resolveChannel(null, { track })).toBe(0);
        expect(resolveChannel(undefined, { track })).toBe(0);
    });

    it('throws for out of range indices', () => {
        expect(() => resolveChannel(5, { track })).toThrow(/out of range/i);
    });

    it('throws for unknown aliases with helpful message', () => {
        expect(() => resolveChannel('Surround', { track })).toThrow(/Unknown channel alias/i);
    });
});
