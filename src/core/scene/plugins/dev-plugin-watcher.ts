/**
 * Development plugin watcher.
 *
 * Reconciles plugins advertised by local dev-plugin servers. The EventSources
 * deliberately stay open across failed connections, so the plugin server can
 * be started after the user has connected from the Debug menu.
 */

import { loadPlugin, unloadPlugin } from './plugin-loader';
import { usePluginStore } from '@state/pluginStore';

const configuredPort = Number((import.meta as any).env?.VITE_DEV_PLUGIN_PORT);
const DEV_PLUGIN_SERVER_PORT =
    Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 7741;
const DEFAULT_PORT_RANGE_SIZE = 10;
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
const serverByPlugin = new Map<string, string>();
const connectedServers = new Set<string>();
const connectionListeners = new Set<(status: DevPluginConnectionStatus) => void>();
let watcherStarted = false;

export interface DevPluginConnectionStatus {
    state: 'idle' | 'connecting' | 'connected' | 'failed' | 'unavailable';
    serverUrl?: string;
}

let connectionStatus: DevPluginConnectionStatus = { state: 'idle' };

function setConnectionStatus(status: DevPluginConnectionStatus): void {
    connectionStatus = status;
    connectionListeners.forEach((listener) => listener(connectionStatus));
}

/** Returns the current opt-in development plugin server connection status. */
export function getDevPluginConnectionStatus(): DevPluginConnectionStatus {
    return connectionStatus;
}

/** Subscribe to development plugin server connection status changes. */
export function subscribeToDevPluginConnectionStatus(listener: (status: DevPluginConnectionStatus) => void): () => void {
    connectionListeners.add(listener);
    return () => connectionListeners.delete(listener);
}

function serverUrls(): string[] {
    const ports = configuredPort ? [DEV_PLUGIN_SERVER_PORT] : Array.from({ length: DEFAULT_PORT_RANGE_SIZE }, (_, index) => DEV_PLUGIN_SERVER_PORT + index);
    return ports.map((port) => `http://localhost:${port}`);
}

function isDevelopmentPlugin(pluginId: string): boolean {
    return usePluginStore.getState().plugins[pluginId]?.source === 'development';
}

async function removeDevelopmentPlugin(pluginId: string, serverUrl?: string): Promise<void> {
    if (serverUrl && serverByPlugin.get(pluginId) !== serverUrl) return;
    if (isDevelopmentPlugin(pluginId)) {
        const result = await unloadPlugin(pluginId, { removePersisted: false });
        if (!result.success) console.warn(`[DevPluginWatcher] Failed to unload '${pluginId}':`, result.error);
    }
    revisionByPlugin.delete(pluginId);
    lastKnownGoodBundle.delete(pluginId);
    serverByPlugin.delete(pluginId);
}

async function reloadPlugin(pluginId: string, revision: number, serverUrl: string): Promise<void> {
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

        const currentServer = serverByPlugin.get(pluginId);
        if (currentServer && currentServer !== serverUrl) {
            console.error(`[DevPluginWatcher] Refusing duplicate development plugin '${pluginId}' from ${serverUrl}; it is already served by ${currentServer}.`);
            return;
        }

        const response = await fetch(`${serverUrl}/${encodeURIComponent(pluginId)}.mvmnt-plugin`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const candidate = await response.arrayBuffer();
        const fallback = lastKnownGoodBundle.get(pluginId);

        if (isDevelopmentPlugin(pluginId)) {
            await unloadPlugin(pluginId, { removePersisted: false });
        }

        const result = await loadPlugin(candidate, { persist: false, source: 'development' });
        if (result.success) {
            revisionByPlugin.set(pluginId, revision);
            serverByPlugin.set(pluginId, serverUrl);
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

async function reconcile(serverUrl: string, status: DevServerStatus): Promise<void> {
    const advertised = new Set(status.plugins.map((plugin) => plugin.id));
    await Promise.all(
        [...revisionByPlugin.keys()]
            .filter((pluginId) => serverByPlugin.get(pluginId) === serverUrl && !advertised.has(pluginId))
            .map((pluginId) => removeDevelopmentPlugin(pluginId, serverUrl))
    );

    for (const plugin of status.plugins) {
        if (!plugin.ready) {
            if (plugin.buildError) console.warn(`[DevPluginWatcher] '${plugin.id}' is not ready: ${plugin.buildError}`);
            continue;
        }
        const loadedRevision = revisionByPlugin.get(plugin.id);
        if (loadedRevision !== plugin.revision || !isDevelopmentPlugin(plugin.id)) {
            void reloadPlugin(plugin.id, plugin.revision, serverUrl);
        }
    }
}

/**
 * Start watching local dev-plugin servers after an explicit user request.
 * This intentionally does not run during app startup: failed EventSource
 * connections otherwise create browser-console network errors for everyone.
 */
export function connectToDevPluginServer(): void {
    if (!import.meta.env.DEV) {
        setConnectionStatus({ state: 'unavailable' });
        return;
    }
    if (watcherStarted) return;

    watcherStarted = true;
    setConnectionStatus({ state: 'connecting' });
    for (const serverUrl of serverUrls()) startServerWatcher(serverUrl);
}

function startServerWatcher(serverUrl: string): void {
    const eventSource = new EventSource(`${serverUrl}/events`);
    let disconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleDisconnectCleanup = () => {
        if (disconnectTimer) return;
        disconnectTimer = setTimeout(() => {
            disconnectTimer = undefined;
            void Promise.all([...revisionByPlugin.keys()].map((pluginId) => removeDevelopmentPlugin(pluginId, serverUrl)));
        }, DISCONNECT_GRACE_MS);
    };

    eventSource.onopen = () => {
        connectedServers.add(serverUrl);
        setConnectionStatus({ state: 'connected', serverUrl });
        if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = undefined;
        }
        fetch(`${serverUrl}/status`, { cache: 'no-store' })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<DevServerStatus>;
            })
            .then((status) => reconcile(serverUrl, status))
            .catch((error) => console.warn('[DevPluginWatcher] Could not reconcile dev plugins:', error));
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) as { type?: string; pluginId?: string; revision?: number; plugins?: DevPluginStatus[] };
            if (data.type === 'snapshot' && data.plugins) void reconcile(serverUrl, { protocolVersion: 2, plugins: data.plugins });
            if (data.type === 'upsert' && data.pluginId && typeof data.revision === 'number') {
                void reloadPlugin(data.pluginId, data.revision, serverUrl);
            }
            if (data.type === 'remove' && data.pluginId) void removeDevelopmentPlugin(data.pluginId, serverUrl);
        } catch {
            /* Ignore malformed development-server events. */
        }
    };

    eventSource.onerror = () => {
        connectedServers.delete(serverUrl);
        if (connectedServers.size === 0) setConnectionStatus({ state: 'failed' });
        // EventSource automatically retries. Cleanup is intentionally delayed so
        // restarting the dev server does not make scene elements flicker away.
        scheduleDisconnectCleanup();
    };
}
