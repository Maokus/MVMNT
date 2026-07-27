import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaFile, FaFolderOpen, FaRegClock, FaRegFile, FaWandMagicSparkles } from 'react-icons/fa6';
import type { DesktopRecentDocument } from '../../electron/shared/desktop-api';
import logo from '@assets/Logo_Transparent.png';
import { stageDesktopProjectOpen } from '../desktop/pending-open';
import { writeStoredImportPayload } from '@utils/importPayloadStorage';
import { easyModeTemplates } from '@workspace/templates/easyModeTemplates';
import type { TemplateDefinition } from '@workspace/templates/types';
import './homepage.css';

const PENDING_DESKTOP_NAME_KEY = 'mvmnt.desktop.pending-open-name';

const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [recentFiles, setRecentFiles] = useState<DesktopRecentDocument[]>([]);
    const [isOpening, setIsOpening] = useState(false);

    useEffect(() => {
        const desktop = window.mvmntDesktop;
        if (!desktop) return;
        void desktop.documents.listRecent().then(setRecentFiles).catch(() => setRecentFiles([]));
    }, []);

    const openStagedProject = (bytes: Uint8Array, name: string) => {
        writeStoredImportPayload(bytes);
        sessionStorage.setItem(PENDING_DESKTOP_NAME_KEY, name);
        navigate('/workspace', { state: { importScene: true } });
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
            openStagedProject(artifact.data, `${template.name}.mvt`);
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
        <main className="start-center">
            <input ref={inputRef} type="file" accept=".mvt,application/octet-stream" className="start-center__file-input" onChange={handleBrowserFile} />
            <header className="start-center__topbar">
                <Link to="/" className="start-center__brand" aria-label="MVMNT home">
                    <img src={logo} alt="" />
                    <span>MVMNT</span>
                </Link>
                <nav aria-label="MVMNT information">
                    <Link to="/about">About</Link>
                    <Link to="/community">Community</Link>
                    <Link to="/changelog">Changelog</Link>
                </nav>
            </header>

            <section className="start-center__content" aria-labelledby="start-center-title">
                <div className="start-center__intro">
                    <p className="start-center__eyebrow">MIDI VISUALISATION STUDIO</p>
                    <h1 id="start-center-title">Create something in motion.</h1>
                    <p>Start with an empty document, open a saved MVMNT project, or use a ready-made scene as your canvas.</p>
                </div>

                <div className="start-center__primary-actions">
                    <button type="button" className="start-center__new-button" onClick={() => void handleNewDocument()} disabled={isOpening}>
                        <FaFile />
                        <span><strong>New document</strong><small>Start with a blank scene</small></span>
                    </button>
                    <button type="button" className="start-center__open-button" onClick={() => void handleOpen()} disabled={isOpening}>
                        <FaFolderOpen />
                        <span><strong>Open</strong><small>Open an existing .mvt file</small></span>
                    </button>
                </div>

                <div className="start-center__panels">
                    <section className="start-center__panel start-center__templates" aria-labelledby="templates-title">
                        <div className="start-center__section-heading">
                            <FaWandMagicSparkles />
                            <div><h2 id="templates-title">Templates</h2><p>Begin with a scene that is ready to customise.</p></div>
                        </div>
                        <div className="start-center__template-grid">
                            {easyModeTemplates.map((template, index) => (
                                <button type="button" key={template.id} className={`start-center__template start-center__template--${index % 5}`} onClick={() => void handleTemplate(template)} disabled={isOpening}>
                                    <span className="start-center__template-art"><FaRegFile /></span>
                                    <strong>{template.name}</strong>
                                    <small>{template.description}</small>
                                    {template.author ? <em>by {template.author}</em> : null}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="start-center__panel start-center__recent" aria-labelledby="recent-title">
                        <div className="start-center__section-heading">
                            <FaRegClock />
                            <div><h2 id="recent-title">Recent files</h2><p>Your five most recently opened projects.</p></div>
                        </div>
                        {recentFiles.length ? (
                            <ol className="start-center__recent-list">
                                {recentFiles.map((file, index) => (
                                    <li key={`${file.displayName}-${file.openedAt}`}>
                                        <button type="button" onClick={() => void handleRecent(index)} disabled={isOpening}>
                                            <FaFile /><span>{file.displayName}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        ) : <p className="start-center__empty-recent">Files you open or save will appear here.</p>}
                    </section>
                </div>
            </section>
            {isOpening ? <div className="start-center__loading" role="status">Opening document…</div> : null}
        </main>
    );
};

export default HomePage;
