import React from 'react';

interface PreviewPanelProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    isPlaying: boolean;
    onPlayPause: () => void;
    onStop: () => void;
    onStepForward: () => void;
    onStepBackward: () => void;
    currentTime: string;
    resolution: number;
    progressPercent?: number;
    onSeekAtPercent?: (percent: number) => void;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
    canvasRef,
    isPlaying,
    onPlayPause,
    onStop,
    onStepForward,
    onStepBackward,
    currentTime,
    resolution,
    progressPercent = 0,
    onSeekAtPercent
}) => {
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onSeekAtPercent) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        onSeekAtPercent(percent);
    };
    return (
        <div className="preview-panel">
            <div className="canvas-container">
                <canvas
                    id='canvas'
                    ref={canvasRef}
                    width={resolution}
                    height={resolution}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        aspectRatio: '1/1'
                    }}
                ></canvas>
            </div>

            <div className="playback-controls">
                <button className="btn btn-secondary" onClick={onStepBackward}>⏪</button>
                <button className="btn btn-primary" onClick={onPlayPause}>
                    {isPlaying ? '⏸️' : '▶️'}
                </button>
                <button className="btn btn-secondary" onClick={onStepForward}>⏩</button>
                <button className="btn btn-secondary" onClick={onStop}>⏹️</button>
                <span className="time-display">{currentTime}</span>
                <div className="progress-bar-container" onClick={handleProgressClick}>
                    <div className="progress-bar-fill" style={{ width: `${Math.max(0, Math.min(100, progressPercent * 100))}%` }}></div>
                </div>
            </div>
        </div>
    );
};

export default PreviewPanel;
