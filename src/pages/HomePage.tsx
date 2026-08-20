import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaFileCirclePlus, FaFolderOpen, FaRegClock } from 'react-icons/fa6';
import type { DesktopRecentDocument } from '../../electron/shared/desktop-api';
import { stageDesktopProjectOpen } from '../desktop/pending-open';
import { writeStoredImportPayload } from '@utils/importPayloadStorage';
import { easyModeTemplates } from '@workspace/templates/easyModeTemplates';
import type { TemplateDefinition } from '@workspace/templates/types';
import { BUILD_INFO } from '@app/build-info';
import { stagePendingDocumentAnalytics } from '@app/analytics';
import type { UpdateCheckResult } from '../../electron/shared/build-info';
import { LocalSaveService } from '@persistence/local-save-service';

const PENDING_DESKTOP_NAME_KEY = 'mvmnt.desktop.pending-open-name';

const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [recentFiles, setRecentFiles] = useState<DesktopRecentDocument[]>([]);
    const [isOpening, setIsOpening] = useState(false);
    const [hasAutosave, setHasAutosave] = useState(false);
    const [update, setUpdate] = useState<UpdateCheckResult | null>(null);

    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        void desktop.documents
            .listRecent()
            .then(setRecentFiles)
            .catch(() => setRecentFiles([]));
    }, []);

    useEffect(() => {
        void LocalSaveService.hasSavedFile().then(setHasAutosave);
    }, []);

    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        void desktop.app
            .checkForUpdates()
            .then(setUpdate)
            .catch(() => setUpdate({ status: 'error' }));
    }, []);

    const openStagedProject = (bytes: Uint8Array, name: string, options: { newDocument?: boolean } = {}) => {
        writeStoredImportPayload(bytes);
        if (options.newDocument) sessionStorage.removeItem(PENDING_DESKTOP_NAME_KEY);
        else sessionStorage.setItem(PENDING_DESKTOP_NAME_KEY, name);
        navigate('/workspace', { state: { importScene: true, newDocument: options.newDocument } });
    };

    const handleNewDocument = async () => {
        setIsOpening(true);
        try {
            await window.mvmntDesktop?.documents.clearActivePath();
            stagePendingDocumentAnalytics({ createdEntryPoint: 'home' });
            navigate('/workspace', { state: { template: 'blank', desktopNew: true } });
        } finally {
            setIsOpening(false);
        }
    };

    const handleRecoverAutosave = async () => {
        setIsOpening(true);
        try {
            await window.mvmntDesktop?.documents.clearActivePath();
            navigate('/workspace', { state: { restoreAutosave: true } });
        } finally {
            setIsOpening(false);
        }
    };

    const handleOpen = async () => {
        const desktop = window.mvmntDesktop;
        if (!desktop) {
            inputRef.current?.click();
            return;
        }
        setIsOpening(true);
        try {
            const result = await desktop.documents.open();
            if (stageDesktopProjectOpen(result)) {
                stagePendingDocumentAnalytics({ source: 'file_picker' });
                navigate('/workspace', { state: { importScene: true } });
            }
        } finally {
            setIsOpening(false);
        }
    };

    const handleBrowserFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setIsOpening(true);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            stagePendingDocumentAnalytics({ source: 'browser_file_picker' });
            openStagedProject(bytes, file.name);
        } finally {
            setIsOpening(false);
        }
    };

    const handleTemplate = async (template: TemplateDefinition) => {
        setIsOpening(true);
        try {
            const artifact = await template.loadArtifact();
            await window.mvmntDesktop?.documents.clearActivePath();
            stagePendingDocumentAnalytics({ createdEntryPoint: 'home', templateEntryPoint: 'home' });
            openStagedProject(artifact.data, `${template.name}.mvt`, { newDocument: true });
        } catch (error) {
            alert(`Could not open ${template.name}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsOpening(false);
        }
    };

    const handleRecent = async (index: number) => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        setIsOpening(true);
        try {
            const result = await desktop.documents.openRecent(index);
            if (stageDesktopProjectOpen(result)) {
                stagePendingDocumentAnalytics({ source: 'recent_documents' });
                navigate('/workspace', { state: { importScene: true } });
            } else setRecentFiles(await desktop.documents.listRecent());
        } finally {
            setIsOpening(false);
        }
    };

    return (
        <main className="min-h-screen bg-neutral-800 px-6 py-10 text-neutral-200">
            <input
                ref={inputRef}
                type="file"
                accept=".mvt,application/octet-stream"
                className="hidden"
                onChange={handleBrowserFile}
            />
            <div className="mx-auto w-full max-w-4xl">
                <div className="mb-10">
                    <p>
                        <span className="text-8xl font-extrabold tracking-tight text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]">
                            MVMNT
                        </span>
                        <span className="ml-2 text-sm text-neutral-400">v{BUILD_INFO.displayVersion}</span>
                    </p>
                    <p className="mt-4 max-w-2xl text-lg text-neutral-400">
                        Open-source, flexible MIDI visualization & rendering workspace.
                    </p>
                    {update?.status === 'available' ? (
                        <div
                            className="mt-5 flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-400/40 bg-indigo-950/50 px-4 py-3"
                            role="status"
                        >
                            <span className="text-sm text-indigo-100">MVMNT v{update.latestVersion} is available.</span>
                            <button
                                type="button"
                                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                                onClick={() => void window.mvmntDesktop?.external.openHttps(update.downloadUrl)}
                            >
                                Download
                            </button>
                        </div>
                    ) : null}
                    <nav className="mt-6 space-y-4" aria-label="Home actions">
                        <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Documents">
                            <button
                                type="button"
                                onClick={() => void handleNewDocument()}
                                disabled={isOpening}
                                className="rounded bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 px-5 py-2.5 text-sm font-medium tracking-[0.2rem] text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 disabled:opacity-60"
                            >
                                NEW DOCUMENT
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleOpen()}
                                disabled={isOpening}
                                className="flex items-center gap-2 rounded bg-neutral-700 px-5 py-2.5 text-sm font-medium transition hover:bg-neutral-600 disabled:opacity-60"
                            >
                                <FaFolderOpen /> OPEN
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleRecoverAutosave()}
                                disabled={isOpening || !hasAutosave}
                                title={hasAutosave ? undefined : 'No autosave is available'}
                                className="flex items-center gap-2 rounded bg-neutral-700 px-5 py-2.5 text-sm font-medium transition hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <FaRegClock /> RECOVER AUTOSAVE
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-4" role="group" aria-label="Project information">
                            <Link
                                to="/about"
                                className="rounded bg-neutral-800 px-5 py-2.5 text-sm font-medium hover:bg-neutral-700"
                            >
                                About
                            </Link>
                            <Link
                                to="/contribute"
                                className="rounded bg-neutral-800 px-5 py-2.5 text-sm font-medium hover:bg-neutral-700"
                            >
                                Contribute
                            </Link>
                            <Link
                                to="/changelog"
                                className="rounded bg-neutral-800 px-5 py-2.5 text-sm font-medium hover:bg-neutral-700"
                            >
                                Changelog
                            </Link>
                            <Link
                                to="/privacy"
                                className="rounded bg-neutral-800 px-5 py-2.5 text-sm font-medium hover:bg-neutral-700"
                            >
                                Privacy
                            </Link>
                            <Link
                                to="/community"
                                className="rounded bg-neutral-800 px-5 py-2.5 text-sm font-medium hover:bg-neutral-700"
                            >
                                Community
                            </Link>
                        </div>
                    </nav>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
                    <section aria-labelledby="templates-title">
                        <h2
                            id="templates-title"
                            className="mb-3 text-sm font-medium uppercase tracking-[0.16rem] text-neutral-400"
                        >
                            Start from a template
                        </h2>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {easyModeTemplates.map((template) => (
                                <button
                                    type="button"
                                    key={template.id}
                                    onClick={() => void handleTemplate(template)}
                                    disabled={isOpening}
                                    className="group flex min-h-32 flex-col items-start rounded-lg border border-neutral-700 bg-neutral-900/60 p-4 text-left transition hover:border-neutral-500 hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                                >
                                    <span className="mb-3 text-lg text-neutral-400 transition group-hover:text-white">
                                        <FaFileCirclePlus />
                                    </span>
                                    <strong className="text-sm text-neutral-100">{template.name}</strong>
                                    <small className="mt-1 text-xs leading-5 text-neutral-400">
                                        {template.description}
                                    </small>
                                    {template.author ? (
                                        <small className="mt-auto pt-2 text-xs text-neutral-500">
                                            by {template.author}
                                        </small>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section
                        aria-labelledby="recent-title"
                        className="rounded-lg border border-neutral-700 bg-neutral-900/60"
                    >
                        <div className="border-b border-neutral-700 px-4 py-3">
                            <h2
                                id="recent-title"
                                className="flex items-center gap-2 text-sm font-medium text-neutral-200"
                            >
                                <FaRegClock className="text-neutral-400" /> Recent files
                            </h2>
                            <p className="mt-1 text-xs text-neutral-500">Up to five recently opened projects.</p>
                        </div>
                        {recentFiles.length ? (
                            <ol className="p-2">
                                {recentFiles.map((file, index) => (
                                    <li key={`${file.displayName}-${file.openedAt}`}>
                                        <button
                                            type="button"
                                            onClick={() => void handleRecent(index)}
                                            disabled={isOpening}
                                            className="w-full truncate rounded px-3 py-2 text-left text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:opacity-60"
                                        >
                                            {file.displayName}
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="p-4 text-sm text-neutral-500">Files you open or save will appear here.</p>
                        )}
                    </section>
                </div>
            </div>
            {isOpening ? (
                <div
                    className="fixed bottom-4 right-4 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm shadow-lg"
                    role="status"
                >
                    Opening document…
                </div>
            ) : null}
        </main>
    );
};

export default HomePage;
