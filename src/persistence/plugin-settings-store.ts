const SETTINGS_KEY = 'mvmnt-plugin-settings';

interface StoredPluginSettings {
    enabledStates: Record<string, boolean>;
}

function loadSettings(): StoredPluginSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            return JSON.parse(raw) as StoredPluginSettings;
        }
    } catch {
        /* ignore parse errors */
    }
    return { enabledStates: {} };
}

function saveSettings(settings: StoredPluginSettings): void {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        /* ignore write errors */
    }
}

export const PluginSettingsStore = {
    getEnabled(pluginId: string): boolean | undefined {
        return loadSettings().enabledStates[pluginId];
    },

    setEnabled(pluginId: string, enabled: boolean): void {
        const settings = loadSettings();
        settings.enabledStates[pluginId] = enabled;
        saveSettings(settings);
    },

    hasEntry(pluginId: string): boolean {
        return pluginId in loadSettings().enabledStates;
    },

    removeEntry(pluginId: string): void {
        const settings = loadSettings();
        delete settings.enabledStates[pluginId];
        saveSettings(settings);
    },
};
