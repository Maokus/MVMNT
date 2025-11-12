import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../mp3-encoder-optional-fallback', () => ({
    registerMp3Encoder: vi.fn(),
    reportMissingEncoder: vi.fn(),
}));

describe('mp3-encoder-loader', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('resolves when encoder module registers successfully', async () => {
        vi.doMock('@mediabunny/mp3-encoder', () => ({
            registerMp3Encoder: vi.fn(),
        }));
        const { ensureMp3EncoderRegistered } = await import('../mp3-encoder-loader');
        await expect(ensureMp3EncoderRegistered()).resolves.toBeUndefined();
        await expect(ensureMp3EncoderRegistered()).resolves.toBeUndefined();
    });

    it('falls back gracefully when optional encoder missing', async () => {
        vi.doMock('@mediabunny/mp3-encoder', () => {
            throw new TypeError('module missing');
        });
        const { ensureMp3EncoderRegistered } = await import('../mp3-encoder-loader');
        await expect(ensureMp3EncoderRegistered()).resolves.toBeUndefined();
        const fallback = await import('../mp3-encoder-optional-fallback');
        expect(fallback.reportMissingEncoder).toHaveBeenCalled();
    });

    it('allows retry after fallback/failed load', async () => {
        vi.doMock('@mediabunny/mp3-encoder', () => {
            throw new TypeError('missing');
        });
        const { ensureMp3EncoderRegistered } = await import('../mp3-encoder-loader');
        await ensureMp3EncoderRegistered();
        vi.doMock('@mediabunny/mp3-encoder', () => ({
            registerMp3Encoder: vi.fn(),
        }));
        vi.resetModules();
        const { ensureMp3EncoderRegistered: retry } = await import('../mp3-encoder-loader');
        await expect(retry()).resolves.toBeUndefined();
    });
});
