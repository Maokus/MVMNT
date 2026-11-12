import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePluginStore } from '@state/pluginStore';
import { disablePlugin, enablePlugin, unloadPlugin } from '@core/scene/plugins';
import ScenePluginsTab from '../ScenePluginsTab';

vi.mock('@core/scene/plugins', () => ({
    disablePlugin: vi.fn(async () => ({ success: true })),
    enablePlugin: vi.fn(async () => ({ success: true })),
    unloadPlugin: vi.fn(async () => {}),
    loadPlugin: vi.fn(),
    upgradePlugin: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    usePluginStore.getState().reset();
    usePluginStore
        .getState()
        .addPlugin({ id: 'test.plugin', name: 'Test plugin', version: '1.0.0', apiVersion: '^2.0.0', elements: [] });
});
afterEach(() => {
    cleanup();
    usePluginStore.getState().reset();
    vi.restoreAllMocks();
});

describe('installed plugin controls', () => {
    it.each([true, false])(
        'uses standard padded controls when enabled=%s and keeps actions working',
        async (enabled) => {
            if (!enabled) usePluginStore.getState().disablePlugin('test.plugin');
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            render(<ScenePluginsTab />);
            const toggle = screen.getByRole('button', { name: enabled ? 'Disable' : 'Enable' });
            const remove = screen.getByRole('button', { name: 'Remove' });
            for (const button of [toggle, remove]) {
                expect(button).toHaveClass('px-3', 'py-1', 'text-[12px]', 'rounded', 'border');
            }
            expect(toggle).toHaveClass('border-neutral-800', 'text-neutral-200');
            expect(remove).toHaveClass('border-rose-800', 'text-rose-200');
            fireEvent.click(toggle);
            await waitFor(() => expect(enabled ? disablePlugin : enablePlugin).toHaveBeenCalledWith('test.plugin'));
            fireEvent.click(remove);
            await waitFor(() => expect(unloadPlugin).toHaveBeenCalledWith('test.plugin'));
        }
    );

    it('disables both actions while the plugin is loading', () => {
        usePluginStore.getState().setLoading('test.plugin', true);
        render(<ScenePluginsTab />);
        expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    });
});
