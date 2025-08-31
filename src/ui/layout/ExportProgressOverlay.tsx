import React from 'react';

interface ProgressOverlayProps {
    progress: number;
    text: string;
    onClose: () => void;
    downloadUrl?: string;
    filename?: string; // allow dynamic filename based on scene
}

const ExportProgressOverlay: React.FC<ProgressOverlayProps> = ({
    progress,
    text,
    onClose,
    downloadUrl,
    filename = 'midi-visualization-sequence.zip'
}) => {
    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="progress-overlay" onClick={handleOverlayClick}>
            <div className="progress-modal">
                <h3>📸 Exporting PNG Sequence</h3>

                {!downloadUrl ? (
                    <div className="progress-section">
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <div className="progress-text">{text}</div>
                    </div>
                ) : (
                    <div className="download-section">
                        <a
                            href={downloadUrl}
                            className="inline-block px-4 py-2 bg-[#196127] text-white no-underline rounded font-semibold text-[13px] hover:bg-[#2d7a3d]"
                            download={filename}
                        >
                            ⬇ Download PNG Sequence
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
