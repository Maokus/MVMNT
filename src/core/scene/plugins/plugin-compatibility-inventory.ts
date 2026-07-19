import { PluginBinaryStore } from '@persistence/plugin-binary-store';
import { usePluginStore, type PluginManifest } from '@state/pluginStore';
import { getPluginApiLine } from './plugin-contract';

/** A local-only view of installed bundles that still rely on the frozen SDK 1 runtime. */
export interface LegacyPluginInventoryEntry {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly apiVersion: string;
}

export function isLegacyPluginManifest(manifest: Pick<PluginManifest, 'apiVersion'>): boolean {
    return getPluginApiLine(manifest.apiVersion) === 1;
}

export function getInstalledLegacyPluginInventory(): readonly LegacyPluginInventoryEntry[] {
    return Object.values(usePluginStore.getState().plugins)
        .filter(({ manifest }) => isLegacyPluginManifest(manifest))
        .map(({ manifest }) => Object.freeze({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            apiVersion: manifest.apiVersion,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Produces a device-local backup of a stored bundle. No plugin metadata or code is
 * transmitted; callers decide how to present/save the returned Blob.
 */
export async function exportInstalledPluginBackup(pluginId: string): Promise<Blob> {
    const bundle = await PluginBinaryStore.get(pluginId);
    if (!bundle) throw new Error(`No stored plugin bundle found for '${pluginId}'`);
    return new Blob([bundle], { type: 'application/octet-stream' });
}
