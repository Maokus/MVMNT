import React, { useState } from 'react';
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
                <div className="border rounded-lg p-4 text-left shadow-2xl [background-color:var(--twc-menubar)] [border-color:var(--twc-border)]">
                    <div className={`flex items-center justify-between${isCollapsed ? ' mb-2' : ' mb-3'}`}>
                        <div className="flex min-w-0 items-center gap-2">
                            {!active && !isCollapsed && (
                                <button
                                    className="-ml-1 text-sm leading-none opacity-60 hover:opacity-100"
                                    onClick={onClose}
                                    aria-label="Close export progress"
                                >
                                    ×
                                </button>
                            )}
                            <h3 className="truncate text-white font-semibold">
                                {kind === 'video' ? '🎬 Exporting Video' : '📸 Exporting PNG Sequence'}
                            </h3>
                        </div>
                        {isCollapsed ? (
                            <button
                                className="text-xs opacity-70 hover:opacity-100"
                                onClick={() => setIsCollapsed(false)}
                                aria-label="Expand export progress"
                            >
                                Expand
                            </button>
                        ) : (
                            <button
                                className="text-xs opacity-70 hover:opacity-100"
                                onClick={() => setIsCollapsed(true)}
                            >
                                Hide
                            </button>
                        )}
                    </div>

                    <div
                        className={`w-full h-2 rounded overflow-hidden [background-color:var(--twc-control)]${isCollapsed ? '' : ' mb-2'}`}
                        role="progressbar"
                        aria-label="Export progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress)}
                    >
                        <div
                            className="h-full bg-gradient-to-r from-[#0e639c] to-[#1177bb] transition-[width] duration-300"
                            style={{ width: `${progress}%` }}
                        />
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
                                        <button
                                            className="px-2 py-1 rounded bg-red-900/70 hover:bg-red-800 text-red-100"
                                            onClick={() => onCancel(active.id)}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="download-section">
                                <a
                                    href={downloadUrl}
                                    className="inline-block px-4 py-2 bg-[#196127] text-white no-underline rounded font-semibold text-[13px] hover:bg-[#2d7a3d]"
                                    download={filename}
                                >
                                    ⬇ Download {kind === 'video' ? 'Video' : 'PNG Sequence'}
                                </a>
                                <button
                                    className="px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-neutral-600 border-neutral-500 text-neutral-100 hover:bg-neutral-500 hover:border-neutral-400 ml-[10px]"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            </div>
                        ))}
                    {!isCollapsed && visibleJobs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-neutral-700 space-y-1">
                            {visibleJobs.map((job) => (
                                <div key={job.id} className="min-w-0 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate">{job.outputName ?? job.snapshot.sceneName}</span>
                                        <span className="opacity-60 capitalize">{job.status}</span>
                                        {job.outputId && onReveal && (
                                            <button
                                                className="text-sky-300 hover:text-sky-200"
                                                onClick={() => onReveal(job.outputId!)}
                                            >
                                                Reveal
                                            </button>
                                        )}
                                        {!isExportJobActive(job.status) && onRemove && (
                                            <button
                                                className="opacity-60 hover:opacity-100"
                                                onClick={() => onRemove(job.id)}
                                            >
                                                ×
                                            </button>
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
                        <button
                            className="mt-3 text-[11px] opacity-60 hover:opacity-100"
                            onClick={() => void downloadDiagnostics()}
                        >
                            Download diagnostics
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

export default ExportProgressOverlay;
