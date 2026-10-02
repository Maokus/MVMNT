import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics } from '@app/analytics';
import { useAudioImport } from './useAudioImport';

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
