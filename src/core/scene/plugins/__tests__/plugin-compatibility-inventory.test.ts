import { beforeEach, describe, expect, it } from 'vitest';
import { usePluginStore } from '@state/pluginStore';
import { getInstalledLegacyPluginInventory, isLegacyPluginManifest } from '../plugin-compatibility-inventory';

describe('plugin compatibility inventory', () => {
    beforeEach(() => usePluginStore.getState().reset());

    it('identifies only SDK 1 manifests and keeps the inventory local to installed state', () => {
        usePluginStore.getState().addPlugin({ id: 'v2', name: 'Current', version: '2.0.0', apiVersion: '^2.0.0', elements: [] });
        usePluginStore.getState().addPlugin({ id: 'v1', name: 'Legacy', version: '1.0.0', apiVersion: '^1.1.0', elements: [] });

        expect(isLegacyPluginManifest({ apiVersion: '^2.0.0' })).toBe(false);
        expect(getInstalledLegacyPluginInventory()).toEqual([{
            id: 'v1', name: 'Legacy', version: '1.0.0', apiVersion: '^1.1.0',
        }]);
    });
});
