import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exportScene = vi.fn();

vi.mock('@persistence/index', () => ({
    exportScene: (...args: unknown[]) => exportScene(...args),
    importScene: vi.fn(),
}));
vi.mock('@persistence/local-file-store', () => ({
    LocalFileStore: { save: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@app/analytics', () => ({
    analytics: { capture: vi.fn().mockResolvedValue(undefined) },
}));

import { useMenuBar } from '../useMenuBar';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function exported(byte = 1) {
    return {
        ok: true,
        mode: 'zip-package',
        envelope: {},
        zip: new Uint8Array([byte]),
        digest: `${byte}`,
        warnings: [],
    };
}

describe('useMenuBar document save queue', () => {
    beforeEach(() => {
        exportScene.mockReset();
        Object.defineProperty(window, 'mvmntDesktop', {
            configurable: true,
            value: {
                documents: {
                    getState: vi.fn().mockResolvedValue({ status: 'saved', displayName: 'Scene.mvt' }),
                    beginSave: vi.fn().mockResolvedValue({ status: 'ready', sessionId: 'save-session' }),
                    writeSaveChunk: vi.fn().mockResolvedValue(undefined),
                    completeSave: vi.fn().mockResolvedValue({ status: 'saved' }),
                    abortSave: vi.fn().mockResolvedValue(undefined),
                },
            },
        });
    });

    it('coalesces repeat saves into one trailing snapshot and cleans only matching revisions', async () => {
        const first = deferred<ReturnType<typeof exported>>();
        exportScene.mockReturnValueOnce(first.promise).mockResolvedValueOnce(exported(2));
        let revision = 0;
        const markSaveCleanIfRevision = vi.fn((savedRevision: number) => savedRevision === revision);
        const { result } = renderHook(() =>
            useMenuBar({
                visualizer: null,
                sceneName: 'Scene',
                onSceneNameChange: vi.fn(),
                isDirty: true,
                markSaveClean: vi.fn(),
                captureSaveRevision: () => revision,
                markSaveCleanIfRevision,
                markDirty: vi.fn(),
                requestUnsavedChangesDecision: vi.fn(),
            })
        );

        let firstSave!: Promise<boolean>;
        let queuedSave!: Promise<boolean>;
        act(() => {
            firstSave = result.current.saveProject();
        });
        await waitFor(() => expect(exportScene).toHaveBeenCalledTimes(1));
        revision = 1;
        act(() => {
            queuedSave = result.current.saveProject();
        });
        first.resolve(exported());

        await expect(firstSave).resolves.toBe(true);
        await expect(queuedSave).resolves.toBe(true);
        expect(exportScene).toHaveBeenCalledTimes(2);
        expect(markSaveCleanIfRevision).toHaveBeenNthCalledWith(1, 0);
        expect(markSaveCleanIfRevision).toHaveBeenNthCalledWith(2, 1);
    });
});
