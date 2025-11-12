import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockExportSettings = {
    fps: 60,
    width: 1920,
    height: 1080,
    fullDuration: true,
    startTime: 0,
    endTime: 0,
    includeAudio: true,
    qualityPreset: 'high',
    videoCodec: 'h264',
    videoBitrateMode: 'auto',
    videoBitrate: 0,
    audioCodec: 'aac',
    audioBitrate: 192000,
    audioSampleRate: 'auto' as const,
    audioChannels: 2 as const,
};

const mockSetExportSettings = vi.fn();
const mockExportVideo = vi.fn(() => Promise.resolve());
const mockExportSequence = vi.fn(() => Promise.resolve());

const mockEnsureMp3EncoderRegistered = vi.fn(() => Promise.resolve());

const mockGetEncodableAudioCodecs = vi.fn(async () => ['aac', 'opus']);
const mockGetEncodableVideoCodecs = vi.fn(async () => ['avc', 'vp9']);

vi.mock('@context/VisualizerContext', () => ({
    useVisualizer: () => ({
        exportSettings: mockExportSettings,
        setExportSettings: mockSetExportSettings,
        exportVideo: mockExportVideo,
        exportSequence: mockExportSequence,
        sceneName: 'My Scene',
    }),
}));

vi.mock('@export/mp3-encoder-loader', () => ({
    ensureMp3EncoderRegistered: mockEnsureMp3EncoderRegistered,
}));

vi.mock('mediabunny', () => ({
    canEncodeVideo: vi.fn(),
    canEncodeAudio: vi.fn(),
    getEncodableVideoCodecs: mockGetEncodableVideoCodecs,
    getEncodableAudioCodecs: mockGetEncodableAudioCodecs,
}));

// Lazy import to ensure mocks apply before module evaluation
const loadComponent = () => import('../RenderModal');

describe('RenderModal export options behaviour', () => {
    beforeEach(() => {
        mockEnsureMp3EncoderRegistered.mockClear();
        mockGetEncodableAudioCodecs.mockClear();
    });

    it('defaults audio codec to pcm-s16 when capabilities load', async () => {
        const { default: RenderModal } = await loadComponent();
        render(<RenderModal onClose={() => { }} />);

        const select = await screen.findByLabelText('Audio Codec');
        expect((select as HTMLSelectElement).value).toBe('pcm-s16');

        const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
        expect(options[0]).toBe('pcm-s16');
        expect(options).toContain('mp3');
        expect(options).toContain('opus');
    });

    it('prefetches MP3 encoder when user selects mp3', async () => {
        const { default: RenderModal } = await loadComponent();
        render(<RenderModal onClose={() => { }} />);

        const select = await screen.findByLabelText('Audio Codec');
        await act(async () => {
            fireEvent.change(select, { target: { value: 'mp3' } });
        });

        await waitFor(() => expect(mockEnsureMp3EncoderRegistered).toHaveBeenCalled());
    });

    it('allows manual codec overrides to persist', async () => {
        const { default: RenderModal } = await loadComponent();
        render(<RenderModal onClose={() => { }} />);

        const audioCodecSelect = await screen.findByLabelText('Audio Codec');
        const videoCodecSelect = await screen.findByLabelText('Video Codec');

        await act(async () => {
            fireEvent.change(audioCodecSelect, { target: { value: 'mp3' } });
            fireEvent.change(videoCodecSelect, { target: { value: 'vp9' } });
        });

        await waitFor(() => {
            expect((audioCodecSelect as HTMLSelectElement).value).toBe('mp3');
            expect((videoCodecSelect as HTMLSelectElement).value).toBe('vp9');
        });
    });

    it('switching to WebM format chooses vp9 and opus defaults', async () => {
        const { default: RenderModal } = await loadComponent();
        render(<RenderModal onClose={() => { }} />);

        const formatSelect = await screen.findByLabelText('Format');
        await act(async () => {
            fireEvent.change(formatSelect, { target: { value: 'webm' } });
        });

        const videoCodecSelect = await screen.findByLabelText('Video Codec');
        const audioCodecSelect = await screen.findByLabelText('Audio Codec');
        expect((videoCodecSelect as HTMLSelectElement).value).toBe('vp9');
        expect((audioCodecSelect as HTMLSelectElement).value).toBe('opus');
    });

    it('submits webm export with container and defaults', async () => {
        const { default: RenderModal } = await loadComponent();
        render(<RenderModal onClose={() => { }} />);

        const formatSelect = await screen.findByLabelText('Format');
        await act(async () => {
            fireEvent.change(formatSelect, { target: { value: 'webm' } });
        });

        const startButton = await screen.findByRole('button', { name: 'Start WebM Render' });
        await act(async () => {
            fireEvent.click(startButton);
        });

        await waitFor(() => expect(mockExportVideo).toHaveBeenCalled());
        const lastCall = mockExportVideo.mock.calls[mockExportVideo.mock.calls.length - 1] as any[] | undefined;
        expect(lastCall?.[0]).toMatchObject({ container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' });
    });
});