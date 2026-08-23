import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesShortcut, registerGlobalShortcut, resetGlobalShortcutsForTest } from './shortcutRegistry';

afterEach(() => resetGlobalShortcutsForTest());

describe('global shortcut registry', () => {
    it('runs only the highest-priority matching command', () => {
        const calls: string[] = [];
        registerGlobalShortcut({
            id: 'scene.delete',
            domain: 'scene',
            matches: (event) => event.key === 'Delete',
            handle: () => {
                calls.push('scene');
                return true;
            },
        });
        registerGlobalShortcut({
            id: 'timeline.delete',
            domain: 'timeline',
            matches: (event) => event.key === 'Delete',
            handle: () => {
                calls.push('timeline');
                return true;
            },
        });

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        expect(calls).toEqual(['timeline']);
    });

    it('lets a modal Escape claim the event before scene selection can clear', () => {
        const calls: string[] = [];
        registerGlobalShortcut({
            id: 'scene.escape',
            domain: 'scene',
            matches: (event) => event.key === 'Escape',
            handle: () => {
                calls.push('scene');
                return true;
            },
        });
        registerGlobalShortcut({
            id: 'modal.escape',
            domain: 'modal',
            matches: (event) => event.key === 'Escape',
            handle: () => {
                calls.push('modal');
                return true;
            },
        });

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(calls).toEqual(['modal']);
    });

    it('lets timeline Delete win only while a timeline selection can handle it', () => {
        const calls: string[] = [];
        let hasTimelineSelection = false;
        registerGlobalShortcut({
            id: 'scene.delete',
            domain: 'scene',
            matches: (event) => event.key === 'Delete',
            handle: () => {
                calls.push('scene');
                return true;
            },
        });
        registerGlobalShortcut({
            id: 'timeline.delete',
            domain: 'timeline',
            matches: (event) => event.key === 'Delete',
            handle: () => {
                if (!hasTimelineSelection) return false;
                calls.push('timeline');
                return true;
            },
        });

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
        hasTimelineSelection = true;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

        expect(calls).toEqual(['scene', 'timeline']);
    });

    it('rejects duplicate ownership for one shortcut registration', () => {
        registerGlobalShortcut({ id: 'scene.delete', domain: 'scene', matches: () => false, handle: () => false });
        expect(() =>
            registerGlobalShortcut({ id: 'scene.delete', domain: 'scene', matches: () => false, handle: () => false })
        ).toThrow('Duplicate global shortcut registration');
    });

    it('installs one window listener for many registrations and removes it after cleanup', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        const first = registerGlobalShortcut({
            id: 'first',
            domain: 'scene',
            matches: () => false,
            handle: () => false,
        });
        const second = registerGlobalShortcut({
            id: 'second',
            domain: 'timeline',
            matches: () => false,
            handle: () => false,
        });

        expect(add).toHaveBeenCalledTimes(1);
        first();
        expect(remove).not.toHaveBeenCalled();
        second();
        expect(remove).toHaveBeenCalledTimes(1);
        add.mockRestore();
        remove.mockRestore();
    });

    it('matches exact platform-neutral chords and rejects repeats by default', () => {
        expect(
            matchesShortcut(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }), { key: 's', primary: true })
        ).toBe(true);
        expect(
            matchesShortcut(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }), {
                key: 's',
                primary: true,
            })
        ).toBe(false);
        expect(
            matchesShortcut(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true }), {
                key: 'ArrowRight',
            })
        ).toBe(false);
        expect(
            matchesShortcut(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true }), {
                key: 'ArrowRight',
                allowRepeat: true,
            })
        ).toBe(true);
    });

    it('ignores keyboard events during IME composition', () => {
        const handle = vi.fn(() => true);
        registerGlobalShortcut({ id: 'scene.any', domain: 'scene', matches: () => true, handle });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', bubbles: true }));
        expect(handle).not.toHaveBeenCalled();
    });

    it('gives Escape to the most recently mounted modal', () => {
        const calls: string[] = [];
        registerGlobalShortcut({
            id: 'modal.first',
            domain: 'modal',
            matches: (event) => event.key === 'Escape',
            handle: () => (calls.push('first'), true),
        });
        registerGlobalShortcut({
            id: 'modal.second',
            domain: 'modal',
            matches: (event) => event.key === 'Escape',
            handle: () => (calls.push('second'), true),
        });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(calls).toEqual(['second']);
    });
});
