import React, { useRef, useState } from 'react';
import { usePluginStore } from '@state/pluginStore';
import { disablePlugin, enablePlugin, loadPlugin, unloadPlugin, upgradePlugin } from '@core/scene/plugins';

const ScenePluginsTab: React.FC = () => {
    const { plugins, loading } = usePluginStore((state) => ({
        plugins: state.plugins,
        loading: state.loading,
    }));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [upgradeOffer, setUpgradeOffer] = useState<File | null>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        event.target.value = '';

        if (!file.name.endsWith('.mvmnt-plugin')) {
            setImportError('Invalid file type. Please select a .mvmnt-plugin file.');
            return;
        }

        setImportError(null);
        setPendingFile(file);
    };

    const handleConfirmImport = async () => {
        if (!pendingFile) return;
        const file = pendingFile;
        setPendingFile(null);
        setImporting(true);
        setImportError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await loadPlugin(arrayBuffer);

            if (!result.success) {
                if (result.error?.includes('is already loaded')) {
                    setUpgradeOffer(file);
                } else {
                    setImportError(result.error || 'Failed to import plugin');
                }
            }
        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'Failed to import plugin');
        } finally {
            setImporting(false);
        }
    };

    const handleConfirmUpgrade = async () => {
        if (!upgradeOffer) return;
        const file = upgradeOffer;
        setUpgradeOffer(null);
        setImporting(true);
        setImportError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await upgradePlugin(arrayBuffer);

            if (!result.success) {
                setImportError(result.error || 'Failed to upgrade plugin');
            }
        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'Failed to upgrade plugin');
        } finally {
            setImporting(false);
        }
    };

    const handleTogglePlugin = async (pluginId: string, currentlyEnabled: boolean) => {
        if (currentlyEnabled) {
            const result = await disablePlugin(pluginId);
            if (!result.success) {
                usePluginStore.getState().setPluginError(pluginId, result.error || 'Failed to disable plugin');
            }
        } else {
            const result = await enablePlugin(pluginId);
            if (!result.success) {
                usePluginStore.getState().setPluginError(pluginId, result.error || 'Failed to reload plugin');
            }
        }
    };

    const handleRemovePlugin = async (pluginId: string) => {
        if (!confirm('Are you sure you want to remove this plugin? This cannot be undone.')) {
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
        <div className="flex flex-col gap-5">
            <div>
                <h3 className="m-0 text-[13px] font-semibold text-white">Plugins</h3>
                <p className="m-0 mt-1 text-[12px] text-neutral-400">
                    Import and manage custom scene element plugins for this workspace.
                </p>
            </div>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-4">
                <h4 className="m-0 text-[12px] font-semibold text-white">Import Plugin</h4>
                <p className="mt-2 text-[12px] text-neutral-300">
                    Select a <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">.mvmnt-plugin</code> file to import.
                </p>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mvmnt-plugin"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />

                <button
                    type="button"
                    onClick={handleImportClick}
                    disabled={importing}
                    className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-400"
                >
                    {importing ? 'Importing...' : 'Select Plugin File'}
                </button>

                {pendingFile && (
                    <div className="mt-3 rounded border border-amber-500/40 bg-amber-900/20 p-3 space-y-2">
                        <p className="text-[12px] font-medium text-amber-200">Install "{pendingFile.name}"?</p>
                        <p className="text-[12px] text-amber-300/80 leading-relaxed">
                            This plugin will run code on your computer. Only install plugins from authors you trust.
                        </p>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setPendingFile(null)}
                                className="rounded border border-neutral-600 px-3 py-1 text-[12px] font-medium text-neutral-300 transition hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmImport}
                                className="rounded bg-indigo-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-indigo-500"
                            >
                                Install
                            </button>
                        </div>
                    </div>
                )}

                {upgradeOffer && (
                    <div className="mt-3 rounded border border-sky-500/40 bg-sky-900/20 p-3 space-y-2">
                        <p className="text-[12px] font-medium text-sky-200">Plugin already installed</p>
                        <p className="text-[12px] text-sky-300/80 leading-relaxed">
                            A plugin with this ID is already installed. Would you like to upgrade it?
                            The existing plugin will be replaced if the new version is newer.
                        </p>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setUpgradeOffer(null)}
                                className="rounded border border-neutral-600 px-3 py-1 text-[12px] font-medium text-neutral-300 transition hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmUpgrade}
                                className="rounded bg-sky-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-sky-500"
                            >
                                Upgrade
                            </button>
                        </div>
                    </div>
                )}

                {importError && (
                    <div className="mt-3 rounded border border-rose-500/50 bg-rose-900/30 p-3 text-rose-200">
                        <p className="text-[12px] font-medium">Import Failed</p>
                        <p className="mt-1 text-[12px]">{importError}</p>
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-4">
                <h4 className="m-0 text-[12px] font-semibold text-white">Installed Plugins</h4>

                {pluginList.length === 0 ? (
                    <p className="mt-2 text-[12px] text-neutral-400">No plugins installed.</p>
                ) : (
                    <div className="mt-3 space-y-3">
                        {pluginList.map((plugin) => {
                            const isLoading = loading[plugin.manifest.id];
                            const hasError = !!plugin.error;

                            return (
                                <div
                                    key={plugin.manifest.id}
                                    className={`rounded-lg border p-3 transition ${hasError
                                        ? 'border-rose-500/40 bg-rose-900/20'
                                        : plugin.enabled
                                            ? 'border-emerald-500/40 bg-emerald-900/20'
                                            : 'border-neutral-700 bg-neutral-800/50'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h5 className="m-0 text-[13px] font-semibold text-white">{plugin.manifest.name}</h5>
                                                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
                                                    v{plugin.manifest.version}
                                                </span>
                                                {isLoading && (
                                                    <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium text-blue-200">
                                                        Loading...
                                                    </span>
                                                )}
                                                {hasError && (
                                                    <span className="rounded-full bg-rose-900/50 px-2 py-0.5 text-[10px] font-medium text-rose-200">
                                                        Error
                                                    </span>
                                                )}
                                                {!hasError && plugin.enabled && (
                                                    <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                                                        Enabled
                                                    </span>
                                                )}
                                                {!hasError && !plugin.enabled && (
                                                    <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                                                        Disabled
                                                    </span>
                                                )}
                                            </div>

                                            {plugin.manifest.description && (
                                                <p className="mt-2 text-[12px] text-neutral-300">
                                                    {plugin.manifest.description}
                                                </p>
                                            )}

                                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-neutral-400">
                                                {plugin.manifest.author && <span>By {plugin.manifest.author}</span>}
                                                <span>•</span>
                                                <span>
                                                    {plugin.manifest.elements.length} element{plugin.manifest.elements.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>

                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {plugin.manifest.elements.map((el) => (
                                                    <span
                                                        key={el.type}
                                                        className="rounded bg-neutral-800/50 px-2 py-0.5 text-[10px] text-neutral-300"
                                                    >
                                                        {el.type}
                                                    </span>
                                                ))}
                                            </div>

                                            {hasError && (
                                                <div className="mt-2 rounded border border-rose-500/30 bg-rose-900/30 p-2">
                                                    <p className="text-[11px] font-medium text-rose-200">Error:</p>
                                                    <p className="mt-1 text-[11px] text-rose-300">{plugin.error}</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleTogglePlugin(plugin.manifest.id, plugin.enabled)}
                                                disabled={isLoading}
                                                className={`rounded px-3 py-1.5 text-[11px] font-medium transition ${plugin.enabled
                                                    ? 'bg-amber-600 text-white hover:bg-amber-500'
                                                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                                                    } disabled:bg-neutral-700 disabled:text-neutral-400`}
                                            >
                                                {plugin.enabled ? 'Disable' : 'Enable'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRemovePlugin(plugin.manifest.id)}
                                                disabled={isLoading}
                                                className="rounded bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-rose-500 disabled:bg-neutral-700 disabled:text-neutral-400"
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

        </div>
    );
};

export default ScenePluginsTab;
