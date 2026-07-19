/**
 * Dev Plugin Watcher
 *
 * Connects to a running `npm run dev-plugin` server via Server-Sent Events and
 * hot-reloads the plugin whenever the dev server emits a rebuild event.
 *
 * Only active in Vite dev mode (`import.meta.env.DEV`). Safe to call in
 * production — it exits immediately without opening any connections.
 *
 * Usage: call startDevPluginWatcher() once during app initialization.
 */

import { loadPlugin, unloadPlugin } from './plugin-loader';
import { usePluginStore } from '@state/pluginStore';

const configuredPort = Number((import.meta as any).env?.VITE_DEV_PLUGIN_PORT);
const DEV_PLUGIN_SERVER_PORT =
    Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 7741;

/**
 * Start listening for hot-reload events from the dev-plugin server.
 * No-ops if not in dev mode or if the server is not running.
 */
export function startDevPluginWatcher(): void {
    if (!import.meta.env.DEV) return;

    const eventsUrl = `http://localhost:${DEV_PLUGIN_SERVER_PORT}/events`;
    const eventSource = new EventSource(eventsUrl);

    let hasConnected = false;

    eventSource.onopen = () => {
        hasConnected = true;
        // Fetch and install the current bundle. The initial rebuild may have
        // completed before the SSE connection opened, so waiting for a later
        // save would otherwise leave the plugin unloaded.
        fetch(`http://localhost:${DEV_PLUGIN_SERVER_PORT}/status`)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((status: { pluginId?: string; ready?: boolean }) => {
                if (status.pluginId && status.ready) {
                    console.log(`[DevPluginWatcher] Connected — loading plugin '${status.pluginId}'.`);
                    void hotReloadPlugin(status.pluginId);
                }
            })
            .catch((error) => console.warn('[DevPluginWatcher] Could not load the initial plugin bundle:', error));
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) as { type: string; pluginId?: string };
            if (data.type === 'rebuild' && data.pluginId) {
                void hotReloadPlugin(data.pluginId);
            }
        } catch {
            /* ignore malformed events */
        }
    };

    eventSource.onerror = () => {
        if (!hasConnected) {
            // Server not running — close quietly. Refresh after starting the
            // plugin server to establish a fresh connection.
            eventSource.close();
        }
    };
}

async function hotReloadPlugin(pluginId: string): Promise<void> {
    const bundleUrl = `http://localhost:${DEV_PLUGIN_SERVER_PORT}/${pluginId}.mvmnt-plugin`;

    try {
        const response = await fetch(bundleUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();

        // Unload the running version first so we can do a clean reinstall
        // regardless of version numbers (dev iteration doesn't bump versions).
        const plugins = usePluginStore.getState().plugins;
        if (plugins[pluginId]) {
            await unloadPlugin(pluginId);
        }

        const result = await loadPlugin(buffer);
        if (result.success) {
            console.log(
                `[DevPluginWatcher] Hot reloaded '${pluginId}' ` + `(${result.registeredTypes?.length ?? 0} element(s))`
            );
        } else {
            console.error(`[DevPluginWatcher] Failed to reload '${pluginId}':`, result.error);
        }
    } catch (error) {
        console.error('[DevPluginWatcher] Error fetching bundle from dev server:', error);
    }
}
