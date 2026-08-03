import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaFileCirclePlus, FaFolderOpen, FaRegClock } from 'react-icons/fa6';
import type { DesktopRecentDocument } from '../../electron/shared/desktop-api';
import pfp from '@assets/Logo_Pfp_white.png';
import { stageDesktopProjectOpen } from '../desktop/pending-open';
import { writeStoredImportPayload } from '@utils/importPayloadStorage';
import { easyModeTemplates } from '@workspace/templates/easyModeTemplates';
import type { TemplateDefinition } from '@workspace/templates/types';

const PENDING_DESKTOP_NAME_KEY = 'mvmnt.desktop.pending-open-name';

const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [recentFiles, setRecentFiles] = useState<DesktopRecentDocument[]>([]);
    const [isOpening, setIsOpening] = useState(false);

    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        void desktop.documents
            .listRecent()
            .then(setRecentFiles)
            .catch(() => setRecentFiles([]));
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
            navigate('/workspace', { state: { template: 'blank', desktopNew: true } });
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
            if (stageDesktopProjectOpen(result)) navigate('/workspace', { state: { importScene: true } });
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
            openStagedProject(new Uint8Array(await file.arrayBuffer()), file.name);
        } finally {
            setIsOpening(false);
        }
    };

    const handleTemplate = async (template: TemplateDefinition) => {
        setIsOpening(true);
        try {
            const artifact = await template.loadArtifact();
            await window.mvmntDesktop?.documents.clearActivePath();
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
            if (stageDesktopProjectOpen(result)) navigate('/workspace', { state: { importScene: true } });
            else setRecentFiles(await desktop.documents.listRecent());
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
                        <span>v{(import.meta as any).env?.VITE_VERSION}</span>
                    </p>
                    <p className="mt-4 max-w-2xl text-lg text-neutral-400">
                        Open-source, flexible MIDI visualization & rendering workspace.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-4">
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
                            to="/community"
                            className="rounded bg-neutral-800 px-5 py-2.5 text-sm font-medium hover:bg-neutral-700"
                        >
                            Community
                        </Link>
                    </div>
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
            <DonationNotice />
        </main>
    );
};

const DonationNotice: React.FC = () => {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex items-end gap-2">
            <div className="relative">
                <div className="max-w-xs rounded-lg border border-neutral-800 bg-neutral-900/85 p-3 text-neutral-100 shadow-lg backdrop-blur-sm">
                    <div className="text-sm">
                        <div className="font-medium">Welcome!!</div>
                        <div className="mt-1 text-neutral-300">
                            I develop and host this project at my own expense. If you enjoy the app, please check out
                            how you can support it!
                        </div>
                        <div className="mt-2 flex gap-2">
                            <Link
                                to="/contribute"
                                className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500"
                            >
                                Support MVMNT
                            </Link>
                            <button
                                onClick={() => setDismissed(true)}
                                className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
                <div
                    className="absolute -right-2 bottom-3 h-3 w-3 rotate-45 border border-neutral-800 bg-neutral-900/85"
                    aria-hidden="true"
                />
            </div>
            <img
                src={pfp}
                alt="Maokus avatar"
                className="h-10 w-10 rounded-full border-2 border-neutral-800 object-cover"
            />
        </div>
    );
};

export default HomePage;
