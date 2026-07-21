import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AutosaveVersionStore, type AutosaveVersionSummary } from '@persistence/autosave-version-store';
import { LocalFileStore } from '@persistence/local-file-store';
import { writeStoredImportPayload } from '@utils/importPayloadStorage';
import { useTimelineStore } from '@state/timelineStore';
import type { DesktopStorageReport } from '../../electron/shared/desktop-api';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-label={title}>
            <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button type="button" onClick={onClose} className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800">Close</button>
                </div>
                {children}
            </div>
        </div>
    );
}

export function DesktopWorkspaceTools() {
    const navigate = useNavigate();
    const [panel, setPanel] = useState<'recovery' | 'storage' | null>(null);
    const [versions, setVersions] = useState<AutosaveVersionSummary[]>([]);
    const [currentFileBytes, setCurrentFileBytes] = useState(0);
    const [nativeStorage, setNativeStorage] = useState<DesktopStorageReport | null>(null);
    const [message, setMessage] = useState('');

    const refresh = useCallback(async () => {
        setVersions(await AutosaveVersionStore.list());
        setCurrentFileBytes(await LocalFileStore.savedSize());
        setNativeStorage(await window.mvmntDesktop?.storage.inspect().catch(() => null) ?? null);
    }, []);

    useEffect(() => {
        const openRecovery = () => { setPanel('recovery'); void refresh(); };
        const openStorage = () => { setPanel('storage'); void refresh(); };
        window.addEventListener('mvmnt-show-recovery', openRecovery);
        window.addEventListener('mvmnt-show-storage', openStorage);
        const unsubscribe = window.mvmntDesktop?.menu.onCommand((command) => {
            if (command === 'recovery') openRecovery();
            if (command === 'storage') openStorage();
            if (command === 'plugin-development') void window.mvmntDesktop?.pluginDevelopment.grantDirectory();
        });
        return () => {
            window.removeEventListener('mvmnt-show-recovery', openRecovery);
            window.removeEventListener('mvmnt-show-storage', openStorage);
            unsubscribe?.();
        };
    }, [refresh]);

    const restore = async (version: AutosaveVersionSummary) => {
        const bytes = await AutosaveVersionStore.load(version.id);
        if (!bytes) { setMessage('That recovery version is no longer available.'); return; }
        writeStoredImportPayload(bytes);
        sessionStorage.setItem('mvmnt.desktop.pending-open-name', `${version.documentName}.mvt`);
        await window.mvmntDesktop?.documents.clearActivePath();
        setPanel(null);
        navigate('/workspace', { state: { importScene: true, recoveredVersion: version.id } });
    };

    const clearMemoryCaches = () => {
        useTimelineStore.setState((state) => ({
            audioCache: Object.fromEntries(Object.entries(state.audioCache).map(([id, entry]) => [id, {
                ...entry,
                audioBuffer: undefined,
                decodedState: 'failed' as const,
                decodedFailureReason: 'Decoded cache cleared by user',
            }])),
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        }));
        setMessage('Decoded audio and feature caches were cleared. They will be rebuilt when needed.');
    };

    if (!panel) return null;
    if (panel === 'recovery') {
        return (
            <Modal title="Recovery Versions" onClose={() => setPanel(null)}>
                <p className="mb-4 text-sm text-neutral-400">Up to {AutosaveVersionStore.policy.maxVersionsPerProject} versions per project are kept for {AutosaveVersionStore.policy.maxAgeDays} days.</p>
                {versions.length === 0 ? <p className="text-sm text-neutral-400">No recovery versions are available.</p> : (
                    <div className="space-y-2">
                        {versions.map((version) => (
                            <div key={version.id} className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-950/60 p-3">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{version.documentName}</div>
                                    <div className="text-xs text-neutral-500">{new Date(version.savedAt).toLocaleString()} · {formatBytes(version.size)}</div>
                                </div>
                                <button className="rounded bg-indigo-600 px-3 py-1 text-xs hover:bg-indigo-500" onClick={() => void restore(version)}>Restore</button>
                                <button className="rounded border border-rose-700 px-3 py-1 text-xs text-rose-300 hover:bg-rose-950" onClick={() => void AutosaveVersionStore.remove(version.id).then(refresh)}>Delete</button>
                            </div>
                        ))}
                    </div>
                )}
                {versions.length > 0 && <button className="mt-4 rounded border border-rose-700 px-3 py-1.5 text-xs text-rose-300" onClick={() => {
                    if (confirm('Delete all recovery versions?')) void AutosaveVersionStore.clear().then(refresh);
                }}>Delete all versions</button>}
            </Modal>
        );
    }
    const autosaveBytes = versions.reduce((total, item) => total + item.size, 0);
    return (
        <Modal title="Storage & Caches" onClose={() => setPanel(null)}>
            <p className="mb-4 break-all text-xs text-neutral-500">Desktop data: {nativeStorage?.location ?? 'Browser application storage'}</p>
            <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded border border-neutral-800 p-3"><span>Current recovery package</span><button className="rounded border border-neutral-700 px-2 py-1 text-xs" disabled={currentFileBytes === 0} onClick={() => {
                    if (confirm('Delete the current recovery package? Saved project files are not affected.')) void LocalFileStore.clear().then(refresh);
                }}>Clean {formatBytes(currentFileBytes)}</button></div>
                <div className="flex items-center justify-between rounded border border-neutral-800 p-3"><span>Autosave versions ({versions.length})</span><span>{formatBytes(autosaveBytes)}</span></div>
                <div className="flex items-center justify-between rounded border border-neutral-800 p-3"><span>Interrupted temporary exports</span><button className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={() => void window.mvmntDesktop?.storage.cleanup('temporary-exports').then(setNativeStorage)}>Clean {formatBytes(nativeStorage?.temporaryExports.bytes ?? 0)}</button></div>
                <div className="flex items-center justify-between rounded border border-neutral-800 p-3"><span>Old application/update cache</span><button disabled={!nativeStorage?.updateCache.available} className="rounded border border-neutral-700 px-2 py-1 text-xs disabled:opacity-40" onClick={() => void window.mvmntDesktop?.storage.cleanup('update-cache').then(setNativeStorage)}>Clean {formatBytes(nativeStorage?.updateCache.bytes ?? 0)}</button></div>
                <div className="flex items-center justify-between rounded border border-neutral-800 p-3"><span>Decoded audio and feature caches</span><button className="rounded border border-neutral-700 px-2 py-1 text-xs" onClick={clearMemoryCaches}>Clear memory caches</button></div>
            </div>
            {message && <p className="mt-3 text-xs text-emerald-300">{message}</p>}
        </Modal>
    );
}
