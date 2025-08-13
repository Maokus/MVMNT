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
                            className="download-btn"
                            download={filename}
                        >
                            ⬇ Download PNG Sequence
                        </a>
                        <button
                            className="btn btn-secondary"
                            onClick={onClose}
                            style={{ marginLeft: '10px' }}
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
