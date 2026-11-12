import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaImport } from './useMediaImport';
import { useTimelineStore } from '@state/timelineStore';

const { parseMIDIFileToData } = vi.hoisted(() => ({ parseMIDIFileToData: vi.fn() }));
vi.mock('@core/midi/midi-library', () => ({ parseMIDIFileToData }));

beforeEach(() => {
    useTimelineStore.getState().resetTimeline();
    parseMIDIFileToData.mockResolvedValue({
        events: [
            { type: 'noteOn', note: 60, velocity: 100, channel: 0, time: 1, tick: 1920 },
            { type: 'noteOff', note: 60, velocity: 0, channel: 0, time: 1.5, tick: 2880 },
        ],
        duration: 1.5,
        tempo: 400_000,
        ticksPerQuarter: 960,
        timeSignature: { numerator: 6, denominator: 8 },
        trimmedTicks: 0,
        tempoMap: [{ time: 0, tempo: 400_000 }],
        trackDetails: [],
    });
    const channel = new Float32Array(800);
    const buffer = {
        duration: 0.1,
        sampleRate: 8000,
        numberOfChannels: 1,
        length: 800,
        getChannelData: () => channel,
    } as unknown as AudioBuffer;
    vi.stubGlobal(
        'AudioContext',
        class {
            decodeAudioData = vi.fn(async () => buffer);
            close = vi.fn(async () => {});
        }
    );
});
afterEach(() => {
    cleanup();
    useTimelineStore.getState().resetTimeline();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function audioFile(name: string) {
    const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'audio/mp3' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(3) });
    return file;
}

describe('mixed media track creation', () => {
    it('creates correctly named MIDI/audio tracks at zero with filenames on clips and initial MIDI timing', async () => {
        const { result } = renderHook(() =>
            useMediaImport({ requestImportMode: vi.fn(), requestTempoImport: vi.fn() })
        );
        await act(async () =>
            result.current.importFiles([
                audioFile('vocal.mp3'),
                new File(['midi'], 'piano.mid'),
                audioFile('drums.mp3'),
                new File(['midi'], 'bass.MIDI'),
            ])
        );
        const state = useTimelineStore.getState();
        const tracks = state.tracksOrder.map((id) => state.tracks[id]);
        expect(tracks.map((track) => track.type)).toEqual(['midi', 'midi', 'audio', 'audio']);
        expect(tracks.map((track) => track.name)).toEqual([
            'MIDI Track 1',
            'MIDI Track 2',
            'Audio Track 1',
            'Audio Track 2',
        ]);
        expect(tracks.map((track) => track.clips?.[0].name)).toEqual([
            'piano.mid',
            'bass.MIDI',
            'vocal.mp3',
            'drums.mp3',
        ]);
        expect(tracks.map((track) => track.clips?.[0].offsetTicks)).toEqual([0, 0, 0, 0]);
        expect(state.timeline.globalBpm).toBe(150);
        expect(state.timeline.timeSignature).toEqual({ numerator: 6, denominator: 8 });
        expect(Object.values(state.midiCache).every((cache) => cache.bounds?.minTick === 1920)).toBe(true);
        expect(result.current.stage).toBe('idle');
    });
});
