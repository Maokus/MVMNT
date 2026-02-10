import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePluginStore } from '@state/pluginStore';
import { loadPlugin, unloadPlugin } from '@core/scene/plugins';

/**
 * Plugins Settings Page
 * Provides UI for importing, enabling/disabling, and removing plugins
 */
const PluginsPage: React.FC = () => {
    const { plugins, loading } = usePluginStore((state) => ({
        plugins: state.plugins,
        loading: state.loading,
    }));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset file input so same file can be re-imported
        event.target.value = '';

        if (!file.name.endsWith('.mvmnt-plugin')) {
            setImportError('Invalid file type. Please select a .mvmnt-plugin file.');
            return;
        }

        setImporting(true);
        setImportError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await loadPlugin(arrayBuffer);

            if (!result.success) {
                setImportError(result.error || 'Failed to import plugin');
            }
        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'Failed to import plugin');
        } finally {
            setImporting(false);
        }
    };

    const handleTogglePlugin = async (pluginId: string, currentlyEnabled: boolean) => {
        if (currentlyEnabled) {
            // Disable plugin
            usePluginStore.getState().disablePlugin(pluginId);
            await unloadPlugin(pluginId);
        } else {
            // Re-enable plugin
            usePluginStore.getState().clearPluginError(pluginId);
            usePluginStore.getState().enablePlugin(pluginId);
            // Reload the plugin from storage
            const { reloadPluginFromStorage } = await import('@core/scene/plugins/plugin-loader');
            const result = await reloadPluginFromStorage(pluginId);
            if (!result.success) {
                usePluginStore.getState().setPluginError(pluginId, result.error || 'Failed to reload plugin');
            }
        }
    };

    const handleRemovePlugin = async (pluginId: string) => {
        if (!confirm(`Are you sure you want to remove this plugin? This cannot be undone.`)) {
            return;
        }

        try {
            await unloadPlugin(pluginId);
        } catch (error) {
            console.error('Failed to remove plugin:', error);
        }
    };

    const pluginList = Object.values(plugins);

    return (
        <div className="min-h-screen bg-neutral-800 text-neutral-200 px-6 py-10">
            <main className="max-w-5xl mx-auto">
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white">
                            Plugins
                        </h1>
                        <p className="mt-3 text-neutral-400 leading-relaxed max-w-2xl">
                            Manage custom scene element plugins. Import .mvmnt-plugin bundles to extend MVMNT with new element types.
                        </p>
                    </div>
                    <Link
                        to="/"
                        className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium"
                    >
                        Back to Home
                    </Link>
                </div>

                {/* Import Section */}
                <section className="mb-8 p-6 rounded-xl bg-neutral-900/70 border border-neutral-800">
                    <h2 className="text-xl font-semibold mb-3 text-white">Import Plugin</h2>
                    <p className="text-sm text-neutral-300 mb-4">
                        Select a <code className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">.mvmnt-plugin</code> file to import.
                    </p>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mvmnt-plugin"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />

                    <button
                        onClick={handleImportClick}
                        disabled={importing}
                        className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-400 text-sm font-medium transition"
                    >
                        {importing ? 'Importing...' : 'Select Plugin File'}
                    </button>

                    {importError && (
                        <div className="mt-4 p-4 rounded-lg bg-rose-900/30 border border-rose-500/50 text-rose-200">
                            <p className="text-sm font-medium">Import Failed</p>
                            <p className="text-sm mt-1">{importError}</p>
                        </div>
                    )}
                </section>

                {/* Installed Plugins Section */}
                <section className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800">
                    <h2 className="text-xl font-semibold mb-4 text-white">Installed Plugins</h2>

                    {pluginList.length === 0 ? (
                        <p className="text-sm text-neutral-400">No plugins installed.</p>
                    ) : (
                        <div className="space-y-4">
                            {pluginList.map((plugin) => {
                                const isLoading = loading[plugin.manifest.id];
                                const hasError = !!plugin.error;

                                return (
                                    <div
                                        key={plugin.manifest.id}
                                        className={`p-4 rounded-lg border transition ${hasError
                                                ? 'bg-rose-900/20 border-rose-500/40'
                                                : plugin.enabled
                                                    ? 'bg-emerald-900/20 border-emerald-500/40'
                                                    : 'bg-neutral-800/50 border-neutral-700'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-lg font-semibold text-white">
                                                        {plugin.manifest.name}
                                                    </h3>
                                                    <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-xs font-medium">
                                                        v{plugin.manifest.version}
                                                    </span>
                                                    {isLoading && (
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-200 text-xs font-medium">
                                                            Loading...
                                                        </span>
                                                    )}
                                                    {hasError && (
                                                        <span className="px-2 py-0.5 rounded-full bg-rose-900/50 text-rose-200 text-xs font-medium">
                                                            Error
                                                        </span>
                                                    )}
                                                    {!hasError && plugin.enabled && (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-200 text-xs font-medium">
                                                            Enabled
                                                        </span>
                                                    )}
                                                    {!hasError && !plugin.enabled && (
                                                        <span className="px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-400 text-xs font-medium">
                                                            Disabled
                                                        </span>
                                                    )}
                                                </div>

                                                {plugin.manifest.description && (
                                                    <p className="mt-2 text-sm text-neutral-300">
                                                        {plugin.manifest.description}
                                                    </p>
                                                )}

                                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                                                    {plugin.manifest.author && (
                                                        <span>By {plugin.manifest.author}</span>
                                                    )}
                                                    <span>•</span>
                                                    <span>{plugin.manifest.elements.length} element{plugin.manifest.elements.length !== 1 ? 's' : ''}</span>
                                                    {plugin.manifest.homepage && (
                                                        <>
                                                            <span>•</span>
                                                            <a
                                                                href={plugin.manifest.homepage}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-indigo-400 hover:text-indigo-300 underline"
                                                            >
                                                                Homepage
                                                            </a>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Element Types */}
                                                <div className="mt-3">
                                                    <p className="text-xs text-neutral-500 mb-1">Element Types:</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {plugin.manifest.elements.map((el) => (
                                                            <span
                                                                key={el.type}
                                                                className="px-2 py-0.5 rounded bg-neutral-800/50 text-neutral-300 text-xs"
                                                            >
                                                                {el.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Error Message */}
                                                {hasError && (
                                                    <div className="mt-3 p-3 rounded bg-rose-900/30 border border-rose-500/30">
                                                        <p className="text-sm font-medium text-rose-200">Error:</p>
                                                        <p className="text-sm text-rose-300 mt-1">{plugin.error}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 ml-4">
                                                <button
                                                    onClick={() => handleTogglePlugin(plugin.manifest.id, plugin.enabled)}
                                                    disabled={isLoading}
                                                    className={`px-3 py-1.5 rounded text-sm font-medium transition ${plugin.enabled
                                                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                                        } disabled:bg-neutral-700 disabled:text-neutral-400`}
                                                >
                                                    {plugin.enabled ? 'Disable' : 'Enable'}
                                                </button>
                                                <button
                                                    onClick={() => handleRemovePlugin(plugin.manifest.id)}
                                                    disabled={isLoading}
                                                    className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:bg-neutral-700 disabled:text-neutral-400 text-sm font-medium text-white transition"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Safety Controls Info */}
                <section className="mt-8 p-6 rounded-xl bg-neutral-900/70 border border-neutral-800">
                    <h2 className="text-xl font-semibold mb-3 text-white">Safety Controls</h2>
                    <ul className="space-y-2 text-sm text-neutral-300">
                        <li>• Plugins are isolated and cannot access sensitive data</li>
                        <li>• Render operations are time-limited to prevent freezing</li>
                        <li>• Maximum render object count enforced per element</li>
                        <li>• Plugins auto-disable on errors and can be re-enabled</li>
                        <li>• Only plugins compatible with your MVMNT version can be loaded</li>
                    </ul>
                </section>
            </main>
        </div>
    );
};

export default PluginsPage;
