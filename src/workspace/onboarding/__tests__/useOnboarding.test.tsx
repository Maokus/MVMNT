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
vi.mock('@workspace/templates/easyModeTemplates', () => ({
    easyModeTemplates: [{ id: 'kashiwadelike', name: 'Kashiwade-like' }],
}));

const ready = { ready: true, suppressed: false, renderingVideo: false };
function editTitle(value: string) {
    act(() => {
        dispatchSceneCommand({ type: 'updateMacroValue', macroId: 'songTitle', value });
    });
}
function addTrack(id: string, type: 'midi' | 'audio') {
    act(() => {
        useTimelineStore.setState((state) => ({
            tracks: {
                ...state.tracks,
                [id]: { id, type, name: id, enabled: true, mute: false, solo: false, clips: [] } as any,
            },
            tracksOrder: [...state.tracksOrder, id],
        }));
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
        macroId: 'songTitle',
        definition: { type: 'string', value: 'Song Title' },
    });
    dispatchSceneCommand({
        type: 'createMacro',
        macroId: 'MIDITrack',
        definition: { type: 'timelineTrackRef', value: 'tutorial-midi' },
    });
    useTimelineStore.setState({
        tracks: {
            'tutorial-midi': {
                id: 'tutorial-midi',
                type: 'midi',
                name: 'Tutorial MIDI',
                enabled: true,
                mute: false,
                solo: false,
                clips: [],
            } as any,
            'tutorial-audio': {
                id: 'tutorial-audio',
                type: 'audio',
                name: 'Tutorial audio',
                enabled: true,
                mute: false,
                solo: false,
                clips: [],
            } as any,
        },
        tracksOrder: ['tutorial-midi', 'tutorial-audio'],
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

    it('keeps cancellation and failure retryable and prevents concurrent tutorial loads', async () => {
        let resolve!: (value: boolean) => void;
        apply.mockReturnValueOnce(
            new Promise<boolean>((done) => {
                resolve = done;
            })
        );
        const { result } = renderHook(() => useOnboarding(ready));
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.startTutorial();
        });
        await act(async () => {
            await result.current.startTutorial();
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
        apply.mockRejectedValueOnce(new Error('Could not load tutorial'));
        await act(async () => {
            await result.current.startTutorial();
        });
        expect(result.current.error).toBe('Could not load tutorial');
        expect(result.current.showWelcome).toBe(true);
        await act(async () => {
            await result.current.startTutorial();
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

describe('tutorial progress', () => {
    it('requires playback, personalization, user media, a current save, and a real video render', async () => {
        const { result, rerender } = renderHook((props) => useOnboarding(props), { initialProps: ready });
        await act(async () => {
            await result.current.startTutorial();
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
        expect(result.current.step).toBe('import-midi');
        addTrack('my-midi', 'midi');
        expect(result.current.session?.midiImported).toBe(true);
        expect(result.current.step).toBe('connect-midi');
        act(() => dispatchSceneCommand({ type: 'updateMacroValue', macroId: 'MIDITrack', value: 'my-midi' }));
        expect(result.current.session?.midiConnected).toBe(true);
        addTrack('my-audio', 'audio');
        expect(result.current.session?.audioImported).toBe(true);
        expect(result.current.step).toBe('save');
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
        expect(result.current.complete).toBe(false);
        expect(result.current.step).toBe('render');
        rerender({ ...ready, renderingVideo: true });
        expect(result.current.complete).toBe(true);
        expect(localStorage.getItem('mvmnt_onboarding_v2')).toBe('completed');
    });

    it('does not count unrelated edits or a reverted title', async () => {
        const { result } = renderHook(() => useOnboarding(ready));
        await act(async () => {
            await result.current.startTutorial();
        });
        act(() => useSceneMetadataStore.getState().setName('Renamed document'));
        expect(result.current.session?.edited).toBe(false);
        editTitle('New title');
        editTitle('Song Title');
        expect(result.current.session?.edited).toBe(false);
    });

    it.each(['load', 'hydrate', 'new', 'delete'] as const)(
        'ends the guide when the document changes: %s',
        async (operation) => {
            const { result } = renderHook(() => useOnboarding(ready));
            await act(async () => {
                await result.current.startTutorial();
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
            await result.current.startTutorial();
        });
        unmount();
        play();
        editTitle('After unmount');
        expect(useSceneStore.getState().macros.byId.songTitle.value).toBe('After unmount');
        expect(localStorage.getItem('mvmnt_onboarding_v2')).toBe('started');
    });
});
