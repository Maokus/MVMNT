import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaImport } from './useMediaImport';
import { useFileDrop } from './useFileDrop';
import { TrackImportButton } from '../header/TrackImportButton';
import { AUDIO_FILE_EXTENSIONS } from '../utils/fileTypeUtils';

const { importMidiFile, importAudioFiles } = vi.hoisted(() => ({
    importMidiFile: vi.fn(),
    importAudioFiles: vi.fn(),
}));
vi.mock('./useMidiImport', () => ({ useMidiImport: () => ({ importMidiFile }) }));
vi.mock('./useAudioImport', () => ({
    useAudioImport: () => ({ importAudioFiles, audioImportProgress: { active: false }, cancelAudioImport: vi.fn() }),
}));
const options = { requestImportMode: vi.fn(), requestTempoImport: vi.fn() };
const file = (name: string, type = '') => new File(['data'], name, { type, lastModified: 123 });

beforeEach(() => {
    vi.clearAllMocks();
    importMidiFile.mockReset().mockResolvedValue(true);
    importAudioFiles.mockReset().mockResolvedValue({ imported: 1, failed: 0, skipped: 0, canceled: false });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('shared media import queue', () => {
    it('routes MIDI before audio, preserving order within types and deduplicating', async () => {
        const calls: string[] = [];
        importMidiFile.mockImplementation(async (f: File) => {
            calls.push(f.name);
            return true;
        });
        importAudioFiles.mockImplementation(async (files: File[]) => {
            calls.push(...files.map((f) => f.name));
        });
        const { result } = renderHook(() => useMediaImport(options));
        const a = file('FIRST.MID');
        const b = file('second', 'audio/x-midi');
        const audioA = file('vocal.FLAC');
        const audioB = file('audio', 'audio/wav');
        await act(async () => result.current.importFiles([audioA, a, audioB, b, a]));
        expect(calls).toEqual(['FIRST.MID', 'second', 'vocal.FLAC', 'audio']);
        expect(importAudioFiles).toHaveBeenCalledOnce();
        expect(importAudioFiles).toHaveBeenCalledWith([audioA, audioB]);
        expect(window.alert).not.toHaveBeenCalled();
        expect(result.current.busy).toBe(false);
    });

    it('keeps MIDI dialogs sequential and blocks reentrant imports synchronously', async () => {
        let resolve!: (value: boolean) => void;
        importMidiFile.mockImplementationOnce(
            () =>
                new Promise<boolean>((r) => {
                    resolve = r;
                })
        );
        const { result } = renderHook(() => useMediaImport(options));
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.importFiles([file('first.mid'), file('second.mid'), file('audio.wav')]);
            void result.current.importFiles([file('overlap.mid')]);
        });
        expect(result.current.stage).toBe('midi');
        expect(result.current.busy).toBe(true);
        expect(importMidiFile).toHaveBeenCalledTimes(1);
        expect(importAudioFiles).not.toHaveBeenCalled();
        await act(async () => {
            resolve(true);
            await pending;
        });
        expect(importMidiFile).toHaveBeenCalledTimes(2);
        expect(importAudioFiles).toHaveBeenCalledOnce();
        expect(result.current.stage).toBe('idle');
    });

    it('continues after a thrown MIDI failure or a cancelled MIDI file', async () => {
        importMidiFile.mockRejectedValueOnce(new Error('track creation failed')).mockResolvedValueOnce(false);
        const { result } = renderHook(() => useMediaImport(options));
        await act(async () =>
            result.current.importFiles([file('bad.mid'), file('cancel.mid'), file('good.mid'), file('good.wav')])
        );
        expect(importMidiFile).toHaveBeenCalledTimes(3);
        expect(importAudioFiles).toHaveBeenCalledOnce();
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('bad.mid'));
        expect(result.current.busy).toBe(false);
    });

    it('reports unsupported files once and does not start import for an empty selection', async () => {
        const { result } = renderHook(() => useMediaImport(options));
        await act(async () => result.current.importFiles([]));
        expect(result.current.busy).toBe(false);
        await act(async () => result.current.importFiles([file('notes.txt'), file('image.png')]));
        expect(window.alert).toHaveBeenCalledOnce();
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Ignored 2 files'));
        expect(importMidiFile).not.toHaveBeenCalled();
        expect(importAudioFiles).not.toHaveBeenCalled();
    });

    it('unlocks the queue after audio preflight fails or the audio batch is canceled', async () => {
        importAudioFiles.mockRejectedValueOnce(new Error('preflight failed'));
        const { result } = renderHook(() => useMediaImport(options));
        await act(async () => result.current.importFiles([file('first.wav')]));
        expect(result.current.busy).toBe(false);
        importAudioFiles.mockResolvedValueOnce({ imported: 0, skipped: 1, failed: 0, canceled: true });
        await act(async () => result.current.importFiles([file('second.wav')]));
        expect(importAudioFiles).toHaveBeenCalledTimes(2);
        expect(result.current.stage).toBe('idle');
    });

    it('stops the remaining queue after unmount', async () => {
        let resolve!: (value: boolean) => void;
        importMidiFile.mockImplementationOnce(
            () =>
                new Promise<boolean>((r) => {
                    resolve = r;
                })
        );
        const { result, unmount } = renderHook(() => useMediaImport(options));
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.importFiles([file('first.mid'), file('second.mid'), file('audio.wav')]);
        });
        unmount();
        await act(async () => {
            resolve(false);
            await pending;
        });
        expect(importMidiFile).toHaveBeenCalledOnce();
        expect(importAudioFiles).not.toHaveBeenCalled();
    });
});

function Harness() {
    const media = useMediaImport(options);
    const { onPanelDrop } = useFileDrop({ importFiles: media.importFiles });
    return (
        <div data-testid="panel" onDrop={onPanelDrop}>
            <TrackImportButton fileRef={media.fileRef} onChange={media.handleChange} busy={media.busy} />
        </div>
    );
}

describe('shared picker and panel drop', () => {
    it('opens one multi-file input with all recognized extensions and resets it immediately', async () => {
        render(<Harness />);
        const input = screen.getByLabelText('MIDI and audio files') as HTMLInputElement;
        expect(input.multiple).toBe(true);
        expect(input.accept).toContain('.mid,.midi,audio/*');
        for (const ext of AUDIO_FILE_EXTENSIONS) expect(input.accept).toContain(`.${ext}`);
        const click = vi.spyOn(input, 'click');
        fireEvent.click(screen.getByRole('button', { name: 'Import files' }));
        expect(click).toHaveBeenCalledOnce();
        const reset = vi.spyOn(input, 'value', 'set');
        const files = [file('notes.mid'), file('audio.wav')];
        await act(async () => {
            fireEvent.change(input, { target: { files } });
        });
        expect(reset).toHaveBeenCalledWith('');
        await act(async () => {
            fireEvent.change(input, { target: { files } });
        });
        expect(importMidiFile).toHaveBeenCalledTimes(2);
        expect(importAudioFiles).toHaveBeenCalledTimes(2);
    });

    it('uses the same queue for drops and prevents a picker or drop from overlapping', async () => {
        let resolve!: (value: boolean) => void;
        importMidiFile.mockImplementationOnce(
            () =>
                new Promise<boolean>((r) => {
                    resolve = r;
                })
        );
        render(<Harness />);
        const input = screen.getByLabelText('MIDI and audio files');
        const files = [file('notes.mid'), file('audio.wav')];
        fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: { files, types: ['Files'] } });
        expect(screen.getByRole('button', { name: 'Import files' })).toBeDisabled();
        fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: { files, types: ['Files'] } });
        fireEvent.change(input, { target: { files } });
        expect(importMidiFile).toHaveBeenCalledOnce();
        await act(async () => {
            resolve(true);
        });
        expect(importAudioFiles).toHaveBeenCalledWith([files[1]]);
        expect(screen.getByRole('button', { name: 'Import files' })).toBeEnabled();
    });
});
