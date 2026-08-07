import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGlobalShortcut, resetGlobalShortcutsForTest } from './shortcutRegistry';

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
});
