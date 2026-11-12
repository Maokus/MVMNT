import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics } from '@app/analytics';
import { useAudioImport } from './useAudioImport';
import { estimateAudioImportBatch } from '@audio/audioMemoryDiagnostics';

const addAudioTrack = vi.hoisted(() => vi.fn());

vi.mock('@state/timelineStore', () => ({
    useTimelineStore: Object.assign(
        (selector: (state: { addAudioTrack: typeof addAudioTrack }) => unknown) => selector({ addAudioTrack }),
        { getState: () => ({ tracks: {} }) }
    ),
}));
vi.mock('@audio/audioMemoryDiagnostics', () => ({
    estimateAudioImportBatch: vi.fn(async () => ({
        severity: 'ok',
        fileBytes: 1,
        decodedPcmBytes: 1,
        retainedHeapBytes: 1,
    })),
    formatBytes: vi.fn(() => '1 B'),
    AUDIO_IMPORT_DANGER_BYTES: 100,
    AUDIO_IMPORT_WARNING_BYTES: 50,
}));
vi.mock('@state/audioMemoryDiagnosticsStore', () => ({ recordAudioMemoryDiagnostic: vi.fn() }));

describe('useAudioImport analytics', () => {
    beforeEach(() => addAudioTrack.mockReset());

    it('reports a bounded failure only after audio track creation fails', async () => {
        addAudioTrack.mockRejectedValueOnce(new Error('private file name'));
        const capture = vi.spyOn(analytics, 'capture').mockResolvedValue(undefined);
        const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        const { result } = renderHook(() => useAudioImport());

        await act(async () => {
            expect(await result.current.importAudioFile(new File([new Uint8Array([1])], 'private.wav'))).toBe(false);
        });

        expect(capture).toHaveBeenCalledWith('media_import_failed', {
            media_type: 'audio',
            failure_category: 'import',
            stage: 'decode_or_add',
        });
        capture.mockRestore();
        alert.mockRestore();
    });
});

describe('audio batch safeguards', () => {
    const estimate = {
        severity: 'ok' as const,
        fileBytes: 1,
        decodedPcmBytes: 1,
        retainedHeapBytes: 1,
        fileCount: 1,
        files: [],
    };
    beforeEach(() => {
        addAudioTrack.mockReset().mockResolvedValue('audio-track');
        vi.mocked(estimateAudioImportBatch).mockResolvedValue(estimate);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('checks the entire audio batch before importing and skips it when declined', async () => {
        vi.mocked(estimateAudioImportBatch).mockResolvedValue({ ...estimate, retainedHeapBytes: 75 });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const files = [new File(['a'], 'a.wav'), new File(['b'], 'b.mp3')];
        const { result } = renderHook(() => useAudioImport());
        await act(async () => {
            expect(await result.current.importAudioFiles(files)).toEqual({
                imported: 0,
                skipped: 2,
                failed: 0,
                canceled: true,
            });
        });
        expect(estimateAudioImportBatch).toHaveBeenCalledWith(files);
        expect(confirm).toHaveBeenCalledOnce();
        expect(addAudioTrack).not.toHaveBeenCalled();
    });

    it('retains successful imports and continues after a failed decode', async () => {
        addAudioTrack.mockRejectedValueOnce(new Error('invalid audio'));
        const { result } = renderHook(() => useAudioImport());
        await act(async () => {
            expect(
                await result.current.importAudioFiles([new File(['a'], 'bad.wav'), new File(['b'], 'good.wav')])
            ).toEqual({ imported: 1, skipped: 0, failed: 1, canceled: false });
        });
        expect(addAudioTrack).toHaveBeenCalledTimes(2);
        expect(result.current.audioImportProgress.active).toBe(false);
    });

    it('finishes the current decode and skips remaining files when cancelled', async () => {
        let resolve!: (id: string) => void;
        addAudioTrack.mockImplementationOnce(
            () =>
                new Promise<string>((r) => {
                    resolve = r;
                })
        );
        const { result } = renderHook(() => useAudioImport());
        let pending!: ReturnType<typeof result.current.importAudioFiles>;
        await act(async () => {
            pending = result.current.importAudioFiles([new File(['a'], 'a.wav'), new File(['b'], 'b.wav')]);
        });
        expect(result.current.audioImportProgress.active).toBe(true);
        act(() => result.current.cancelAudioImport());
        await act(async () => {
            resolve('first-track');
            expect(await pending).toEqual({ imported: 1, skipped: 1, failed: 0, canceled: true });
        });
        expect(addAudioTrack).toHaveBeenCalledOnce();
        expect(result.current.audioImportProgress.active).toBe(false);
    });
});
