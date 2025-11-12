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
const mockGetEncodableVideoCodecs = vi.fn(async () => ['avc']);

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

describe('RenderModal audio codec behaviour', () => {
    beforeEach(() => {
        mockEnsureMp3EncoderRegistered.mockClear();
        mockGetEncodableAudioCodecs.mockClear();
    });

    it('preselects AAC when available codecs load', async () => {
        const { default: RenderModal } = await loadComponent();
        render(<RenderModal onClose={() => { }} />);

        const select = await screen.findByLabelText('Audio Codec');
        expect((select as HTMLSelectElement).value).toBe('mp3');

        const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
        expect(options[0]).toBe('aac');
        expect(options).toContain('mp3');
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
});