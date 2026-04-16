import { unzipSync } from 'fflate';
import { PluginBinaryStore } from '@persistence/plugin-binary-store';
import { PluginSettingsStore } from '@persistence/plugin-settings-store';
import { loadPlugin, disablePlugin } from './plugin-loader';

interface DefaultPluginDescriptor {
    id: string;
    version: string;
    assetPath: string;
    defaultEnabled: boolean;
    skipVersionCheck?: boolean;
}

const DEFAULT_PLUGINS: DefaultPluginDescriptor[] = [
    {
        id: 'midipack1',
        version: '1.0.1',
        assetPath: 'default-plugins/midipack1-1.0.1.mvmnt-plugin',
        defaultEnabled: false,
        skipVersionCheck: false,
    },
];

async function getInstalledVersion(id: string): Promise<string | null> {
    try {
        const buffer = await PluginBinaryStore.get(id);
        if (!buffer) return null;
        const files = unzipSync(new Uint8Array(buffer));
        const manifestData = files['manifest.json'];
        if (!manifestData) return null;
        const manifest = JSON.parse(new TextDecoder().decode(manifestData));
        return manifest.version ?? null;
    } catch {
        return null;
    }
}

/**
 * Install bundled default plugins on first run.
 *
 * Each default plugin is fetched as a static asset and stored in IndexedDB.
 * If the plugin's default enabled state is false it is installed disabled —
 * the user must explicitly enable it from the Plugins tab.
 *
 * Subsequent runs skip plugins that are already present in IndexedDB.
 */
export async function installDefaultPlugins(): Promise<void> {
    let installedIds: string[];
    try {
        installedIds = await PluginBinaryStore.listIds();
    } catch {
        installedIds = [];
    }

    for (const descriptor of DEFAULT_PLUGINS) {
        const alreadyInstalled = installedIds.includes(descriptor.id);

        if (alreadyInstalled) {
            const installedVersion = await getInstalledVersion(descriptor.id);
            if (installedVersion === descriptor.version) {
                continue;
            }
            console.log(
                `[DefaultPlugins] Updating '${descriptor.id}' from v${installedVersion ?? 'unknown'} to v${descriptor.version}`
            );
        }

        try {
            const response = await fetch(descriptor.assetPath);
            if (!response.ok) {
                console.warn(
                    `[DefaultPlugins] Could not fetch ${descriptor.assetPath}: ${response.status} ${response.statusText}`
                );
                continue;
            }

            const buffer = await response.arrayBuffer();

            // Record the default enabled state only if the user hasn't configured it yet.
            if (!PluginSettingsStore.hasEntry(descriptor.id)) {
                PluginSettingsStore.setEnabled(descriptor.id, descriptor.defaultEnabled);
            }

            const result = await loadPlugin(buffer, {
                skipVersionCheck: descriptor.skipVersionCheck,
                allowExistingPlugin: alreadyInstalled,
            });
            if (!result.success) {
                console.warn(`[DefaultPlugins] Failed to install ${descriptor.id}:`, result.error);
                continue;
            }

            // If the stored state is disabled, disable it immediately after installation.
            if (PluginSettingsStore.getEnabled(descriptor.id) === false) {
                await disablePlugin(descriptor.id);
            }

            console.log(
                `[DefaultPlugins] Installed '${descriptor.id}' (enabled: ${PluginSettingsStore.getEnabled(descriptor.id) ?? descriptor.defaultEnabled})`
            );
        } catch (error) {
            console.error(`[DefaultPlugins] Failed to install default plugin '${descriptor.id}':`, error);
        }
    }
}
