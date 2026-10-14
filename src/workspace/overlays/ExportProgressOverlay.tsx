import React, { useState } from 'react';
import { FaFilm, FaImage, FaDownload } from 'react-icons/fa';
import { Button } from '@workspace/components/Button';
import { ProgressBar } from '@workspace/components/ProgressBar';
import { isExportJobActive, useExportJobStore } from '@export/jobs';
import { createExportDiagnostics } from '@export/diagnostics';

interface ProgressOverlayProps {
    progress: number;
    text: string;
    onClose: () => void;
    downloadUrl?: string;
    filename?: string; // allow dynamic filename based on scene
    kind?: 'png' | 'video' | null; // to drive dynamic heading
    onCancel?: (jobId: string) => void;
    onReveal?: (outputId: string) => void;
    onRemove?: (jobId: string) => void;
}

const ExportProgressOverlay: React.FC<ProgressOverlayProps> = ({
    progress,
    text,
    onClose,
    downloadUrl,
    filename = 'midi-visualization-sequence.zip',
    kind = 'png',
    onCancel,
    onReveal,
    onRemove,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const jobs = useExportJobStore((state) => state.jobs);
    const visibleJobs = jobs.slice(0, 4);
    const active =
        visibleJobs.find((job) => isExportJobActive(job.status) && job.status !== 'queued') ??
        visibleJobs.find((job) => isExportJobActive(job.status));
    const downloadDiagnostics = async () => {
        const version = (await window.mvmntDesktop?.app.getVersion().catch(() => 'unknown')) ?? 'web';
        const blob = new Blob([JSON.stringify(createExportDiagnostics(jobs, version), null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'mvmnt-export-diagnostics.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <>
            <div className="fixed bottom-4 right-4 z-[10000] w-[420px] max-w-[calc(100vw-2rem)]">
                <div className="border rounded p-4 text-left  [background-color:var(--twc-menubar)] [border-color:var(--twc-border)]">
                    <div className={`flex items-center justify-between${isCollapsed ? ' mb-2' : ' mb-3'}`}>
                        <div className="flex min-w-0 items-center gap-2">
                            {!active && !isCollapsed && (
                                <Button
                                    variant="faint"
                                    size="full"
                                    onClick={onClose}
                                    aria-label="Close export progress"
                                >
                                    ×
                                </Button>
                            )}
                            <h3 className="flex items-center gap-1.5 truncate font-semibold text-white">
                                {kind === 'video' ? (
                                    <>
                                        <FaFilm size={14} aria-hidden="true" /> Exporting Video
                                    </>
                                ) : (
                                    <>
                                        <FaImage size={14} aria-hidden="true" /> Exporting PNG Sequence
                                    </>
                                )}
                            </h3>
                        </div>
                        {isCollapsed ? (
                            <Button
                                variant="faint"
                                size="full"
                                onClick={() => setIsCollapsed(false)}
                                aria-label="Expand export progress"
                            >
                                Expand
                            </Button>
                        ) : (
                            <Button variant="faint" size="full" onClick={() => setIsCollapsed(true)}>
                                Hide
                            </Button>
                        )}
                    </div>

                    <div className={isCollapsed ? '' : ' mb-2'}>
                        <ProgressBar value={progress} label="Export progress" />
                    </div>

                    {!isCollapsed &&
                        (!downloadUrl ? (
                            <div className="mb-5">
                                <div className="text-xs text-neutral-300 mb-2">{text}</div>
                                <div className="flex justify-between items-center text-xs text-neutral-400">
                                    <span>
                                        {active
                                            ? `${visibleJobs.filter((job) => isExportJobActive(job.status)).length} active/queued`
                                            : 'Finishing…'}
                                    </span>
                                    {active && onCancel && (
                                        <Button variant="danger" size="full" onClick={() => onCancel(active.id)}>
                                            Cancel
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="download-section">
                                <a
                                    href={downloadUrl}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#196127] text-white no-underline rounded font-semibold text-[13px] hover:bg-[#2d7a3d]"
                                    download={filename}
                                >
                                    <FaDownload size={14} aria-hidden="true" /> Download{' '}
                                    {kind === 'video' ? 'Video' : 'PNG Sequence'}
                                </a>
                                <Button variant="neutral" size="full" className="ml-[10px]" onClick={onClose}>
                                    Close
                                </Button>
                            </div>
                        ))}
                    {!isCollapsed && visibleJobs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1">
                            {visibleJobs.map((job) => (
                                <div key={job.id} className="min-w-0 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate">{job.outputName ?? job.snapshot.sceneName}</span>
                                        <span className="opacity-60 capitalize">{job.status}</span>
                                        {job.outputId && onReveal && (
                                            <Button variant="faint" size="full" onClick={() => onReveal(job.outputId!)}>
                                                Reveal
                                            </Button>
                                        )}
                                        {!isExportJobActive(job.status) && onRemove && (
                                            <Button variant="faint" size="full" onClick={() => onRemove(job.id)}>
                                                ×
                                            </Button>
                                        )}
                                    </div>
                                    {job.status === 'failed' && job.error && (
                                        <div className="mt-1 truncate text-red-300" title={job.error}>
                                            {job.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {!isCollapsed && !active && jobs.length > 0 && (
                        <Button
                            variant="faint"
                            size="full"
                            onClick={() => void downloadDiagnostics()}
                            className="mt-3 text-[11px]"
                        >
                            Download diagnostics
                        </Button>
                    )}
                </div>
            </div>
        </>
    );
};

export default ExportProgressOverlay;
