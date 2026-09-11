import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../plugin-loader', () => ({
    loadPlugin: vi.fn(),
    unloadPlugin: vi.fn(),
}));

vi.mock('@state/pluginStore', () => ({
    usePluginStore: { getState: () => ({ plugins: {} }) },
}));

describe('development plugin watcher availability', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('is unavailable immediately in production builds', async () => {
        vi.stubEnv('DEV', false);

        const { getDevPluginConnectionStatus } = await import('../dev-plugin-watcher');

        expect(getDevPluginConnectionStatus().state).toBe('unavailable');
    });
});
