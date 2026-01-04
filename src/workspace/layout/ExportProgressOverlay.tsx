import React from 'react';

interface ProgressOverlayProps {
    progress: number;
    text: string;
    onClose: () => void;
    downloadUrl?: string;
    filename?: string; // allow dynamic filename based on scene
    kind?: 'png' | 'video' | null; // to drive dynamic heading
}

const ExportProgressOverlay: React.FC<ProgressOverlayProps> = ({
    progress,
    text,
    onClose,
    downloadUrl,
    filename = 'midi-visualization-sequence.zip',
    kind = 'png'
}) => {
    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && downloadUrl) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000]"
            onClick={handleOverlayClick}
        >
            <div className="border rounded-lg p-6 min-w-[400px] text-center [background-color:var(--twc-menubar)] [border-color:var(--twc-border)]">
                <h3 className="mb-5 text-white">
                    {kind === 'video' ? '🎬 Exporting Video' : '📸 Exporting PNG Sequence'}
                </h3>

                {!downloadUrl ? (
                    <div className="mb-5">
                        <div className="w-full h-2 rounded overflow-hidden mb-2 [background-color:var(--twc-control)]">
                            <div
                                className="h-full bg-gradient-to-r from-[#0e639c] to-[#1177bb] w-0 transition-[width] duration-300"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <div className="text-xs text-neutral-300 mb-2">{text}</div>
                        <div className="text-xs text-neutral-300">For fastest export, please do not click off this tab.</div>
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
                )}
            </div>
        </div>
    );
};

export default ExportProgressOverlay;
