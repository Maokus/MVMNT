import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { createPluginHostApi } from '../host-api/plugin-api';
import { disablePlugin, enablePlugin, loadPlugin, unloadPlugin } from '../plugin-loader';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { usePluginStore } from '@state/pluginStore';

const pluginId = 'com.example.loader-v2';
const v1PluginId = 'com.example.loader-v1';
const previousMvmnt = (globalThis as any).MVMNT;

function bundle(): ArrayBuffer {
    const manifest = {
        id: pluginId,
        name: 'Loader v2 fixture',
        version: '1.0.0',
        apiVersion: '^2.0.0',
        elements: [{
            type: 'loader-v2',
            entry: 'elements/loader-v2.js',
            capabilities: { required: [], optional: [] },
        }],
    };
    const code = `
const { definePluginElement } = require('@mvmnt/plugin-sdk');
module.exports = definePluginElement({
  type: 'loader-v2',
  metadata: { name: 'Loader v2' },
  schema: { tabs: [] },
  capabilities: { required: [], optional: [] },
  render() { return []; }
});`;
    const bytes = zipSync({
        'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
        'elements/loader-v2.js': new TextEncoder().encode(code),
    });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function v1Bundle(): ArrayBuffer {
    const manifest = {
        id: v1PluginId, name: 'Loader v1 fixture', version: '1.0.0', apiVersion: '^1.0.0',
        elements: [{ type: 'loader-v1', entry: 'elements/loader-v1.js' }],
    };
    const code = `
const { SceneElement } = require('@mvmnt/plugin-sdk');
module.exports = class LoaderV1Element extends SceneElement {
  constructor(id = 'loader-v1', config = {}) { super('loader-v1', id, config); }
  static getConfigSchema() { return { name: 'Loader v1', description: '', category: 'Fixtures', tabs: [] }; }
  _buildRenderObjects() { return []; }
};`;
    const bytes = zipSync({
        'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
        'elements/loader-v1.js': new TextEncoder().encode(code),
    });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

afterEach(async () => {
    if (usePluginStore.getState().plugins[pluginId]) await unloadPlugin(pluginId);
    if (usePluginStore.getState().plugins[v1PluginId]) await unloadPlugin(v1PluginId);
    (globalThis as any).MVMNT = previousMvmnt;
});

describe('v2 plugin loader fixture', () => {
    it('loads, disables, reloads from storage, and unloads through the real resolver', async () => {
        (globalThis as any).MVMNT = { plugins: createPluginHostApi({}).api };
        const loaded = await loadPlugin(bundle());
        expect(loaded).toMatchObject({ success: true, registeredTypes: [`${pluginId}:loader-v2`] });
        expect(sceneElementRegistry.hasElement(`${pluginId}:loader-v2`)).toBe(true);

        expect(await disablePlugin(pluginId)).toEqual({ success: true });
        expect(sceneElementRegistry.hasElement(`${pluginId}:loader-v2`)).toBe(false);

        const enabled = await enablePlugin(pluginId);
        expect(enabled.success).toBe(true);
        expect(sceneElementRegistry.hasElement(`${pluginId}:loader-v2`)).toBe(true);

        expect(await unloadPlugin(pluginId)).toEqual({ success: true });
        expect(sceneElementRegistry.hasElement(`${pluginId}:loader-v2`)).toBe(false);
    });

    it('rejects a manifest/definition capability mismatch', async () => {
        (globalThis as any).MVMNT = { plugins: createPluginHostApi({}).api };
        const bytes = bundle();
        const archive = await import('fflate').then(({ unzipSync, zipSync }) => {
            const files = unzipSync(new Uint8Array(bytes));
            const code = new TextDecoder().decode(files['elements/loader-v2.js'])
                .replace('optional: []', "optional: ['midi.utils']");
            files['elements/loader-v2.js'] = new TextEncoder().encode(code);
            return zipSync(files);
        });
        const result = await loadPlugin(archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Capability declaration mismatch');
    });

    it('loads a frozen v1 class bundle alongside a v2 definition bundle', async () => {
        (globalThis as any).MVMNT = { plugins: createPluginHostApi({}).api };
        expect((await loadPlugin(v1Bundle())).success).toBe(true);
        expect((await loadPlugin(bundle())).success).toBe(true);
        expect(sceneElementRegistry.hasElement(`${v1PluginId}:loader-v1`)).toBe(true);
        expect(sceneElementRegistry.hasElement(`${pluginId}:loader-v2`)).toBe(true);
    });
});
