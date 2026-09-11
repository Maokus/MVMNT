import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { disablePlugin, enablePlugin, getDevelopmentPluginBundle, loadPlugin, unloadPlugin } from '../plugin-loader';
import { sceneElementRegistry } from '@core/scene/registry';
import { usePluginStore } from '@state/pluginStore';
import { PluginBinaryStore } from '@persistence/plugin-binary-store';

const pluginId = 'com.example.loader-v2';
const developmentPluginId = 'com.example.loader-v2-development';

function bundle(id = pluginId, elementCode?: string): ArrayBuffer {
    const manifest = {
        id,
        name: 'Loader v2 fixture',
        version: '1.0.0',
        apiVersion: '^2.0.0',
        elements: [
            {
                type: 'loader-v2',
                entry: 'elements/loader-v2.js',
                capabilities: { required: [], optional: [] },
            },
        ],
    };
    const code =
        elementCode ??
        `
const { definePluginElement } = require('@mvmnt-app/plugin-sdk');
module.exports = definePluginElement({
  type: 'loader-v2',
  metadata: { name: 'Loader v2' },
  schema: { tabs: [] },
  render() { return []; }
});`;
    const bytes = zipSync({
        'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
        'elements/loader-v2.js': new TextEncoder().encode(code),
    });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function sdk1Bundle(): ArrayBuffer {
    const bytes = zipSync({
        'manifest.json': new TextEncoder().encode(
            JSON.stringify({
                id: 'com.example.loader-v1',
                name: 'Removed SDK fixture',
                version: '1.0.0',
                apiVersion: '^1.0.0',
                elements: [{ type: 'loader-v1', entry: 'elements/loader-v1.js' }],
            })
        ),
        'elements/loader-v1.js': new TextEncoder().encode('module.exports = {};'),
    });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

afterEach(async () => {
    if (usePluginStore.getState().plugins[pluginId]) await unloadPlugin(pluginId);
    if (usePluginStore.getState().plugins[developmentPluginId]) await unloadPlugin(developmentPluginId);
    await PluginBinaryStore.delete(developmentPluginId);
});

describe('v2 plugin loader fixture', () => {
    it('loads, disables, reloads from storage, and unloads through the real resolver', async () => {
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

    it('injects host-resolved asynchronous font utilities', async () => {
        const code = `
const { definePluginElement } = require('@mvmnt-app/plugin-sdk');
const { parseFontSelection, ensureFontLoaded } = require('@mvmnt-app/plugin-sdk/utils');
const parsed = parseFontSelection('BuiltIn:inter|700i');
module.exports = definePluginElement({
  type: 'loader-v2',
  metadata: { name: parsed.family + ':' + parsed.weight + ':' + parsed.italic },
  schema: { tabs: [] },
  async load() { await ensureFontLoaded('BuiltIn:inter|700i'); },
  render() { return []; }
});`;
        const loaded = await loadPlugin(bundle(pluginId, code));
        expect(loaded).toMatchObject({ success: true });
        expect(
            sceneElementRegistry.getElementTypeInfo().find(({ type }) => type === `${pluginId}:loader-v2`)?.name
        ).toBe('Inter:700:true');
    });

    it('rejects SDK 1 archives after compatibility removal', async () => {
        const result = await loadPlugin(sdk1Bundle());
        expect(result).toMatchObject({ success: false });
        expect('error' in result ? result.error : '').toContain('MVMNT requires ^2.0.0');
    });

    it('keeps development bundles session-only', async () => {
        const bytes = bundle(developmentPluginId);
        const result = await loadPlugin(bytes, { persist: false, source: 'development' });
        expect(result.success).toBe(true);
        expect(usePluginStore.getState().plugins[developmentPluginId]?.source).toBe('development');
        expect(await PluginBinaryStore.get(developmentPluginId)).toBeUndefined();
        expect(getDevelopmentPluginBundle(developmentPluginId)).toEqual(bytes);

        await unloadPlugin(developmentPluginId, { removePersisted: false });
        expect(getDevelopmentPluginBundle(developmentPluginId)).toBeUndefined();
    });

    it.each(['Math.random()', 'Date.now()', 'performance.now()', "globalThis.Math['random']()"])(
        'rejects %s in deterministic simulation callbacks',
        async (expression) => {
            const code = `
const { definePluginElement, group, prop, tab } = require('@mvmnt-app/plugin-sdk');
module.exports = definePluginElement({
  type: 'loader-v2',
  metadata: { name: 'Loader v2' },
  schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 1)])])] },
  simulation: {
    initialize() { return { value: 0 }; },
    step({ state }) { return { value: state.value + ${expression} }; }
  },
  render() { return []; }
});`;
            const result = await loadPlugin(bundle(pluginId, code));

            expect(result).toMatchObject({ success: false });
            expect('error' in result ? result.error : '').toContain('prohibited ambient API');
            expect('error' in result ? result.error : '').toContain('context.random');
        }
    );

    it('allows ambient APIs outside callbacks that influence simulation state', async () => {
        const code = `
const { definePluginElement, group, prop, tab } = require('@mvmnt-app/plugin-sdk');
module.exports = definePluginElement({
  type: 'loader-v2',
  metadata: { name: 'Loader v2' },
  schema: { tabs: [tab.properties([group('simulation', 'Simulation', [prop.number('seed', 'Seed', 1)])])] },
  simulation: {
    initialize() { return { value: 0 }; },
    step({ state }) { return { value: state.value + 1 }; }
  },
  render() { Math.random(); Date.now(); performance.now(); return []; }
});`;

        expect(await loadPlugin(bundle(pluginId, code))).toMatchObject({ success: true });
    });
});
