import { create } from 'zustand';

export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    /** Semver range for the MVMNT plugin API (e.g. "^1.0.0"). Replaces legacy `mvmntVersion`. */
    apiVersion: string;
    /** @deprecated Use `apiVersion` instead. Accepted for backwards compatibility. */
    mvmntVersion?: string;
    description?: string;
    author?: string;
    homepage?: string;
    license?: string;
    elements: PluginElementManifest[];
    peerDependencies?: Record<string, string>;
    assets?: {
        images?: string[];
        fonts?: string[];
        other?: string[];
    };
}

export interface PluginElementManifest {
    type: string;
    entry: string;
    icon?: string;
    thumbnail?: string;
    capabilities?: Array<'audio-analysis' | 'midi-events' | 'network' | 'storage'>;
    tags?: string[];
}

export interface LoadedPlugin {
    manifest: PluginManifest;
    enabled: boolean;
    loadedAt: number;
    error?: string;
}

export interface PluginStoreState {
    plugins: Record<string, LoadedPlugin>;
    loading: Record<string, boolean>;
}

export interface PluginStoreActions {
    addPlugin: (manifest: PluginManifest, enabled?: boolean) => void;
    removePlugin: (pluginId: string) => void;
    enablePlugin: (pluginId: string) => void;
    disablePlugin: (pluginId: string) => void;
    setPluginError: (pluginId: string, error: string) => void;
    clearPluginError: (pluginId: string) => void;
    setLoading: (pluginId: string, loading: boolean) => void;
    /**
     * Register a plugin that failed to load (e.g. version incompatibility at startup).
     * Creates a store entry with enabled=false so the UI can surface the error.
     */
    registerFailedPlugin: (manifest: PluginManifest, error: string) => void;
    reset: () => void;
}

const initialState: PluginStoreState = {
    plugins: {},
    loading: {},
};

export const usePluginStore = create<PluginStoreState & PluginStoreActions>((set) => ({
    ...initialState,

    addPlugin: (manifest: PluginManifest, enabled = true) => {
        set((state) => ({
            plugins: {
                ...state.plugins,
                [manifest.id]: {
                    manifest,
                    enabled,
                    loadedAt: Date.now(),
                },
            },
        }));
    },

    removePlugin: (pluginId: string) => {
        set((state) => {
            const { [pluginId]: removed, ...rest } = state.plugins;
            const { [pluginId]: removedLoading, ...restLoading } = state.loading;
            return {
                plugins: rest,
                loading: restLoading,
            };
        });
    },

    enablePlugin: (pluginId: string) => {
        set((state) => {
            const plugin = state.plugins[pluginId];
            if (!plugin) return state;
            return {
                plugins: {
                    ...state.plugins,
                    [pluginId]: {
                        ...plugin,
                        enabled: true,
                        error: undefined,
                    },
                },
            };
        });
    },

    disablePlugin: (pluginId: string) => {
        set((state) => {
            const plugin = state.plugins[pluginId];
            if (!plugin) return state;
            return {
                plugins: {
                    ...state.plugins,
                    [pluginId]: {
                        ...plugin,
                        enabled: false,
                    },
                },
            };
        });
    },

    setPluginError: (pluginId: string, error: string) => {
        set((state) => {
            const plugin = state.plugins[pluginId];
            if (!plugin) return state;
            return {
                plugins: {
                    ...state.plugins,
                    [pluginId]: {
                        ...plugin,
                        error,
                        enabled: false,
                    },
                },
            };
        });
    },

    clearPluginError: (pluginId: string) => {
        set((state) => {
            const plugin = state.plugins[pluginId];
            if (!plugin) return state;
            return {
                plugins: {
                    ...state.plugins,
                    [pluginId]: {
                        ...plugin,
                        error: undefined,
                    },
                },
            };
        });
    },

    setLoading: (pluginId: string, loading: boolean) => {
        set((state) => ({
            loading: {
                ...state.loading,
                [pluginId]: loading,
            },
        }));
    },

    reset: () => set(initialState),

    registerFailedPlugin: (manifest: PluginManifest, error: string) => {
        set((state) => ({
            plugins: {
                ...state.plugins,
                [manifest.id]: {
                    manifest,
                    enabled: false,
                    loadedAt: Date.now(),
                    error,
                },
            },
        }));
    },
}));
