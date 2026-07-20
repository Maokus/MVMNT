/**
 * Development plugin watcher.
 *
 * Reconciles the plugins advertised by one localhost dev-plugin server. The
 * EventSource deliberately stays open across failed connections, so Vite and
 * the plugin server can be started in either order.
 */

import { loadPlugin, unloadPlugin } from './plugin-loader';
import { usePluginStore } from '@state/pluginStore';

const configuredPort = Number((import.meta as any).env?.VITE_DEV_PLUGIN_PORT);
const DEV_PLUGIN_SERVER_PORT =
    Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 7741;
const DISCONNECT_GRACE_MS = 5_000;

interface DevPluginStatus {
    id: string;
    ready: boolean;
    revision: number;
    buildError?: string;
}

interface DevServerStatus {
    protocolVersion: 2;
    plugins: DevPluginStatus[];
}

const revisionByPlugin = new Map<string, number>();
const lastKnownGoodBundle = new Map<string, ArrayBuffer>();
const reloads = new Map<string, Promise<void>>();

function baseUrl(): string {
    return `http://localhost:${DEV_PLUGIN_SERVER_PORT}`;
}

function isDevelopmentPlugin(pluginId: string): boolean {
    return usePluginStore.getState().plugins[pluginId]?.source === 'development';
}

async function removeDevelopmentPlugin(pluginId: string): Promise<void> {
    if (isDevelopmentPlugin(pluginId)) {
        const result = await unloadPlugin(pluginId, { removePersisted: false });
        if (!result.success) console.warn(`[DevPluginWatcher] Failed to unload '${pluginId}':`, result.error);
    }
    revisionByPlugin.delete(pluginId);
    lastKnownGoodBundle.delete(pluginId);
}

async function reloadPlugin(pluginId: string, revision: number): Promise<void> {
    const prior = reloads.get(pluginId) ?? Promise.resolve();
    const task = prior.then(async () => {
        if ((revisionByPlugin.get(pluginId) ?? -1) > revision) return;

        const existing = usePluginStore.getState().plugins[pluginId];
        if (existing && existing.source !== 'development') {
            console.error(
                `[DevPluginWatcher] Refusing to replace installed plugin '${pluginId}'. Remove the installed plugin before serving a dev plugin with the same ID.`
            );
            return;
        }

        const response = await fetch(`${baseUrl()}/${encodeURIComponent(pluginId)}.mvmnt-plugin`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const candidate = await response.arrayBuffer();
        const fallback = lastKnownGoodBundle.get(pluginId);

        if (isDevelopmentPlugin(pluginId)) {
            await unloadPlugin(pluginId, { removePersisted: false });
        }

        const result = await loadPlugin(candidate, { persist: false, source: 'development' });
        if (result.success) {
            revisionByPlugin.set(pluginId, revision);
            lastKnownGoodBundle.set(pluginId, candidate.slice(0));
            console.log(`[DevPluginWatcher] Loaded '${pluginId}' (${result.registeredTypes?.length ?? 0} element(s)).`);
            return;
        }

        console.error(`[DevPluginWatcher] Failed to load '${pluginId}':`, result.error);
        if (fallback) {
            const rollback = await loadPlugin(fallback, { persist: false, source: 'development' });
            if (rollback.success) {
                console.warn(`[DevPluginWatcher] Restored the previous working '${pluginId}' bundle.`);
                return;
            }
            console.error(`[DevPluginWatcher] Failed to restore '${pluginId}':`, rollback.error);
        }
    }).catch((error) => {
        console.error(`[DevPluginWatcher] Error loading '${pluginId}':`, error);
    });
    reloads.set(pluginId, task);
    try {
        await task;
    } finally {
        if (reloads.get(pluginId) === task) reloads.delete(pluginId);
    }
}

async function reconcile(status: DevServerStatus): Promise<void> {
    const advertised = new Set(status.plugins.map((plugin) => plugin.id));
    await Promise.all(
        [...revisionByPlugin.keys()]
            .filter((pluginId) => !advertised.has(pluginId))
            .map((pluginId) => removeDevelopmentPlugin(pluginId))
    );

    for (const plugin of status.plugins) {
        if (!plugin.ready) {
            if (plugin.buildError) console.warn(`[DevPluginWatcher] '${plugin.id}' is not ready: ${plugin.buildError}`);
            continue;
        }
        const loadedRevision = revisionByPlugin.get(plugin.id);
        if (loadedRevision !== plugin.revision || !isDevelopmentPlugin(plugin.id)) {
            void reloadPlugin(plugin.id, plugin.revision);
        }
    }
}

/** Start watching the multiplexed localhost dev-plugin server in Vite development mode. */
export function startDevPluginWatcher(): void {
    if (!import.meta.env.DEV) return;

    const eventSource = new EventSource(`${baseUrl()}/events`);
    let disconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleDisconnectCleanup = () => {
        if (disconnectTimer) return;
        disconnectTimer = setTimeout(() => {
            disconnectTimer = undefined;
            void Promise.all([...revisionByPlugin.keys()].map((pluginId) => removeDevelopmentPlugin(pluginId)));
        }, DISCONNECT_GRACE_MS);
    };

    eventSource.onopen = () => {
        if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = undefined;
        }
        fetch(`${baseUrl()}/status`, { cache: 'no-store' })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<DevServerStatus>;
            })
            .then(reconcile)
            .catch((error) => console.warn('[DevPluginWatcher] Could not reconcile dev plugins:', error));
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) as { type?: string; pluginId?: string; revision?: number; plugins?: DevPluginStatus[] };
            if (data.type === 'snapshot' && data.plugins) void reconcile({ protocolVersion: 2, plugins: data.plugins });
            if (data.type === 'upsert' && data.pluginId && typeof data.revision === 'number') {
                void reloadPlugin(data.pluginId, data.revision);
            }
            if (data.type === 'remove' && data.pluginId) void removeDevelopmentPlugin(data.pluginId);
        } catch {
            /* Ignore malformed development-server events. */
        }
    };

    eventSource.onerror = () => {
        // EventSource automatically retries. Cleanup is intentionally delayed so
        // restarting the dev server does not make scene elements flicker away.
        scheduleDisconnectCleanup();
    };
}
