/**
 * Development plugin watcher.
 *
 * Reconciles plugins advertised by local dev-plugin servers. Discovery uses
 * short-lived status requests; EventSources are opened only for servers that
 * answer those requests. This avoids persistent browser network errors for
 * every unused port in the development server range.
 */

import { loadPlugin, unloadPlugin } from './plugin-loader';
import { usePluginStore } from '@state/pluginStore';

const configuredPort = Number((import.meta as any).env?.VITE_DEV_PLUGIN_PORT);
const DEV_PLUGIN_SERVER_PORT =
    Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 7741;
const DEFAULT_PORT_RANGE_SIZE = 10;
const DISCONNECT_GRACE_MS = 5_000;
const SCAN_INTERVAL_MS = 3_000;
const STATUS_REQUEST_TIMEOUT_MS = 1_500;

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
const eventSources = new Map<string, EventSource>();
const connectionListeners = new Set<(status: DevPluginConnectionStatus) => void>();

let scanTimer: ReturnType<typeof setTimeout> | undefined;
let scanInProgress = false;
let continuousScanning = false;
let scanCycle = 0;

export interface DevPluginConnectionStatus {
    state: 'idle' | 'connecting' | 'connected' | 'failed' | 'unavailable';
    serverUrl?: string;
    servers: Array<{ serverUrl: string; port: number }>;
    scanning: boolean;
    continuousScanning: boolean;
    portRange: string;
}

let connectionStatus: DevPluginConnectionStatus = {
    state: import.meta.env.DEV ? 'idle' : 'unavailable',
    servers: [],
    scanning: false,
    continuousScanning: false,
    portRange: configuredPort
        ? String(DEV_PLUGIN_SERVER_PORT)
        : `${DEV_PLUGIN_SERVER_PORT}-${DEV_PLUGIN_SERVER_PORT + DEFAULT_PORT_RANGE_SIZE - 1}`,
};

function setConnectionStatus(status: DevPluginConnectionStatus): void {
    connectionStatus = status;
    connectionListeners.forEach((listener) => listener(connectionStatus));
}

/** Returns the current opt-in development plugin server connection status. */
export function getDevPluginConnectionStatus(): DevPluginConnectionStatus {
    return connectionStatus;
}

/** Subscribe to development plugin server connection status changes. */
export function subscribeToDevPluginConnectionStatus(
    listener: (status: DevPluginConnectionStatus) => void
): () => void {
    connectionListeners.add(listener);
    return () => connectionListeners.delete(listener);
}

function serverUrls(): string[] {
    const ports = configuredPort
        ? [DEV_PLUGIN_SERVER_PORT]
        : Array.from({ length: DEFAULT_PORT_RANGE_SIZE }, (_, index) => DEV_PLUGIN_SERVER_PORT + index);
    return ports.map((port) => `http://localhost:${port}`);
}

function buildConnectionStatus(
    state: DevPluginConnectionStatus['state'],
    overrides: Partial<DevPluginConnectionStatus> = {}
): DevPluginConnectionStatus {
    const servers = [...connectedServers]
        .sort()
        .map((serverUrl) => ({ serverUrl, port: Number(new URL(serverUrl).port) }));
    return {
        state,
        serverUrl: servers[0]?.serverUrl,
        servers,
        scanning: scanInProgress,
        continuousScanning,
        portRange: connectionStatus.portRange,
        ...overrides,
    };
}

function publishConnectionStatus(): void {
    const state =
        connectedServers.size > 0 ? 'connected' : scanInProgress ? 'connecting' : scanCycle > 0 ? 'failed' : 'idle';
    setConnectionStatus(buildConnectionStatus(state));
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
    const task = prior
        .then(async () => {
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
                console.error(
                    `[DevPluginWatcher] Refusing duplicate development plugin '${pluginId}' from ${serverUrl}; it is already served by ${currentServer}.`
                );
                return;
            }

            const response = await fetch(`${serverUrl}/${encodeURIComponent(pluginId)}.mvmnt-plugin`, {
                cache: 'no-store',
            });
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
                console.log(
                    `[DevPluginWatcher] Loaded '${pluginId}' (${result.registeredTypes?.length ?? 0} element(s)).`
                );
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
        })
        .catch((error) => {
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
        setConnectionStatus(buildConnectionStatus('unavailable'));
        return;
    }
    void scanForDevPluginServers();
}

/** Enable or pause repeated discovery scans. Existing server connections remain open. */
export function setDevPluginServerContinuousScanning(enabled: boolean): void {
    continuousScanning = enabled;
    if (!enabled && scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = undefined;
    }
    publishConnectionStatus();
    if (enabled && import.meta.env.DEV) void scanForDevPluginServers();
}

function scheduleNextScan(): void {
    if (!continuousScanning || scanTimer) return;
    scanTimer = setTimeout(() => {
        scanTimer = undefined;
        void scanForDevPluginServers();
    }, SCAN_INTERVAL_MS);
}

async function scanForDevPluginServers(): Promise<void> {
    if (scanInProgress) return;
    scanInProgress = true;
    scanCycle += 1;
    publishConnectionStatus();
    console.info(
        `[DevPluginWatcher] Scanning development plugin ports ${connectionStatus.portRange} (cycle ${scanCycle}).`
    );

    await Promise.all(serverUrls().map((serverUrl) => probeServer(serverUrl)));

    scanInProgress = false;
    publishConnectionStatus();
    scheduleNextScan();
}

async function probeServer(serverUrl: string): Promise<void> {
    if (eventSources.has(serverUrl)) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STATUS_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${serverUrl}/status`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const status = (await response.json()) as DevServerStatus;
        startServerWatcher(serverUrl);
        await reconcile(serverUrl, status);
    } catch {
        // Closed ports are an expected part of scanning. Report only the cycle,
        // rather than one connection-refused message per port.
    } finally {
        clearTimeout(timeout);
    }
}

function startServerWatcher(serverUrl: string): void {
    if (eventSources.has(serverUrl)) return;
    const eventSource = new EventSource(`${serverUrl}/events`);
    eventSources.set(serverUrl, eventSource);
    let disconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleDisconnectCleanup = () => {
        if (disconnectTimer) return;
        disconnectTimer = setTimeout(() => {
            disconnectTimer = undefined;
            void Promise.all(
                [...revisionByPlugin.keys()].map((pluginId) => removeDevelopmentPlugin(pluginId, serverUrl))
            );
        }, DISCONNECT_GRACE_MS);
    };

    eventSource.onopen = () => {
        connectedServers.add(serverUrl);
        publishConnectionStatus();
        if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = undefined;
        }
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) as {
                type?: string;
                pluginId?: string;
                revision?: number;
                plugins?: DevPluginStatus[];
            };
            if (data.type === 'snapshot' && data.plugins)
                void reconcile(serverUrl, { protocolVersion: 2, plugins: data.plugins });
            if (data.type === 'upsert' && data.pluginId && typeof data.revision === 'number') {
                void reloadPlugin(data.pluginId, data.revision, serverUrl);
            }
            if (data.type === 'remove' && data.pluginId) void removeDevelopmentPlugin(data.pluginId, serverUrl);
        } catch {
            /* Ignore malformed development-server events. */
        }
    };

    eventSource.onerror = () => {
        // Do not let EventSource retry a server that has gone away: each retry
        // creates a noisy browser connection-refused error. A later scan can
        // discover it again, including automatically when continuous scanning
        // is enabled from Scene Settings.
        eventSource.close();
        eventSources.delete(serverUrl);
        connectedServers.delete(serverUrl);
        publishConnectionStatus();
        scheduleDisconnectCleanup();
        scheduleNextScan();
    };
}
