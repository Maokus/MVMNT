import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { useDocumentRevisionStore } from '@state/documentRevisionStore';
import { useDocumentSaveStatusStore } from '@state/documentSaveStatusStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useOnboarding } from '../useOnboarding';

const { apply } = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('@workspace/templates/useTemplateApply', () => ({ useTemplateApply: () => apply }));
vi.mock('@workspace/templates/easyModeTemplates', () => ({ easyModeTemplates: [{ id: 'default', name: 'Demo' }] }));

const ready = { ready: true, suppressed: false };
function editTitle(value: string) {
    act(() => {
        dispatchSceneCommand({ type: 'updateMacroValue', macroId: 'TITLE', value });
    });
}
function play() {
    act(() => {
        useTimelineStore.setState((state) => ({ transport: { ...state.transport, isPlaying: true } }));
        useTimelineStore.getState().setCurrentTick(100);
    });
}

beforeEach(() => {
    localStorage.clear();
    apply.mockReset().mockResolvedValue(true);
    dispatchSceneCommand({ type: 'clearScene', clearMacros: true });
    dispatchSceneCommand({
        type: 'createMacro',
        macroId: 'TITLE',
        definition: { type: 'string', value: 'ELECTONE' },
    });
    useTimelineStore.getState().pause();
    useTimelineStore.getState().setCurrentTick(0);
    useDocumentSaveStatusStore.setState({ successfulSave: null });
    useTemplateStatusStore.setState({ pendingCount: 0, isTemplateLoading: false });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('welcome lifecycle', () => {
    it('waits for readiness, does not mark display as dismissal, and suppresses automated rendering', () => {
        const { result, rerender } = renderHook((props) => useOnboarding(props), {
            initialProps: { ...ready, ready: false },
        });
        expect(result.current.showWelcome).toBe(false);
        rerender(ready);
        expect(result.current.showWelcome).toBe(true);
        expect(localStorage.getItem('mvmnt_onboarding_v2')).toBeNull();
        rerender({ ...ready, suppressed: true });
        expect(result.current.showWelcome).toBe(false);
    });

    it('honours legacy dismissal but allows Help to reopen the welcome', () => {
        localStorage.setItem('mvmnt_onboarded_v1', '1');
        const { result } = renderHook(() => useOnboarding(ready));
        expect(result.current.showWelcome).toBe(false);
        act(() => result.current.openWelcome());
        expect(result.current.showWelcome).toBe(true);
        act(() => result.current.closeWelcome());
        expect(localStorage.getItem('mvmnt_onboarding_v2')).toBe('dismissed');
    });

    it('keeps cancellation and failure retryable and prevents concurrent demo loads', async () => {
        let resolve!: (value: boolean) => void;
        apply.mockReturnValueOnce(
            new Promise<boolean>((done) => {
                resolve = done;
            })
        );
        const { result } = renderHook(() => useOnboarding(ready));
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.startDemo();
        });
        await act(async () => {
            await result.current.startDemo();
        });
        expect(apply).toHaveBeenCalledTimes(1);
        expect(result.current.busy).toBe(true);
        act(() => result.current.closeWelcome());
        expect(result.current.showWelcome).toBe(true);
        await act(async () => {
            resolve(false);
            await pending;
        });
        expect(result.current.session).toBeNull();
        expect(localStorage.getItem('mvmnt_onboarding_v2')).toBeNull();
        apply.mockRejectedValueOnce(new Error('Could not load demo'));
        await act(async () => {
            await result.current.startDemo();
        });
        expect(result.current.error).toBe('Could not load demo');
        expect(result.current.showWelcome).toBe(true);
        await act(async () => {
            await result.current.startDemo();
        });
        expect(result.current.session).not.toBeNull();
        expect(result.current.showWelcome).toBe(false);
    });

    it('does not resume a previous tutorial against the document on reload', () => {
        localStorage.setItem('mvmnt_onboarding_v2', 'started');
        const { result } = renderHook(() => useOnboarding(ready));
        expect(result.current.showWelcome).toBe(false);
        expect(result.current.session).toBeNull();
        expect(apply).not.toHaveBeenCalled();
    });
});

describe('demo progress', () => {
    it('requires playback advancement, a title change, and an explicit successful save of the latest revision', async () => {
        const { result } = renderHook(() => useOnboarding(ready));
        await act(async () => {
            await result.current.startDemo();
        });
        expect(useTimelineStore.getState().transport.isPlaying).toBe(false);
        act(() => useTimelineStore.getState().setCurrentTick(50));
        expect(result.current.session?.played).toBe(false);
        play();
        expect(result.current.session?.played).toBe(true);
        editTitle('   ');
        expect(result.current.session?.edited).toBe(false);
        editTitle('My first visualisation');
        expect(result.current.session?.edited).toBe(true);
        act(() => {
            useDocumentRevisionStore.getState().markClean();
            useDocumentSaveStatusStore.getState().setResult('saved', 'Recovery saved');
        });
        expect(result.current.session?.saved).toBe(false);
        act(() =>
            useDocumentSaveStatusStore.getState().recordSuccessfulSave(useDocumentRevisionStore.getState().revision - 1)
        );
        expect(result.current.session?.saved).toBe(false);
        act(() =>
            useDocumentSaveStatusStore.getState().recordSuccessfulSave(useDocumentRevisionStore.getState().revision)
        );
        expect(result.current.complete).toBe(true);
        expect(localStorage.getItem('mvmnt_onboarding_v2')).toBe('completed');
    });

    it('does not count unrelated edits or a reverted title', async () => {
        const { result } = renderHook(() => useOnboarding(ready));
        await act(async () => {
            await result.current.startDemo();
        });
        act(() => useSceneMetadataStore.getState().setName('Renamed document'));
        expect(result.current.session?.edited).toBe(false);
        editTitle('New title');
        editTitle('ELECTONE');
        expect(result.current.session?.edited).toBe(false);
    });

    it.each(['load', 'hydrate', 'new', 'delete'] as const)(
        'ends the guide when the document changes: %s',
        async (operation) => {
            const { result } = renderHook(() => useOnboarding(ready));
            await act(async () => {
                await result.current.startDemo();
            });
            act(() => {
                if (operation === 'load') useTemplateStatusStore.getState().startLoading();
                if (operation === 'hydrate') useSceneEditorStore.getState().markHydrated();
                if (operation === 'new') useSceneMetadataStore.getState().setId('another-document');
                if (operation === 'delete') dispatchSceneCommand({ type: 'clearScene', clearMacros: true });
            });
            expect(result.current.session).toBeNull();
        }
    );

    it('cleans up subscriptions on unmount', async () => {
        const { result, unmount } = renderHook(() => useOnboarding(ready));
        await act(async () => {
            await result.current.startDemo();
        });
        unmount();
        play();
        editTitle('After unmount');
        expect(useSceneStore.getState().macros.byId.TITLE.value).toBe('After unmount');
        expect(localStorage.getItem('mvmnt_onboarding_v2')).toBe('started');
    });
});
